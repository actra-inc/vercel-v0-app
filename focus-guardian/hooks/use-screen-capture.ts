"use client"

import { useState, useCallback, useRef, useEffect } from "react"

// 複数ディスプレイ対応:
// getDisplayMedia は1回の呼び出しで1つの共有面しか取れない（ブラウザ仕様）。
// そこで呼び出しを複数回行い、最大2本のストリームを同時に保持する。
// キャプチャ時は全ストリームのフレームを1枚のcanvasに横並び合成してから
// onCapture に渡すため、解析APIの呼び出し回数は1画面のときと変わらない。
export const MAX_SCREENS = 2

/** UI表示用の画面ごとの状態 */
export interface ScreenInfo {
  id: string
  /** 表示・合成順のラベル番号（1始まり。合成画像の左から順） */
  label: number
  /** 映像が一時的に供給されていない（スリープ・ウィンドウ非表示等。自動復帰する） */
  paused: boolean
  /** 共有が不意に終了した（ディスプレイ切断等。再共有にはクリックが必要） */
  interrupted: boolean
}

export interface CaptureInfo {
  /** 合成に使った画面数（2以上なら横並び合成画像） */
  screenCount: number
}

interface UseScreenCaptureOptions {
  interval?: number
  quality?: number
  onCapture?: (blob: Blob, info: CaptureInfo) => void
  onError?: (error: Error) => void
  /** ユーザーの停止操作以外でストリームが終了したとき（ディスプレイの接続が外れた等） */
  onInterrupted?: () => void
}

// フレーム取得系のPromiseが永遠に解決しないケース（バックグラウンドタブで
// video の loadedmetadata が発火しない、muted track で grabFrame が pending のまま等）で
// isCapturingRef が true に固着して解析が永久停止するのを防ぐためのタイムアウト
const FRAME_TIMEOUT_MS = 15 * 1000

// 合成画像の長辺の上限（大きすぎる画像は解析APIのペイロードを無駄に膨らませる）
const COMPOSITE_MAX_EDGE = 1600

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

interface StreamEntry {
  id: string
  label: number
  stream: MediaStream
}

let screenIdCounter = 0
const nextScreenId = () => `screen-${++screenIdCounter}-${Date.now()}`

export function useScreenCapture(options: UseScreenCaptureOptions = {}) {
  const { interval = 30000, quality = 0.8, onCapture, onError, onInterrupted } = options

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [lastCaptureTime, setLastCaptureTime] = useState<Date | null>(null)
  // ユーザーが止めたのではなく、共有していた画面が全て消えた状態
  // （外部ディスプレイの取り外し・ブラウザの「共有を停止」など）
  const [isInterrupted, setIsInterrupted] = useState(false)
  // 全アクティブ画面の映像供給が一時停止している状態（復帰すれば自動で解析が続く）
  const [isSourcePaused, setIsSourcePaused] = useState(false)
  // 画面ごとの状態（UIで「画面2が切れた」等を出すため）
  const [screens, setScreens] = useState<ScreenInfo[]>([])

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isCapturingRef = useRef(false)
  const streamsRef = useRef<StreamEntry[]>([])
  // 停止がユーザー起点かどうか。track の 'ended' はどちらでも発火するため、
  // このフラグが無いと「意図的な停止」と「画面が消えた」を区別できない
  const intentionalStopRef = useRef(false)

  // コールバックは ref 経由で常に最新を参照する
  // （トラッキング開始後にタスクやカテゴリを変更しても解析に反映されるように）
  const onCaptureRef = useRef(onCapture)
  const onErrorRef = useRef(onError)
  const onInterruptedRef = useRef(onInterrupted)
  useEffect(() => {
    onCaptureRef.current = onCapture
    onErrorRef.current = onError
    onInterruptedRef.current = onInterrupted
  }, [onCapture, onError, onInterrupted])

  // ---- 内部ユーティリティ --------------------------------------------------

  const syncDerivedState = useCallback(() => {
    const entries = streamsRef.current
    setMediaStream(entries[0]?.stream ?? null)
    setIsTracking(entries.length > 0)
  }, [])

  // 全アクティブ画面がpausedのときだけ全体を「一時停止」とみなす
  const recomputeSourcePaused = useCallback((list: ScreenInfo[]) => {
    const active = list.filter((s) => !s.interrupted)
    setIsSourcePaused(active.length > 0 && active.every((s) => s.paused))
  }, [])

  const updateScreen = useCallback(
    (id: string, patch: Partial<ScreenInfo>) => {
      setScreens((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
        recomputeSourcePaused(next)
        return next
      })
    },
    [recomputeSourcePaused],
  )

  const clearIntervalTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const releaseAll = useCallback(() => {
    streamsRef.current.forEach((e) => e.stream.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
    setMediaStream(null)
    clearIntervalTimer()
    setIsTracking(false)
    setIsCapturing(false)
    setIsSourcePaused(false)
  }, [])

  // ユーザー/アプリからの明示的な停止
  const stopCapture = useCallback(() => {
    intentionalStopRef.current = true
    releaseAll()
    setIsInterrupted(false)
    setScreens([])
    console.log("Screen capture stopped.")
  }, [releaseAll])

  // 1画面ぶんの共有が不意に終了した。
  // 他の画面が残っていれば解析は継続し、切れた画面だけ「中断」として保持する。
  // 全滅した場合は従来どおり全体を中断状態にする。
  // どちらも onInterrupted で通知し、ユーザーが気付けるようにする
  const handleScreenEnded = useCallback(
    (id: string) => {
      if (intentionalStopRef.current) return
      const entry = streamsRef.current.find((e) => e.id === id)
      if (!entry) return // 解放済み（二重発火）
      console.warn(`Screen sharing ended unexpectedly (screen ${entry.label})`)
      entry.stream.getTracks().forEach((t) => t.stop())
      streamsRef.current = streamsRef.current.filter((e) => e.id !== id)
      updateScreen(id, { interrupted: true, paused: false })
      syncDerivedState()

      if (streamsRef.current.length === 0) {
        // 全画面が消えた: 解析を停止し、全体の中断バナーを出す
        clearIntervalTimer()
        setIsCapturing(false)
        setIsSourcePaused(false)
        setIsInterrupted(true)
      }
      onInterruptedRef.current?.()
    },
    [updateScreen, syncDerivedState],
  )

  // 中断表示を閉じる（全体）
  const dismissInterruption = useCallback(() => {
    setIsInterrupted(false)
    setScreens((prev) => prev.filter((s) => !s.interrupted))
  }, [])

  // 中断表示を閉じる（画面単位。再共有しないと決めたとき）
  const dismissScreen = useCallback(
    (id: string) => {
      setScreens((prev) => {
        const next = prev.filter((s) => s.id !== id)
        recomputeSourcePaused(next)
        return next
      })
    },
    [recomputeSourcePaused],
  )

  // アンマウント時（タブ切り替え等）にストリームとインターバルを確実に解放する
  useEffect(() => {
    return () => {
      streamsRef.current.forEach((e) => e.stream.getTracks().forEach((t) => t.stop()))
      streamsRef.current = []
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  // ---- フレーム取得 --------------------------------------------------------

  // 1ストリームぶんのフレームをcanvasとして取得する（従来のcaptureFrameの取得部分）
  const grabFrameCanvas = useCallback(
    async (stream: MediaStream): Promise<HTMLCanvasElement | null> => {
      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) return null

      if (window.ImageCapture && typeof ImageCapture.prototype.grabFrame === "function") {
        try {
          const imageCapture = new ImageCapture(videoTrack)
          const imageBitmap = (await withTimeout(
            imageCapture.grabFrame(),
            FRAME_TIMEOUT_MS,
            "grabFrame",
          )) as ImageBitmap
          const canvas = document.createElement("canvas")
          canvas.width = imageBitmap.width
          canvas.height = imageBitmap.height
          const ctx = canvas.getContext("2d")
          if (ctx) {
            ctx.drawImage(imageBitmap, 0, 0)
            imageBitmap.close()
            return canvas
          }
          imageBitmap.close()
        } catch (e) {
          console.warn("ImageCapture.grabFrame() failed, falling back to video element.", e)
        }
      }

      const video = document.createElement("video")
      video.srcObject = stream
      video.muted = true

      // onloadedmetadata / onerror のどちらも発火しないとこの Promise は
      // 永遠に未解決になり、isCapturingRef が固着する。タイムアウトで必ず決着させる
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => {
            video
              .play()
              .then(() => setTimeout(resolve, 100))
              .catch(reject)
          }
          video.onerror = () => reject(new Error("video element error"))
        }),
        FRAME_TIMEOUT_MS,
        "video metadata",
      )

      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.drawImage(video, 0, 0)
      video.srcObject = null
      return ctx ? canvas : null
    },
    [],
  )

  const canvasToBlob = useCallback(
    (canvas: HTMLCanvasElement): Promise<Blob | null> =>
      new Promise((resolve) => canvas.toBlob(resolve, "image/png", quality)),
    [quality],
  )

  // 複数画面を1枚に横並び合成する。
  // 各パネルの左上にラベル（画面1/画面2）を描き、境界に区切り線を入れる。
  // ラベル文字列は解析プロンプト側の「左が画面1、右が画面2」という説明と
  // 対応させるためのもので、UI文言ではない（解析プロンプトは日本語固定）
  const composeFrames = useCallback(
    async (frames: Array<{ canvas: HTMLCanvasElement; label: number }>): Promise<Blob | null> => {
      const DIVIDER = 4
      const totalWidth =
        frames.reduce((sum, f) => sum + f.canvas.width, 0) + DIVIDER * (frames.length - 1)
      const maxHeight = Math.max(...frames.map((f) => f.canvas.height))
      const scale = Math.min(1, COMPOSITE_MAX_EDGE / Math.max(totalWidth, maxHeight))

      const out = document.createElement("canvas")
      out.width = Math.max(1, Math.round(totalWidth * scale))
      out.height = Math.max(1, Math.round(maxHeight * scale))
      const ctx = out.getContext("2d")
      if (!ctx) return null

      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, out.width, out.height)

      let x = 0
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]
        const w = Math.round(f.canvas.width * scale)
        const h = Math.round(f.canvas.height * scale)
        ctx.drawImage(f.canvas, x, 0, w, h)

        // ラベル（左上に「画面N」）
        const fontSize = Math.max(14, Math.round(out.height * 0.03))
        ctx.font = `bold ${fontSize}px sans-serif`
        const text = `画面${f.label}`
        const metrics = ctx.measureText(text)
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
        ctx.fillRect(x + 4, 4, metrics.width + 12, fontSize + 10)
        ctx.fillStyle = "#fff"
        ctx.fillText(text, x + 10, 4 + fontSize + 2)

        x += w
        if (i < frames.length - 1) {
          // 区切り線
          ctx.fillStyle = "#f59e0b"
          ctx.fillRect(x, 0, Math.max(1, Math.round(DIVIDER * scale)), out.height)
          x += Math.max(1, Math.round(DIVIDER * scale))
        }
      }
      return canvasToBlob(out)
    },
    [canvasToBlob],
  )

  // 全アクティブ画面をキャプチャして1枚のBlobにする。
  // 1画面のときは合成もラベル描画も行わず、従来と同一の出力にする
  const captureTick = useCallback(async () => {
    if (isCapturingRef.current) {
      console.log("Capture already in progress, skipping.")
      return
    }
    // 消えたストリームを先に整理する
    for (const entry of [...streamsRef.current]) {
      if (!entry.stream.active) handleScreenEnded(entry.id)
    }
    const entries = [...streamsRef.current].sort((a, b) => a.label - b.label)
    if (entries.length === 0) return

    // 供給が止まっている画面はスキップ（真っ黒な画像で無料枠とログを消費しない）。
    // 全画面が止まっていればこの回は見送る（復帰後の回で撮り直す）
    const live = entries.filter((e) => {
      const track = e.stream.getVideoTracks()[0]
      return track && !track.muted
    })
    if (live.length === 0) {
      console.log("All video tracks are muted (display asleep etc.), skipping capture.")
      return
    }

    isCapturingRef.current = true
    setIsCapturing(true)
    try {
      const frames: Array<{ canvas: HTMLCanvasElement; label: number }> = []
      let lastError: Error | null = null
      for (const e of live) {
        try {
          const canvas = await grabFrameCanvas(e.stream)
          if (canvas && canvas.width > 0 && canvas.height > 0) {
            frames.push({ canvas, label: e.label })
          }
        } catch (err) {
          console.error(`Failed to capture frame for screen ${e.label}:`, err)
          lastError = err as Error
        }
      }

      if (frames.length === 0) {
        // 全画面の取得に失敗したときだけエラー通知（片方だけの失敗は次回に任せる）
        if (lastError) onErrorRef.current?.(lastError)
        return
      }

      const blob =
        frames.length === 1 ? await canvasToBlob(frames[0].canvas) : await composeFrames(frames)
      if (blob) {
        setLastCaptureTime(new Date())
        onCaptureRef.current?.(blob, { screenCount: frames.length })
      }
    } catch (error) {
      console.error("Failed to capture frame:", error)
      onErrorRef.current?.(error as Error)
    } finally {
      setIsCapturing(false)
      isCapturingRef.current = false
    }
  }, [grabFrameCanvas, canvasToBlob, composeFrames, handleScreenEnded])

  // インターバルからは常に最新のcaptureTickを呼ぶ（クロージャの固定を避ける）
  const tickRef = useRef(captureTick)
  useEffect(() => {
    tickRef.current = captureTick
  }, [captureTick])

  const startIntervalTimer = useCallback((ms: number) => {
    clearIntervalTimer()
    intervalRef.current = setInterval(() => {
      tickRef.current()
    }, ms)
  }, [])

  // トラッキング中にキャプチャ間隔の設定が変わったら、実際の周期にも反映する。
  // setInterval は開始時の interval を閉じ込めるため、この張り替えが無いと
  // バッジや「次回キャプチャ」表示（新しい値を即時反映）と実周期が食い違ったまま
  // 停止/再開まで続いてしまう
  useEffect(() => {
    if (streamsRef.current.length === 0 || !intervalRef.current) return
    console.log(`Capture interval changed; rescheduling every ${interval}ms`)
    startIntervalTimer(interval)
  }, [interval, startIntervalTimer])

  // ---- 画面の追加・登録 ----------------------------------------------------

  const attachStreamListeners = useCallback(
    (entry: StreamEntry) => {
      const videoTrack = entry.stream.getVideoTracks()[0]
      if (!videoTrack) return
      // 共有停止・共有面の消失（ディスプレイを外した等）のどちらでも発火する。
      // 意図的な停止かどうかは intentionalStopRef で見分ける
      videoTrack.addEventListener("ended", () => {
        console.log(`Screen sharing track ended (screen ${entry.label})`)
        handleScreenEnded(entry.id)
      })
      // 一時的に映像が供給されない状態（ディスプレイのスリープ等）。
      // トラックは生きているため、復帰時に自動で解析が続く
      videoTrack.addEventListener("mute", () => {
        console.log(`Screen ${entry.label} muted (source temporarily unavailable)`)
        updateScreen(entry.id, { paused: true })
      })
      videoTrack.addEventListener("unmute", () => {
        console.log(`Screen ${entry.label} unmuted (source available again)`)
        updateScreen(entry.id, { paused: false })
      })
    },
    [handleScreenEnded, updateScreen],
  )

  const requestDisplayStream = useCallback(async (): Promise<MediaStream> => {
    // 重要: この関数は必ずユーザーのクリックイベントから直接呼び出される必要がある
    // setTimeout や Promise.then の中から呼び出すとダイアログが表示されない
    return navigator.mediaDevices.getDisplayMedia({
      video: {
        mediaSource: "screen" as any,
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 1, max: 5 },
      },
      audio: false,
    })
  }, [])

  const registerStream = useCallback(
    (stream: MediaStream, label: number): StreamEntry => {
      const entry: StreamEntry = { id: nextScreenId(), label, stream }
      streamsRef.current = [...streamsRef.current, entry]
      attachStreamListeners(entry)
      const videoTrack = stream.getVideoTracks()[0]
      setScreens((prev) => {
        // 再共有で置き換わるため、中断中のプレースホルダは取り除く
        const next = [
          ...prev.filter((s) => !s.interrupted),
          { id: entry.id, label, paused: Boolean(videoTrack?.muted), interrupted: false },
        ].sort((a, b) => a.label - b.label)
        recomputeSourcePaused(next)
        return next
      })
      syncDerivedState()
      return entry
    },
    [attachStreamListeners, recomputeSourcePaused, syncDerivedState],
  )

  // 解析中に2枚目の画面を追加する。
  // 必ずユーザーのクリックから直接呼ぶこと（共有ピッカーの制約）。
  // 追加できない環境（Safari等）でも例外を外に出さず false を返し、
  // 既存画面の解析はそのまま続く
  const addScreen = useCallback(async (): Promise<boolean> => {
    if (streamsRef.current.length === 0) {
      console.warn("addScreen called while not tracking; ignoring")
      return false
    }
    if (streamsRef.current.length >= MAX_SCREENS) {
      console.warn(`Already tracking ${MAX_SCREENS} screens; ignoring addScreen`)
      return false
    }
    try {
      const stream = await requestDisplayStream()
      // 空いている最小のラベルを割り当てる（画面1が切れて再共有した場合は1に戻る）
      const used = new Set(streamsRef.current.map((e) => e.label))
      let label = 1
      while (used.has(label)) label++
      registerStream(stream, label)
      console.log(`✅ Added screen ${label} (${streamsRef.current.length} screens now)`)
      // すぐ1枚撮って反映する（次のインターバルを待たない）
      tickRef.current()
      return true
    } catch (error) {
      // キャンセル(AbortError)は正常系。その他も1画面運用へフォールバックする
      if (error instanceof DOMException && error.name === "AbortError") {
        console.log("User cancelled adding a screen")
      } else {
        console.warn("Failed to add a screen; continuing with current screens:", error)
        onErrorRef.current?.(error as Error)
      }
      return false
    }
  }, [requestDisplayStream, registerStream])

  // 追加した画面を解除する（ユーザー操作。中断扱いにしない）
  const removeScreen = useCallback(
    (id: string) => {
      const entry = streamsRef.current.find((e) => e.id === id)
      if (!entry) return
      // track.stop() では 'ended' は発火しないため中断ハンドラは走らない
      entry.stream.getTracks().forEach((t) => t.stop())
      streamsRef.current = streamsRef.current.filter((e) => e.id !== id)
      setScreens((prev) => {
        const next = prev.filter((s) => s.id !== id)
        recomputeSourcePaused(next)
        return next
      })
      syncDerivedState()
      console.log(`Screen ${entry.label} removed (${streamsRef.current.length} screens now)`)
      if (streamsRef.current.length === 0) {
        // 最後の1枚を解除したら全体停止と同じ扱い
        stopCapture()
      }
    },
    [recomputeSourcePaused, syncDerivedState, stopCapture],
  )

  // ---- ブラウザサポート・開始 ----------------------------------------------

  const checkBrowserSupport = useCallback(() => {
    // HTTPS必須チェック
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      return {
        supported: false,
        reason: "HTTPS接続が必要です。HTTPSでアクセスしてください。",
      }
    }

    // getDisplayMedia API サポートチェック
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      return {
        supported: false,
        reason:
          "このブラウザは画面共有をサポートしていません。Chrome 72+、Firefox 66+、Safari 13+、Edge 79+ をお使いください。",
      }
    }

    // Secure Context チェック
    if (!window.isSecureContext) {
      return {
        supported: false,
        reason: "セキュアコンテキストが必要です。HTTPSでアクセスするか、localhostを使用してください。",
      }
    }

    return { supported: true, reason: "" }
  }, [])

  // ユーザーアクションから直接呼び出される関数
  // 開始できたかどうかを返す（キャンセル・失敗時に呼び出し側がセッションを記録しないように）
  const startAutoCapture = useCallback(async (): Promise<boolean> => {
    // 共有ピッカーが非モーダルなブラウザで開始ボタンを連打すると、
    // ストリームと interval が多重に張られてリークする
    if (streamsRef.current.length > 0) {
      console.warn("Screen capture already running; ignoring duplicate start request")
      return true
    }
    // 中断表示は「実際に共有を取り直せたとき」に消す。
    // ここで消すと、共有ピッカーをキャンセルしただけで再開導線が消えてしまう
    intentionalStopRef.current = false
    console.log("=== Screen Capture Start Requested ===")
    console.log("User agent:", navigator.userAgent)
    console.log("Location:", location.href)
    console.log("Is secure context:", window.isSecureContext)

    // ブラウザサポートチェック
    const supportCheck = checkBrowserSupport()
    if (!supportCheck.supported) {
      const error = new Error(supportCheck.reason)
      onErrorRef.current?.(error)
      alert(supportCheck.reason)
      return false
    }

    try {
      console.log("Requesting display media with getDisplayMedia...")
      const stream = await requestDisplayStream()

      console.log("✅ Display media obtained successfully")
      console.log(
        "Stream tracks:",
        stream.getTracks().map((t) => ({ kind: t.kind, label: t.label })),
      )

      setScreens([])
      registerStream(stream, 1)
      setIsInterrupted(false)

      // 最初のフレームをキャプチャ
      console.log("Capturing first frame...")
      await captureTick()

      // 定期キャプチャの開始
      console.log(`Starting interval capture every ${interval}ms`)
      startIntervalTimer(interval)

      console.log("✅ Screen capture started successfully")
      return true
    } catch (error) {
      console.error("❌ Failed to get display media:", error)
      console.error("Error details:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      onErrorRef.current?.(error as Error)

      if (error instanceof DOMException) {
        switch (error.name) {
          case "NotAllowedError":
            alert(
              "画面共有が拒否されました。\n\n" +
                "📋 対処法:\n" +
                "1. ブラウザの画面共有許可ダイアログで「許可」をクリック\n" +
                "2. macOSの場合: システム設定 > プライバシーとセキュリティ > 画面収録 でブラウザを許可\n" +
                "3. ページを再読み込みして再試行\n\n" +
                "💡 ヒント: ダイアログが表示されない場合は、ブラウザの設定で画面共有がブロックされている可能性があります。",
            )
            break
          case "NotFoundError":
            alert("共有可能な画面が見つかりませんでした。")
            break
          case "NotSupportedError":
            alert(
              "このブラウザでは画面共有がサポートされていません。\n\n" +
                "対応ブラウザ:\n" +
                "• Chrome 72+\n" +
                "• Firefox 66+\n" +
                "• Safari 13+\n" +
                "• Edge 79+",
            )
            break
          case "SecurityError":
            alert(
              "セキュリティエラーが発生しました。\n\n" +
                "HTTPS接続でアクセスしてください。\n" +
                "localhostの場合はHTTPでも動作します。",
            )
            break
          case "AbortError":
            console.log("User cancelled screen sharing")
            // ユーザーがキャンセルした場合はアラートを表示しない
            break
          case "InvalidStateError":
            alert("画面共有の状態が無効です。\n\n" + "ブラウザを再読み込みして再試行してください。")
            break
          case "TypeError":
            alert("画面共有の設定に問題があります。\n\n" + "ブラウザを更新して再試行してください。")
            break
          default:
            alert(
              `画面共有エラー: ${error.message}\n\n` +
                "ブラウザを再読み込みして再試行してください。\n\n" +
                "問題が続く場合は、別のブラウザをお試しください。",
            )
        }
      } else {
        alert(
          "画面共有の開始に失敗しました。\n\n" +
            "1. ブラウザを再読み込み\n" +
            "2. HTTPSでアクセス\n" +
            "3. 対応ブラウザを使用\n\n" +
            "してから再試行してください。",
        )
      }

      setIsTracking(false)
      return false
    }
  }, [interval, checkBrowserSupport, requestDisplayStream, registerStream, captureTick, startIntervalTimer])

  return {
    mediaStream,
    isTracking,
    isCapturing,
    isInterrupted,
    isSourcePaused,
    lastCaptureTime,
    screens,
    startAutoCapture,
    addScreen,
    removeScreen,
    stopCapture,
    dismissInterruption,
    dismissScreen,
  }
}

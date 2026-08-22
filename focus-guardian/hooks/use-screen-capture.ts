"use client"

import { useState, useCallback, useRef, useEffect } from "react"

interface UseScreenCaptureOptions {
  interval?: number
  quality?: number
  onCapture?: (blob: Blob) => void
  onError?: (error: Error) => void
}

// フレーム取得系のPromiseが永遠に解決しないケース（バックグラウンドタブで
// video の loadedmetadata が発火しない、muted track で grabFrame が pending のまま等）で
// isCapturingRef が true に固着して解析が永久停止するのを防ぐためのタイムアウト
const FRAME_TIMEOUT_MS = 15 * 1000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

export function useScreenCapture(options: UseScreenCaptureOptions = {}) {
  const { interval = 30000, quality = 0.8, onCapture, onError } = options

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [lastCaptureTime, setLastCaptureTime] = useState<Date | null>(null)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isCapturingRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)

  // コールバックは ref 経由で常に最新を参照する
  // （トラッキング開始後にタスクやカテゴリを変更しても解析に反映されるように）
  const onCaptureRef = useRef(onCapture)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onCaptureRef.current = onCapture
    onErrorRef.current = onError
  }, [onCapture, onError])

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setMediaStream(null)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsTracking(false)
    setIsCapturing(false)
    console.log("Screen capture stopped.")
  }, [])

  // アンマウント時（タブ切り替え等）にストリームとインターバルを確実に解放する
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  const captureFrame = useCallback(
    async (stream: MediaStream): Promise<Blob | null> => {
      if (!stream.active) {
        console.error("Stream is not active. Stopping capture.")
        stopCapture()
        return null
      }

      if (isCapturingRef.current) {
        console.log("Capture already in progress, skipping.")
        return null
      }

      isCapturingRef.current = true
      setIsCapturing(true)

      try {
        const videoTrack = stream.getVideoTracks()[0]
        let blob: Blob | null = null

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
              blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", quality))
            }
            imageBitmap.close()
          } catch (e) {
            console.warn("ImageCapture.grabFrame() failed, falling back to video element.", e)
          }
        }

        if (!blob) {
          const video = document.createElement("video")
          video.srcObject = stream
          video.muted = true

          // onloadedmetadata / onerror のどちらも発火しないとこの Promise は
          // 永遠に未解決になり、finally が走らず isCapturingRef が固着する。
          // タイムアウトで必ず決着させる
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
          if (ctx) {
            ctx.drawImage(video, 0, 0)
            blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", quality))
          }
          video.srcObject = null
        }

        if (blob) {
          setLastCaptureTime(new Date())
          onCaptureRef.current?.(blob)
          return blob
        }
        return null
      } catch (error) {
        console.error("Failed to capture frame:", error)
        onErrorRef.current?.(error as Error)
        return null
      } finally {
        setIsCapturing(false)
        isCapturingRef.current = false
      }
    },
    [quality, stopCapture],
  )

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
    if (streamRef.current) {
      console.warn("Screen capture already running; ignoring duplicate start request")
      return true
    }
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

      // 重要: この関数は必ずユーザーのクリックイベントから直接呼び出される必要がある
      // setTimeout や Promise.then の中から呼び出すとダイアログが表示されない
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: "screen" as any,
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 1, max: 5 },
        },
        audio: false,
      })

      console.log("✅ Display media obtained successfully")
      console.log(
        "Stream tracks:",
        stream.getTracks().map((t) => ({ kind: t.kind, label: t.label })),
      )

      streamRef.current = stream
      setMediaStream(stream)
      setIsTracking(true)

      // ストリーム終了イベントの監視
      const videoTrack = stream.getVideoTracks()[0]
      videoTrack.addEventListener("ended", () => {
        console.log("Screen sharing was stopped by the user")
        stopCapture()
      })

      // 最初のフレームをキャプチャ
      console.log("Capturing first frame...")
      await captureFrame(stream)

      // 定期キャプチャの開始
      console.log(`Starting interval capture every ${interval}ms`)
      intervalRef.current = setInterval(() => {
        if (stream.active) {
          captureFrame(stream)
        } else {
          console.log("Stream is no longer active, stopping capture")
          stopCapture()
        }
      }, interval)

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
  }, [interval, stopCapture, captureFrame, checkBrowserSupport])

  return {
    mediaStream,
    isTracking,
    isCapturing,
    lastCaptureTime,
    startAutoCapture,
    stopCapture,
  }
}

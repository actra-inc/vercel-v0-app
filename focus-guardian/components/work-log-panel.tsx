"use client"

import type React from "react"

import { useRef, useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Upload, Play, Pause, Camera, Zap, Trash2, AlertCircle } from "lucide-react"
import { WorkLogItem } from "@/components/work-log-item"
import { AIAnalysisStatus } from "@/components/ai-analysis-status"
import { AudioPermissionManager } from "@/components/audio-permission-manager"
import { NotificationPermissionManager } from "@/components/notification-permission-manager"
import { showDistractionNotification } from "@/lib/notification"
import { useScreenCapture } from "@/hooks/use-screen-capture"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/lib/i18n"
import type { ActivityCategory } from "@/components/activity-breakdown"

interface DistractionCheck {
  is_distracted: boolean
  reason: string
  planned_task: string
  severity: "high" | "medium" | "low"
}

interface ReportData {
  summary: string
  productivity_analysis: string
  focus_trend: string
  distraction_summary: string
  time_distribution: {
    productive_time: number
    distracted_time: number
    neutral_time: number
  }
  key_findings: string[]
  recommendations: string[]
  overall_score: number
}

interface WorkLogEntry {
  id: string
  timestamp: Date
  activity: string
  category: "productive" | "distracted" | "neutral"
  details: string
  screenshot_url?: string
  confidence?: number
  applications?: string[]
  focus_score?: number
  distraction_check?: DistractionCheck
  report_type?: string
  report_data?: ReportData
}

interface WorkLogPanelProps {
  currentTask: string
  apiKey: string
  model: string
  captureInterval: number
  workLogs: WorkLogEntry[]
  categories: ActivityCategory[]
  addWorkLog: (log: any) => Promise<any>
  clearWorkLogs: () => Promise<{ dbDeleteFailed: boolean } | void>
  onTrackingChange?: (isTracking: boolean, startTime: Date | null) => void
}

export function WorkLogPanel({
  currentTask,
  apiKey,
  model,
  captureInterval,
  workLogs,
  categories,
  addWorkLog,
  clearWorkLogs,
  onTrackingChange,
}: WorkLogPanelProps) {
  const { t, language } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isApiKeyValid, setIsApiKeyValid] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [lastAnalysisError, setLastAnalysisError] = useState<string | null>(null)
  const prevImageDataRef = useRef<ImageData | null>(null)
  // 解析の再入ガード（解析がキャプチャ間隔より長引いたとき、intervalの
  // 次ティックから並行実行されて重複ログ・基準画像のレースが起きるのを防ぐ。
  // isAnalyzing state はUI表示用で、非同期更新のためガードには使えない）
  const analyzingRef = useRef(false)
  // 429（quota超過）後のクールダウン期限。期限内は解析APIを呼ばない
  // （枯渇したAPIを30秒ごとに叩き続ける無駄打ちを防ぐ）
  const cooldownUntilRef = useRef(0)
  // 差分スキップの可視化と強制解析（静的画面で解析が無音停止して見える問題への対応）
  const consecutiveSkipsRef = useRef(0)
  const [skipStreak, setSkipStreak] = useState(0)

  const resizeAndEncodeImage = useCallback(async (blob: Blob, maxWidth: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / img.width)
          const canvas = document.createElement("canvas")
          canvas.width = Math.floor(img.width * scale)
          canvas.height = Math.floor(img.height * scale)
          const ctx = canvas.getContext("2d")
          if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas context unavailable")); return }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7)
          resolve(dataUrl.split(",")[1])
        } catch (e) {
          URL.revokeObjectURL(url)
          reject(e)
        }
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load captured image for encoding")) }
      img.src = url
    })
  }, [])

  const getImageData = useCallback(async (blob: Blob): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        // onload内で例外が投げられるとPromiseが未解決のまま固まるため必ずtry/catchで決着させる
        try {
          const canvas = document.createElement("canvas")
          canvas.width = 64
          canvas.height = 36
          const ctx = canvas.getContext("2d")
          if (!ctx) throw new Error("Canvas context unavailable")
          ctx.drawImage(img, 0, 0, 64, 36)
          resolve(ctx.getImageData(0, 0, 64, 36))
        } catch (e) {
          reject(e)
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      // 読み込み失敗時にPromiseが未解決のまま解析が固まるのを防ぐ
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error("Failed to load captured image"))
      }
      img.src = url
    })
  }, [])

  const calculateDiff = useCallback((a: ImageData, b: ImageData): number => {
    let diff = 0
    for (let i = 0; i < a.data.length; i += 4) {
      diff += Math.abs(a.data[i] - b.data[i])
      diff += Math.abs(a.data[i + 1] - b.data[i + 1])
      diff += Math.abs(a.data[i + 2] - b.data[i + 2])
    }
    return diff / ((a.data.length / 4) * 3 * 255)
  }, [])

  const logCountRef = useRef<number | null>(null)
  const hasAutoGeneratedRef = useRef(new Set<string>())

  useEffect(() => {
    const isValid = Boolean(apiKey && apiKey.trim().length > 0)
    setIsApiKeyValid(isValid)
  }, [apiKey])

  useEffect(() => {
    const regularLogs = workLogs.filter((log) => !log.report_type)
    const newLogCount = regularLogs.length
    const prevCount = logCountRef.current
    logCountRef.current = newLogCount

    // 初回観測（ページ読み込み時の一括ロード）や複数件の一括反映では生成しない。
    // 新規ログが1件ずつ追加され、3の倍数に達したときだけレポートを生成する
    // （以前はリロードのたびに既存ログ数だけで発火し、レポートが重複生成されていた）
    if (prevCount === null || newLogCount !== prevCount + 1) return

    if (newLogCount % 3 === 0) {
      const reportKey = `report-${newLogCount}`

      if (!hasAutoGeneratedRef.current.has(reportKey)) {
        console.log("📊 Auto-generating report after 3 new logs...")
        hasAutoGeneratedRef.current.add(reportKey)
        handleAutoGenerateReport(regularLogs, reportKey)
      }
    }
  }, [workLogs.length]) // 依存配列を workLogs.length のみにして安定化

  // 連続スキップがこの回数に達したら、画面が変わっていなくても強制的に解析する
  // （完全に静的な画面では基準画像が更新されず、永久にスキップされ続けるため）
  const FORCE_ANALYZE_AFTER_SKIPS = 10

  const analyzeScreenshot = useCallback(
    async (blob: Blob, opts?: { force?: boolean }) => {
      if (!apiKey) {
        console.error("❌ API key not available")
        return
      }

      // 429クールダウン中は解析を呼ばない（手動アップロードは意図的な操作なのでバイパス）
      if (!opts?.force && Date.now() < cooldownUntilRef.current) {
        console.log("[v0] In quota cooldown, skipping analysis until", new Date(cooldownUntilRef.current).toISOString())
        return
      }

      // 再入ガード: 前回の解析が終わるまで次のキャプチャは捨てる
      if (analyzingRef.current) {
        console.log("[v0] Analysis already in progress, skipping this capture")
        return
      }
      analyzingRef.current = true
      setIsAnalyzing(true)

      try {
        // 前回と画面が変わっていなければAPIをスキップ（閾値2%）。
        // 手動アップロード時（opts.force）は差分チェックをバイパスする
        const currentImageData = await getImageData(blob)
        if (!opts?.force && prevImageDataRef.current) {
          const diff = calculateDiff(prevImageDataRef.current, currentImageData)
          if (diff < 0.02 && consecutiveSkipsRef.current < FORCE_ANALYZE_AFTER_SKIPS - 1) {
            consecutiveSkipsRef.current += 1
            setSkipStreak(consecutiveSkipsRef.current)
            console.log(`[v0] Screen unchanged (diff=${(diff * 100).toFixed(1)}%), skipping API call (streak=${consecutiveSkipsRef.current})`)
            return
          }
          if (diff < 0.02) {
            console.log(`[v0] Screen unchanged but forcing analysis after ${consecutiveSkipsRef.current + 1} consecutive skips`)
          } else {
            console.log(`[v0] Screen changed (diff=${(diff * 100).toFixed(1)}%), calling API`)
          }
        }
        consecutiveSkipsRef.current = 0
        setSkipStreak(0)

        // 画像をリサイズしてbase64エンコード
        console.log("🖼️ Resizing and encoding screenshot...")
        const imageData = await resizeAndEncodeImage(blob, 768)

        const formData = new FormData()
        formData.append("imageData", imageData)
        formData.append("mimeType", "image/jpeg")
        formData.append("apiKey", apiKey)
        formData.append("currentTask", currentTask || t('wlp_working'))
        formData.append("categories", JSON.stringify(categories))
        // 設定画面で選んだ解析モデルをサーバーに渡す（未設定ならサーバー既定）
        if (model) formData.append("model", model)

        console.log("[v0] Sending image to /api/analyze-screenshot")

        const response = await fetch("/api/analyze-screenshot", {
          method: "POST",
          body: formData,
          // ハング時に isAnalyzing が固着しないようタイムアウトを設ける
          signal: AbortSignal.timeout(60 * 1000),
        })

        console.log("[v0] Response status:", response.status)
        console.log("[v0] Response ok:", response.ok)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error("[v0] API error response:", errorData)

          if (errorData.error === "quota_exceeded") {
            // alert()はメインスレッドをブロックするため使わない。
            // クールダウンを設定して期限まで解析APIを呼ばない:
            //  - retryAfter（例: "27s"）あり = 分単位の一時制限 → その秒数（下限60秒）
            //  - なし = 日次上限（RPD）の可能性が高い → 15分待って再確認
            const delayMatch = /^(\d+)/.exec(String(errorData.retryAfter ?? ""))
            const cooldownMs = delayMatch
              ? Math.max(Number(delayMatch[1]), 60) * 1000
              : 15 * 60 * 1000
            cooldownUntilRef.current = Date.now() + cooldownMs
            const resumeAt = new Date(cooldownUntilRef.current).toLocaleTimeString(
              language === "ja" ? "ja-JP" : "en-US",
              { hour: "2-digit", minute: "2-digit" },
            )
            setLastAnalysisError(t('wlp_errQuotaCooldown', { time: resumeAt }))
            return
          }

          // 503/502はサーバー一時過負荷 → インライン表示してスキップ
          if (response.status === 503 || response.status === 502) {
            console.warn(`⚠️ Gemini API temporarily unavailable (${response.status})`)
            setLastAnalysisError(t('wlp_errTemporary', { status: response.status }))
            return
          }

          throw new Error(errorData.message || `API error: ${response.status}`)
        }

        const result = await response.json()
        console.log("[v0] Analysis result:", result)

        if (result.error) {
          throw new Error(result.error)
        }

        setLastAnalysisError(null)
        cooldownUntilRef.current = 0
        const imageUrl = URL.createObjectURL(blob)

        const logEntry = {
          timestamp: new Date().toISOString(),
          activity: result.activity || t('wlp_unknownActivity'),
          category: result.category || "neutral",
          details: result.details || t('wlp_noDetails'),
          screenshot_url: imageUrl,
          confidence: result.confidence || 0,
          applications: result.applications || [],
          focus_score: result.focus_score || 0,
          distraction_check: result.distraction_check || null,
          work_category: result.work_category || t('wlp_other'),
        }

        console.log("[v0] Adding work log entry:", logEntry)

        const saved = await addWorkLog(logEntry)
        if (saved) {
          // ログ保存まで成功してから比較ベースを更新する
          // （保存失敗時は次回同じ画面でもスキップされず、記録の欠落を防げる。
          //   addWorkLog はネットワーク系エラーで throw せず null を返すため、
          //   戻り値で判定しないとこのガードが機能しない）
          prevImageDataRef.current = currentImageData
        } else {
          console.warn("⚠️ Work log save returned null; keeping previous diff baseline for retry")
          setLastAnalysisError(t('wlp_errSaveFailed'))
        }

        // 脱線検知時に自動アラート音 + ブラウザ通知
        if (result.distraction_check?.is_distracted) {
          console.log("🚨 Distraction detected! Playing alert sound...")
          playAlertSound()
          showDistractionNotification({
            title: t('notif_distractionTitle'),
            body: currentTask
              ? t('notif_distractionBody', { task: currentTask })
              : t('notif_distractionBodyNoTask'),
          })
        }

        console.log("✅ Work log added successfully")
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "不明なエラー"
        const isAbort =
          error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
        // ネットワーク一時エラー・タイムアウトはインライン表示のみで次回に任せる
        if (isAbort || errorMessage.includes("Failed to fetch") || errorMessage.includes("fetch")) {
          console.warn("⚠️ Network error (work log save):", errorMessage)
          setLastAnalysisError(t('wlp_errNetwork'))
        } else {
          console.error("❌ Analysis error:", error)
          // 想定外エラーもモーダルで止めず、解析継続中であることを添えて表示する
          setLastAnalysisError(t('wlp_errUnexpected', { msg: errorMessage }))
        }
      } finally {
        analyzingRef.current = false
        setIsAnalyzing(false)
      }
    },
    [apiKey, currentTask, model, addWorkLog, resizeAndEncodeImage, categories, t, language],
  ) // 必要最小限の依存関係のみ

  const handleAutoGenerateReport = useCallback(
    async (regularLogs: WorkLogEntry[], reportKey?: string) => {
      if (!apiKey || regularLogs.length < 3) {
        return
      }

      try {
        console.log("📊 Auto-generating summary report...")

        const response = await fetch("/api/generate-summary-report", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workLogs: regularLogs.slice(0, 3), // workLogsは新しい順なので先頭3件が最新
            apiKey,
            // 利用者のタイムゾーンでレポート内の時刻を整形させる
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            // model は意図的に送らない。レポート生成はサーバー既定の Gemma を使い、
            // 解析モデル（Gemini）とは無料枠のバケットを分離して長時間運用を優先する
          }),
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const reportData = await response.json()
        console.log("✅ Report generated:", reportData)

        const sourceLogs = regularLogs.slice(0, 3)
        const sourceScreenshots = sourceLogs
          .map(log => log.screenshot_url)
          .filter((url): url is string => typeof url === "string" && url.length > 0)

        await addWorkLog({
          timestamp: new Date().toISOString(),
          activity: t('wlp_autoReport'),
          category: "neutral",
          details: reportData.summary,
          report_type: "summary",
          report_data: { ...reportData, source_screenshots: sourceScreenshots },
        })

        console.log("✅ Auto-generated report added to logs")
      } catch (error) {
        console.error("❌ Auto report generation error:", error)
        // 一過性エラーでこの節目のレポートが永久に失われないよう、キーを解放して
        // 次のログ追加時に再試行できるようにする
        if (reportKey) hasAutoGeneratedRef.current.delete(reportKey)
      }
    },
    [apiKey, model, addWorkLog],
  ) // 必要最小限の依存関係のみ

  const handleCapture = useCallback(
    (blob: Blob) => {
      console.log("📸 Screenshot captured, starting analysis...")
      analyzeScreenshot(blob)
    },
    [analyzeScreenshot],
  )

  const handleError = useCallback((error: Error) => {
    console.error("❌ Screen capture error:", error)
    // 共有ダイアログのキャンセル(AbortError)・拒否(NotAllowedError)は開始前の
    // ユーザー操作起点エラーで、useScreenCapture 側が適切に案内する（キャンセルは無通知）。
    // ここで「次回キャプチャで再試行します」と出すと虚偽になるためスキップする
    if (error.name === "AbortError" || error.name === "NotAllowedError") return
    // キャプチャ失敗は次回インターバルで再試行される。ストリーム自体が死んだ場合は
    // useScreenCapture 側が stopCapture するのでステータス表示が「停止中」に変わる。
    setLastAnalysisError(t('wlp_errCapture', { msg: error.message }))
  }, [])

  const handleScreenshotUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        const file = event.target.files[0]
        const reader = new FileReader()

        reader.onload = (e) => {
          if (e.target && e.target.result) {
            const blob = new Blob([e.target.result], { type: file.type })
            // 手動アップロードは画面差分と無関係な画像なので差分スキップをバイパスする
            analyzeScreenshot(blob, { force: true })
          }
        }

        reader.readAsArrayBuffer(file)
        // 同じファイルを続けて選択してもonChangeが発火するようリセット
        event.target.value = ""
      }
    },
    [analyzeScreenshot],
  )

  const { isTracking, isCapturing, lastCaptureTime, startAutoCapture, stopCapture } = useScreenCapture({
    interval: captureInterval * 1000,
    quality: 0.8,
    onCapture: handleCapture,
    onError: handleError,
  })

  // 実際のトラッキング状態の変化だけを親に通知する。
  // ボタン操作時に手動で通知していたため、
  //  ・共有ダイアログをキャンセルしても「開始」扱いになる
  //  ・ブラウザの「共有を停止」で止めたときに「停止」が通知されない
  // という取りこぼしがあった。
  const prevTrackingRef = useRef(false)
  useEffect(() => {
    if (prevTrackingRef.current === isTracking) return
    prevTrackingRef.current = isTracking
    onTrackingChange?.(isTracking, isTracking ? new Date() : null)
  }, [isTracking, onTrackingChange])

  const handleToggleTracking = async () => {
    if (isTracking) {
      console.log("⏹️ Stopping screen capture...")
      stopCapture()
    } else {
      console.log("▶️ Starting screen capture...")
      await startAutoCapture()
    }
  }

  const playAlertSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      for (let i = 0; i < 2; i++) {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator()
          const gainNode = audioContext.createGain()

          oscillator.connect(gainNode)
          gainNode.connect(audioContext.destination)

          oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.15)

          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

          oscillator.start(audioContext.currentTime)
          oscillator.stop(audioContext.currentTime + 0.3)
        }, i * 400)
      }

      // 再生完了後にAudioContextを解放（作りっぱなしだとブラウザの上限に達して音が鳴らなくなる）
      setTimeout(() => {
        audioContext.close().catch(() => {})
      }, 1200)
    } catch (error) {
      console.error("❌ Failed to play alert sound:", error)
    }
  }

  const onPlayAlert = () => {
    playAlertSound()
  }

  const onClearLogs = async () => {
    if (confirm(t('wlp_clearAllConfirm'))) {
      const result = await clearWorkLogs()
      logCountRef.current = 0
      hasAutoGeneratedRef.current.clear()
      // DBの削除が0件（RLSのDELETEポリシー未設定など）の場合は画面上は消えても
      // DBに残っていることを知らせる
      if (result && result.dbDeleteFailed) {
        alert(t('rt_deleteNoPermission'))
      }
    }
  }

  const stats = useMemo(() => {
    const regularLogs = workLogs.filter((log) => !log.report_type)

    if (regularLogs.length === 0) {
      return {
        averageFocusScore: 0,
        productivePercentage: 0,
      }
    }

    const totalFocusScore = regularLogs.reduce((sum, log) => sum + (log.focus_score || 0), 0)
    const averageFocusScore = totalFocusScore / regularLogs.length

    const productiveLogs = regularLogs.filter((log) => log.category === "productive").length
    const productivePercentage = (productiveLogs / regularLogs.length) * 100

    return {
      averageFocusScore,
      productivePercentage,
    }
  }, [workLogs])

  const regularLogsCount = useMemo(() => workLogs.filter((log) => !log.report_type).length, [workLogs])
  const logsUntilNextReport = useMemo(() => (regularLogsCount > 0 ? 3 - (regularLogsCount % 3) : 3), [regularLogsCount])

  return (
    <div className="space-y-4">
      {/* 音声アラート設定 */}
      <AudioPermissionManager onPermissionGranted={() => console.log("Audio permission granted")} />

      {/* ブラウザ通知の許可（未許可のときだけ表示される） */}
      <NotificationPermissionManager />

      {/* 画面解析コントロール */}
      <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
        <CardHeader className="pb-3 bg-gradient-to-r from-amber-50 to-pink-50 rounded-t-lg border-b border-gray-100">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <Camera className="h-5 w-5 text-amber-600" />
            {t('wlp_captureTitle')}
            {/* 状態は色だけでなくラベルでも示す（色覚特性・意味の不明瞭さの解消） */}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                isTracking ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600",
              )}
              title={isTracking ? t('wlp_statusTrackingHint') : t('wlp_statusStoppedHint')}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full shadow-sm",
                  isTracking ? "bg-green-500 animate-pulse" : "bg-gray-400",
                )}
              />
              {isTracking ? t('wlp_statusTracking') : t('wlp_statusStopped')}
            </span>
            <Badge variant="outline" className="ml-auto border-amber-200 text-amber-700 bg-amber-50">
              <Zap className="h-3 w-3 mr-1" />
              {captureInterval < 60 ? t('wlp_intervalSeconds', { count: captureInterval }) : t('wlp_intervalMinutes', { count: captureInterval / 60 })}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastAnalysisError && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <div className="text-sm text-orange-800">{lastAnalysisError}</div>
            </div>
          )}

          {/* 差分スキップの可視化: 解析が止まって見える不安への対応 */}
          {isTracking && skipStreak > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              {t('wlp_skipStreak', { count: skipStreak, max: FORCE_ANALYZE_AFTER_SKIPS })}
            </div>
          )}

          {!isApiKeyValid && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                {t('wlp_apiKeyMissing')}
                <div className="text-xs mt-1">
                  {t('wlp_apiKeyMissingDesc')}
                  <br />
                  登録後、ページを再読み込みする必要はありません。自動的に反映されます。
                </div>
              </div>
            </div>
          )}

          {isApiKeyValid && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
              <div className="text-sm text-green-800">
                {t('wlp_apiKeyConfigured')}
                <div className="text-xs mt-1">
                  {t('wlp_apiKeyConfiguredDesc')}
                  <br />{t('wlp_logsUntilReport', { count: logsUntilNextReport })}
                </div>
              </div>
            </div>
          )}

          {isTracking && lastCaptureTime && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="text-sm text-orange-800">
                {t('wlp_autoCapturing')}
                <div className="text-xs mt-1">
                  {t('wlp_lastCapture')} {lastCaptureTime.toLocaleTimeString()}
                  <br />
                  {captureInterval < 60 ? t('wlp_nextCaptureSeconds', { count: captureInterval }) : t('wlp_nextCaptureMinutes', { count: captureInterval / 60 })}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={handleToggleTracking}
              variant={isTracking ? "destructive" : "default"}
              disabled={!isApiKeyValid || isCapturing}
              className={cn(
                "flex items-center gap-2 shadow-md transition-all duration-200",
                isTracking
                  ? "bg-red-500 hover:bg-red-600 shadow-red-200"
                  : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-orange-200",
              )}
            >
              {isCapturing ? (
                <>
                  <Camera className="h-4 w-4 animate-pulse" />
                  {t('wlp_capturing')}
                </>
              ) : isTracking ? (
                <>
                  <Pause className="h-4 w-4" />
                  {t('wlp_stopAnalysis')}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  {t('wlp_startAnalysis')}
                </>
              )}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleScreenshotUpload}
              className="hidden"
            />
          </div>

          {/* 主導線は「解析開始」。手動アップロードは補助機能として下げて置く */}
          <div className="text-xs text-gray-500">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing || !isApiKeyValid}
              className="h-7 px-2 text-xs text-gray-600 hover:bg-gray-100"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {isAnalyzing ? t('wlp_analyzing') : t('wlp_screenshot')}
            </Button>
            <span className="ml-1">{t('wlp_screenshotHint')}</span>
          </div>

          <div className="text-sm text-gray-600">
            <strong className="font-medium text-gray-700">{t('wlp_featureTitle')}</strong>{' '}
            {t('wlp_featureDesc')}
          </div>

          {currentTask ? (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="text-sm text-orange-800">
                {t('wlp_currentTask')}
                <div>{currentTask}</div>
                <div className="text-xs mt-1 opacity-75">{t('wlp_taskCompareDesc')}</div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{t('wlp_noTaskSet')}</span>
                <div className="text-xs mt-1">
                  {t('wlp_noTaskSetDesc')}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI分析サマリー */}
      <AIAnalysisStatus
        totalLogs={regularLogsCount}
        averageFocusScore={stats.averageFocusScore}
        productivePercentage={stats.productivePercentage}
        isAnalyzing={isAnalyzing}
      />

      {/* 作業ログ一覧 */}
      <Card className="flex-1 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
        <CardHeader className="pb-3 bg-gradient-to-r from-gray-50 to-slate-50 rounded-t-lg border-b border-gray-100">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-gray-800">
              {t('wlp_workLogsTitle')}
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">
                {t('wlp_logCount', { count: regularLogsCount })}
              </Badge>
              {isAnalyzing && (
                <Badge variant="outline" className="animate-pulse border-orange-200 text-orange-700 bg-orange-50">
                  解析中...
                </Badge>
              )}
            </CardTitle>
            {workLogs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearLogs}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 transition-all duration-200 bg-transparent"
              >
                <Trash2 className="h-4 w-4" />
                {t('wlp_clearAll')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px] px-6">
            <div className="space-y-4 pb-4">
              {workLogs
                .filter((log) => !log.report_type)
                .map((log) => (
                  <WorkLogItem key={log.id} log={log} onPlayAlert={onPlayAlert} />
                ))}
              {regularLogsCount === 0 && (
                <div className="text-center py-8 text-gray-500">
                  まだ作業ログがありません。
                  <br />
                  「{t('wlp_startAnalysis')}」または「スクリーンショット」でログを生成してください。
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

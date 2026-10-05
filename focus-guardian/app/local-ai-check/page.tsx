"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Cpu, Monitor, Upload, Download, RefreshCw, Loader2, ShieldCheck } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import { useLocalAi } from "@/hooks/use-local-ai"
import { extractJsonObject, runLocalPrompt } from "@/lib/local-ai"
import {
  DEFAULT_CATEGORY_NAMES,
  buildAnalysisPrompt,
  normalizeAnalysis,
  type AnalysisResult,
} from "@/lib/analysis-prompt"
import type { TranslationKey } from "@/lib/translations/ja"

// 端末内 AI の動作確認ページ（ログイン不要・DB に何も保存しない）。
// 目的: ①この端末で Prompt API が使えるかの確認 ②モデルのダウンロード
// ③画面1枚を本番と同じプロンプトで解析し、所要時間と判定を見る。
// 本番アプリの解析ループ（components/work-log-panel.tsx）と同じ lib を使うので、
// ここでの結果がそのまま本番の挙動の目安になる。画像は端末外へ出ない

interface CheckRun {
  id: number
  at: Date
  source: "screen" | "file"
  ms: number
  thumbUrl: string
  result: AnalysisResult | null
  raw: string
  error: string | null
}

// 本番（work-log-panel の resizeImage）と同じく幅 768px・JPEG 0.7 に縮める
async function resizeToBlob(source: CanvasImageSource, width: number, height: number, maxWidth = 768): Promise<Blob> {
  const scale = Math.min(1, maxWidth / width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(width * scale)
  canvas.height = Math.floor(height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))), "image/jpeg", 0.7),
  )
}

// 画面共有を1回だけ取り、1フレームを切り出してすぐ共有を止める
async function captureScreenOnce(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  try {
    const video = document.createElement("video")
    video.srcObject = stream
    video.muted = true
    await video.play()
    // 最初のフレームが黒いことがあるので少し待つ
    await new Promise((r) => setTimeout(r, 300))
    return await resizeToBlob(video, video.videoWidth, video.videoHeight)
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

async function fileToBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    return await resizeToBlob(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

export default function LocalAiCheckPage() {
  const { t, language } = useTranslation()
  const ai = useLocalAi(language)
  const [task, setTask] = useState("")
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [runs, setRuns] = useState<CheckRun[]>([])
  const [chromeVersion, setChromeVersion] = useState<string>("-")
  const fileRef = useRef<HTMLInputElement>(null)
  const runIdRef = useRef(0)

  useEffect(() => {
    const m = /Chrome\/(\d+)/.exec(navigator.userAgent)
    setChromeVersion(m ? m[1] : t('lc_notChrome'))
  }, [t])

  // 作ったサムネイルの object URL はページを離れるときに解放する
  const runsRef = useRef(runs)
  runsRef.current = runs
  useEffect(() => () => runsRef.current.forEach((r) => URL.revokeObjectURL(r.thumbUrl)), [])

  const handleDownload = async () => {
    setDownloading(true)
    setMessage(null)
    try {
      await ai.download()
    } catch (e) {
      setMessage(t('lc_error', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setDownloading(false)
    }
  }

  const analyze = async (image: Blob, source: CheckRun["source"]) => {
    const thumbUrl = URL.createObjectURL(image)
    const started = performance.now()
    let raw = ""
    let result: AnalysisResult | null = null
    let error: string | null = null
    try {
      raw = await runLocalPrompt({
        lang: language,
        image,
        text: buildAnalysisPrompt({
          currentTask: task.trim(),
          categories: DEFAULT_CATEGORY_NAMES,
          userRules: [],
          multiScreen: false,
          lang: language,
        }),
        // 本番（work-log-panel）と同じくスキーマ無しで投げる
        timeoutMs: 120_000,
      })
      const parsed = extractJsonObject(raw)
      if (parsed) {
        result = normalizeAnalysis(parsed, {
          currentTask: task.trim(),
          categories: DEFAULT_CATEGORY_NAMES,
          fallbackDetails: "-",
          fallbackActivity: "-",
          reasonLowAlignment: t('wlp_reasonLowAlignment'),
          reasonUnknown: t('wlp_reasonUnknown'),
          detailsMaxLength: language === "en" ? 80 : 40,
        })
      } else {
        error = t('lc_parseFailed')
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    const ms = Math.round(performance.now() - started)
    setRuns((prev) => [{ id: ++runIdRef.current, at: new Date(), source, ms, thumbUrl, result, raw, error }, ...prev])
  }

  const handleScreen = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const blob = await captureScreenOnce()
      await analyze(blob, "screen")
    } catch (e) {
      // 共有ダイアログのキャンセルはエラー表示しない
      if (!(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError"))) {
        setMessage(t('lc_error', { msg: e instanceof Error ? e.message : String(e) }))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      await analyze(await fileToBlob(file), "file")
    } catch (err) {
      setMessage(t('lc_error', { msg: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }

  const pct = Math.round((ai.downloadProgress ?? 0) * 100)
  const statusKey: TranslationKey =
    ai.availability === "available"
      ? "la_status_available"
      : ai.availability === "downloading"
        ? "la_status_downloading"
        : ai.availability === "downloadable"
          ? "la_status_downloadable"
          : ai.availability === "unsupported"
            ? "la_status_unsupported"
            : ai.availability === "unavailable"
              ? "la_status_unavailable"
              : "la_status_unknown"
  const okRuns = runs.filter((r) => !r.error)
  const avgMs = okRuns.length > 0 ? Math.round(okRuns.reduce((s, r) => s + r.ms, 0) / okRuns.length) : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div>
          <Link href="/" className="text-sm text-orange-700 hover:underline">
            {t('lc_back')}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cpu className="h-6 w-6 text-orange-600" />
            {t('lc_title')}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t('lc_desc')}</p>
        </div>

        {/* 1. 環境 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('lc_step1')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-[10rem_1fr] gap-y-1">
              <span className="text-gray-500">{t('lc_chromeVersion')}</span>
              <span className="font-mono">{chromeVersion}</span>
              <span className="text-gray-500">{t('lc_apiPresent')}</span>
              <span>{ai.availability === "unsupported" ? t('lc_no') : t('lc_yes')}</span>
              <span className="text-gray-500">{t('la_statusLabel')}</span>
              <span className="font-medium">{t(statusKey, { pct })}</span>
            </div>
            {ai.availability === "downloading" && <Progress value={pct} className="h-2" />}
            {ai.lastError && <div className="text-xs text-red-700 break-all">{t('la_error', { msg: ai.lastError })}</div>}
            <div className="flex flex-wrap gap-2">
              {(ai.availability === "downloadable" || ai.availability === "downloading") && (
                <Button size="sm" onClick={handleDownload} disabled={downloading || ai.availability === "downloading"}>
                  {downloading || ai.availability === "downloading" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t('la_downloadButton')}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void ai.refresh()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {t('la_recheckButton')}
              </Button>
            </div>
            {(ai.availability === "unavailable" || ai.availability === "unsupported") && (
              <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
                <li>{t('la_req1')}</li>
                <li>{t('la_req2')}</li>
                <li>{t('la_req3')}</li>
                <li>{t('lc_internalsHint')}</li>
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 2. 解析テスト */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('lc_step2')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lc-task">{t('lc_taskLabel')}</Label>
              <Input id="lc-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder={t('lc_taskPlaceholder')} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleScreen} disabled={!ai.isReady || busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Monitor className="h-4 w-4 mr-2" />}
                {busy ? t('lc_running') : t('lc_captureButton')}
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!ai.isReady || busy}>
                <Upload className="h-4 w-4 mr-2" />
                {t('lc_fileButton')}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
            {message && <div className="text-sm text-red-700 break-all">{message}</div>}
            <p className="text-xs text-gray-500 flex items-start gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-blue-600 shrink-0" />
              {t('lc_privacy')}
            </p>
          </CardContent>
        </Card>

        {/* 3. 結果 */}
        {runs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {t('lc_step3')}
                {avgMs !== null && (
                  <Badge variant="outline" className="font-normal">
                    {t('lc_avgTime', { sec: (avgMs / 1000).toFixed(1), n: okRuns.length })}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {runs.map((r) => (
                <div key={r.id} className="rounded-lg border p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{r.at.toLocaleTimeString()}</span>
                    <span>·</span>
                    <span>{r.source === "screen" ? t('lc_sourceScreen') : t('lc_sourceFile')}</span>
                    <span>·</span>
                    <span className="font-medium text-gray-800">{t('lc_elapsed', { sec: (r.ms / 1000).toFixed(1) })}</span>
                  </div>
                  <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbUrl} alt="" className="w-40 h-auto rounded border shrink-0" />
                    {r.result ? (
                      <div className="grid grid-cols-[7rem_1fr] gap-y-0.5 text-xs">
                        <span className="text-gray-500">activity</span>
                        <span>{r.result.activity}</span>
                        <span className="text-gray-500">category</span>
                        <span>
                          <Badge
                            variant="outline"
                            className={
                              r.result.category === "productive"
                                ? "border-green-300 text-green-700"
                                : r.result.category === "distracted"
                                  ? "border-red-300 text-red-700"
                                  : ""
                            }
                          >
                            {r.result.category}
                          </Badge>
                        </span>
                        <span className="text-gray-500">work_category</span>
                        <span>{r.result.work_category}</span>
                        <span className="text-gray-500">is_distracted</span>
                        <span>{String(r.result.distraction_check.is_distracted)}</span>
                        <span className="text-gray-500">focus_score</span>
                        <span>{r.result.focus_score}</span>
                        <span className="text-gray-500">apps</span>
                        <span>{r.result.applications.join(", ") || "-"}</span>
                        <span className="text-gray-500">details</span>
                        <span>{r.result.details}</span>
                        <span className="text-gray-500">reason</span>
                        <span>{r.result.distraction_check.reason || "-"}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-red-700 break-all">{t('lc_error', { msg: r.error ?? "-" })}</div>
                    )}
                  </div>
                  {r.raw && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500">{t('lc_rawOutput')}</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-all bg-gray-50 p-2 rounded">{r.raw}</pre>
                    </details>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

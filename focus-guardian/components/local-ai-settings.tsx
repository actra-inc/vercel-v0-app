"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Cpu, Download, RefreshCw, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import { useLocalAi } from "@/hooks/use-local-ai"
import type { TranslationKey } from "@/lib/translations/ja"

// 端末内 AI（Chrome 組み込み Prompt API）の状態表示と、モデルのダウンロード導線。
// 旧 Gemini API 設定（API キー入力・モデル選択）の置き換え。設定するものは無く、
// 「使えるか」「使えないなら何が足りないか」を見せるだけにする

export function LocalAiSettings() {
  const { t, language } = useTranslation()
  const ai = useLocalAi(language)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      await ai.download()
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
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
  const isReady = ai.availability === "available"
  const isBusy = downloading || ai.availability === "downloading"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          {t('la_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">{t('la_desc')}</p>

        {/* 状態 */}
        <div
          className={`rounded-lg border p-3 text-sm ${
            isReady ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {isReady ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            )}
            <span>{t('la_statusLabel')}:</span>
            <span>{t(statusKey, { pct })}</span>
          </div>
          {ai.availability === "downloading" && <Progress value={pct} className="mt-2 h-2" />}
          {ai.lastError && <div className="mt-2 text-xs break-all">{t('la_error', { msg: ai.lastError })}</div>}
          {downloadError && <div className="mt-2 text-xs break-all">{t('la_error', { msg: downloadError })}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(ai.availability === "downloadable" || ai.availability === "downloading") && (
              <Button size="sm" onClick={handleDownload} disabled={isBusy} className="flex items-center gap-1.5">
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {t('la_downloadButton')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void ai.refresh()} className="flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {t('la_recheckButton')}
            </Button>
          </div>
        </div>

        {/* 動作要件 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-medium text-gray-800">{t('la_reqTitle')}</div>
          <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
            <li>{t('la_req1')}</li>
            <li>{t('la_req2')}</li>
            <li>{t('la_req3')}</li>
            <li>{t('la_req4')}</li>
          </ul>
          <p className="mt-2 text-xs">
            <a
              href="https://developer.chrome.com/docs/ai/prompt-api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-700 underline hover:text-orange-900"
            >
              {t('la_docsLink')}
            </a>
          </p>
        </div>

        <Alert className="bg-blue-50 border-blue-200">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900 text-xs">{t('la_privacyNote')}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

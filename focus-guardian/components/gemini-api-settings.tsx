"use client"
import { useTranslation } from "@/lib/i18n"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Key, Save, Loader2, CheckCircle2, AlertCircle, Gauge } from "lucide-react"
import type { TranslationKey } from "@/lib/translations/ja"

// 画面解析に使えるモデルの選択肢。
// いずれも Gemini API の stable かつ画像入力対応モデルのみ
// （存在しないIDを選ばせると解析が404で全滅するため、一覧は実在確認済みのものに限る）。
// レポート・日報は別モデル（Gemma・サーバー既定）を使うため、この選択の影響を受けない
const MODEL_OPTIONS: Array<{ id: string; descKey: TranslationKey; recommended?: boolean }> = [
  { id: "gemini-3.5-flash-lite", descKey: "ga_modelDesc35FlashLite", recommended: true },
  { id: "gemini-3.1-flash-lite", descKey: "ga_modelDesc31FlashLite" },
  { id: "gemini-2.5-flash-lite", descKey: "ga_modelDesc25FlashLite" },
  { id: "gemini-3.5-flash", descKey: "ga_modelDesc35Flash" },
  { id: "gemini-3.7-flash", descKey: "ga_modelDesc37Flash" },
]

interface GeminiApiSettingsProps {
  apiKey: string
  model: string
  onApiKeyChange: (apiKey: string) => void
  onModelChange: (model: string) => void
  /** 見込みAPI消費の算出に使うキャプチャ間隔（秒） */
  captureInterval: number
}

export function GeminiApiSettings({
  apiKey,
  model,
  onApiKeyChange,
  onModelChange,
  captureInterval,
}: GeminiApiSettingsProps) {
  const { t } = useTranslation()
  const [localApiKey, setLocalApiKey] = useState(apiKey)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  // 選択の即時反映用（親のstate更新が非同期でも選択が即座に動くように）
  const [localModel, setLocalModel] = useState(model)
  const [modelError, setModelError] = useState(false)

  useEffect(() => {
    setLocalApiKey(apiKey)
  }, [apiKey])

  useEffect(() => {
    setLocalModel(model)
  }, [model])

  const handleModelChange = async (value: string) => {
    setLocalModel(value)
    setModelError(false)
    try {
      await onModelChange(value)
    } catch (error) {
      console.error("Failed to save model:", error)
      setModelError(true)
      setLocalModel(model) // 保存失敗時は元に戻す
    }
  }

  // 見込みAPI消費（画面解析のみ。スキップ0の最大値）
  const perHour = Math.round(3600 / captureInterval)
  const intervalLabel =
    captureInterval < 60
      ? t('wlp_intervalSeconds', { count: captureInterval })
      : t('wlp_intervalMinutes', { count: captureInterval / 60 })

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus("idle")
    setErrorMessage("")

    try {
      await onApiKeyChange(localApiKey)
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (error) {
      setSaveStatus("error")
      setErrorMessage(error instanceof Error ? error.message : t('ga_saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          {t('ga_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gemini-api-key">{t('ga_apiKeyLabel')}</Label>
          <Input
            id="gemini-api-key"
            type="password"
            placeholder="AIzaSy..."
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            disabled={isSaving}
          />
          <p className="text-sm text-gray-500">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:underline"
            >
              Google AI Studio
            </a>
            {t('ga_getKeyLink')}
          </p>
        </div>

        {/* 解析モデルの選択 */}
        <div className="space-y-2">
          <Label>{t('ga_modelLabel')}</Label>
          <RadioGroup value={localModel} onValueChange={handleModelChange} className="space-y-2">
            {MODEL_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                htmlFor={`model-${opt.id}`}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  localModel === opt.id
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <RadioGroupItem value={opt.id} id={`model-${opt.id}`} className="mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <span className="font-mono">{opt.id}</span>
                    {opt.recommended && (
                      <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">
                        {t('ga_modelRecommended')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{t(opt.descKey)}</div>
                </div>
              </label>
            ))}
            {/* 現在の設定値が一覧に無い場合も選択状態を失わないように表示する */}
            {localModel && !MODEL_OPTIONS.some((o) => o.id === localModel) && (
              <label
                htmlFor={`model-${localModel}`}
                className="flex items-start gap-3 rounded-lg border border-orange-400 bg-orange-50 p-3 cursor-pointer"
              >
                <RadioGroupItem value={localModel} id={`model-${localModel}`} className="mt-0.5" />
                <div className="text-sm font-medium text-gray-800">
                  <span className="font-mono">{localModel}</span>
                  <span className="ml-2 text-xs font-normal text-gray-500">{t('ga_modelCurrentUnknown')}</span>
                </div>
              </label>
            )}
          </RadioGroup>
          <p className="text-xs text-gray-500">{t('ga_modelApplyNote')}</p>
          {modelError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t('ga_modelSaveError')}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* 見込みAPI消費（キャプチャ間隔からリアルタイム算出） */}
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium text-orange-900">
            <Gauge className="h-4 w-4 text-orange-600" />
            {t('ga_usageTitle')}
          </div>
          <div className="text-sm text-orange-900">
            {t('ga_usageLine', {
              interval: intervalLabel,
              perHour,
              h8: perHour * 8,
              h12: perHour * 12,
            })}
          </div>
          <p className="text-xs text-orange-800/80 leading-snug">{t('ga_usageNote')}</p>
          <p className="text-xs text-orange-800/80">
            {t('ga_usageLimitPrefix')}
            <a
              href="https://aistudio.google.com/rate-limit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-700 underline hover:text-orange-900"
            >
              AI Studio
            </a>
            {t('ga_usageLimitSuffix')}
          </p>
        </div>

        {saveStatus === "success" && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{t('ga_savedSuccess')}</AlertDescription>
          </Alert>
        )}

        {saveStatus === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage || t('ga_saveError')}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('ga_savingButton')}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {t('ga_saveButton')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

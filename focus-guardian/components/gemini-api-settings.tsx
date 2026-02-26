"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Key, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

interface GeminiApiSettingsProps {
  apiKey: string
  model: string
  onApiKeyChange: (apiKey: string) => void
  onModelChange: (model: string) => void
}

export function GeminiApiSettings({ apiKey, model, onApiKeyChange, onModelChange }: GeminiApiSettingsProps) {
  const [localApiKey, setLocalApiKey] = useState(apiKey)
  const [localModel, setLocalModel] = useState(model || "gemini-2.5-flash-lite")
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    setLocalApiKey(apiKey)
  }, [apiKey])

  useEffect(() => {
    setLocalModel(model || "gemini-2.5-flash-lite")
  }, [model])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus("idle")
    setErrorMessage("")

    try {
      console.log("💾 Saving Gemini API settings:", { apiKey: localApiKey ? "***" : "", model: localModel })

      // APIキーを親コンポーネントに通知
      await onApiKeyChange(localApiKey)

      console.log("✅ API key change completed")

      // モデルを親コンポーネントに通知
      onModelChange(localModel)

      console.log("✅ Model change completed")

      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (error) {
      console.error("❌ Failed to save settings:", error)
      setSaveStatus("error")
      setErrorMessage(error instanceof Error ? error.message : "設定の保存に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Gemini API 設定
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gemini-api-key">API キー</Label>
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
              className="text-blue-600 hover:underline"
            >
              Google AI Studio
            </a>
            でAPIキーを取得できます
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gemini-model">モデル</Label>
          <Select value={localModel} onValueChange={setLocalModel} disabled={isSaving}>
            <SelectTrigger id="gemini-model">
              <SelectValue placeholder="モデルを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-flash-lite">
                <div className="flex flex-col">
                  <span>Gemini 2.5 Flash-Lite（推奨）</span>
                  <span className="text-xs text-gray-500">高速・低コスト・バランス型</span>
                </div>
              </SelectItem>
              <SelectItem value="gemini-2.5-flash">
                <div className="flex flex-col">
                  <span>Gemini 2.5 Flash</span>
                  <span className="text-xs text-gray-500">高速・高精度</span>
                </div>
              </SelectItem>
              <SelectItem value="gemini-2.5-pro">
                <div className="flex flex-col">
                  <span>Gemini 2.5 Pro</span>
                  <span className="text-xs text-gray-500">最高精度・高コスト</span>
                </div>
              </SelectItem>
              <SelectItem value="gemini-2.0-flash-exp">
                <div className="flex flex-col">
                  <span>Gemini 2.0 Flash</span>
                  <span className="text-xs text-gray-500">実験版・高速</span>
                </div>
              </SelectItem>
              <SelectItem value="gemini-2.0-flash-lite">
                <div className="flex flex-col">
                  <span>Gemini 2.0 Flash-Lite</span>
                  <span className="text-xs text-gray-500">実験版・超高速</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {saveStatus === "success" && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">設定を保存しました</AlertDescription>
          </Alert>
        )}

        {saveStatus === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage || "設定の保存に失敗しました"}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              保存
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

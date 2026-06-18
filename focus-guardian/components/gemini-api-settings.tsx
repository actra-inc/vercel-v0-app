"use client"
import { useTranslation } from "@/lib/i18n"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Key, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

interface GeminiApiSettingsProps {
  apiKey: string
  model: string
  onApiKeyChange: (apiKey: string) => void
  onModelChange: (model: string) => void
}

export function GeminiApiSettings({ apiKey, onApiKeyChange }: GeminiApiSettingsProps) {
  const { t } = useTranslation()
  const [localApiKey, setLocalApiKey] = useState(apiKey)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    setLocalApiKey(apiKey)
  }, [apiKey])

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

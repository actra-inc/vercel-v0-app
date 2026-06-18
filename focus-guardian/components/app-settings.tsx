"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useTranslation, type Language } from "@/lib/i18n"

interface AppSettingsProps {
  captureInterval: number
  onCaptureIntervalChange: (interval: number) => void
}

export function AppSettings({ captureInterval, onCaptureIntervalChange }: AppSettingsProps) {
  const { t, language, setLanguage } = useTranslation()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('as_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-4">{t('as_loading')}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('as_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* 言語設定 */}
        <div className="space-y-2">
          <Label htmlFor="language-select">{t('as_language')}</Label>
          <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
            <SelectTrigger id="language-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ja">🇯🇵 日本語</SelectItem>
              <SelectItem value="en">🇺🇸 English</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">{t('as_languageHint')}</p>
        </div>

        {/* キャプチャ間隔 */}
        <div className="space-y-2">
          <Label htmlFor="capture-interval">{t('as_captureInterval')}</Label>
          <Select
            value={captureInterval.toString()}
            onValueChange={(value) => onCaptureIntervalChange(Number(value))}
          >
            <SelectTrigger id="capture-interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">{t('as_every30s')}</SelectItem>
              <SelectItem value="60">{t('as_every1m')}</SelectItem>
              <SelectItem value="120">{t('as_every2m')}</SelectItem>
              <SelectItem value="300">{t('as_every5m')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">{t('as_intervalHint')}</p>
        </div>

        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="text-sm text-orange-800">
            <div className="font-medium mb-2">{t('as_recommended')}</div>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>{t('as_rec1')}</li>
              <li>{t('as_rec2')}</li>
              <li>{t('as_rec3')}</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

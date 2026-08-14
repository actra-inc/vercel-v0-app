"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useTranslation, type Language } from "@/lib/i18n"
import { APP_VERSION, BUILD_COMMIT, BUILD_TIME, ENV_LABEL } from "@/lib/version"
import { isDistractionNotificationEnabled, setDistractionNotificationEnabled } from "@/lib/notification"

interface AppSettingsProps {
  captureInterval: number
  onCaptureIntervalChange: (interval: number) => void
}

export function AppSettings({ captureInterval, onCaptureIntervalChange }: AppSettingsProps) {
  const { t, language, setLanguage } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(true)

  useEffect(() => {
    setMounted(true)
    setNotifEnabled(isDistractionNotificationEnabled())
    return () => setMounted(false)
  }, [])

  const handleNotifChange = (value: string) => {
    const enabled = value === "on"
    setNotifEnabled(enabled)
    setDistractionNotificationEnabled(enabled)
  }

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

        {/* 脱線のブラウザ通知 */}
        <div className="space-y-2">
          <Label htmlFor="distraction-notification">{t('as_distractionNotification')}</Label>
          <Select value={notifEnabled ? "on" : "off"} onValueChange={handleNotifChange}>
            <SelectTrigger id="distraction-notification">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">{t('as_notifEnabled')}</SelectItem>
              <SelectItem value="off">{t('as_notifDisabled')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">{t('as_distractionNotificationHint')}</p>
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

        {/* ビルド情報（デプロイが反映されているかの確認用） */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="text-sm font-medium text-gray-700 mb-1">{t('as_buildInfo')}</div>
          <p className="text-xs text-gray-500 mb-3">{t('as_buildInfoHint')}</p>
          <dl className="space-y-1.5 text-xs">
            {[
              { label: t('as_buildVersion'), value: `v${APP_VERSION}` },
              { label: t('as_buildCommit'), value: BUILD_COMMIT },
              { label: t('as_buildEnv'), value: ENV_LABEL },
              { label: t('as_buildTime'), value: BUILD_TIME },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-gray-500 flex-shrink-0">{label}</dt>
                <dd className="font-mono text-gray-800 truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useTranslation, type Language } from "@/lib/i18n"
import {
  isDistractionNotificationEnabled,
  setDistractionNotificationEnabled,
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  type NotificationPermissionState,
} from "@/lib/notification"

interface AppSettingsProps {
  captureInterval: number
  onCaptureIntervalChange: (interval: number) => void
}

export function AppSettings({ captureInterval, onCaptureIntervalChange }: AppSettingsProps) {
  const { t, language, setLanguage } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>("unsupported")
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    setNotifEnabled(isDistractionNotificationEnabled())
    setNotifPermission(getNotificationPermission())
    return () => setMounted(false)
  }, [])

  const handleNotifChange = (value: string) => {
    const enabled = value === "on"
    setNotifEnabled(enabled)
    setDistractionNotificationEnabled(enabled)
  }

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission()
    setNotifPermission(result)
  }

  // 通知が実際に届くかをその場で確認する（届かない場合の切り分け用）
  const handleTestNotification = async () => {
    const result = await sendTestNotification(t('as_notifTestTitle'), t('as_notifTestBody'))
    setNotifPermission(getNotificationPermission())
    setTestResult(result.shown ? t('as_notifTestSent') : t('as_notifTestFailed'))
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
              {/* 旧既定値（180秒等）で保存されたユーザーの選択が空表示に
                  ならないよう、一覧外の現在値は動的に選択肢へ加える */}
              {![30, 60, 120, 300].includes(captureInterval) && (
                <SelectItem value={captureInterval.toString()}>
                  {captureInterval < 60 ? `${captureInterval}s` : `${captureInterval / 60}min`}
                </SelectItem>
              )}
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

          {/* ブラウザ側の許可状態。アプリ設定を「有効」にしていても
              ブラウザが未許可だと通知は一切出ないため、ここで状態と対処を示す */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">{t('as_notifPermissionLabel')}</span>
              <span
                className={
                  notifPermission === "granted"
                    ? "font-medium text-green-700"
                    : notifPermission === "denied"
                      ? "font-medium text-red-700"
                      : "font-medium text-orange-700"
                }
              >
                {notifPermission === "granted"
                  ? t('as_notifPermGranted')
                  : notifPermission === "denied"
                    ? t('as_notifPermDenied')
                    : notifPermission === "unsupported"
                      ? t('as_notifPermUnsupported')
                      : t('as_notifPermDefault')}
              </span>
            </div>

            {notifPermission === "default" && (
              <Button size="sm" variant="outline" onClick={handleRequestPermission}>
                {t('as_notifRequestButton')}
              </Button>
            )}

            {notifPermission === "denied" && (
              <p className="text-xs text-red-700">{t('as_notifDeniedHelp')}</p>
            )}

            {notifPermission === "granted" && (
              <div className="space-y-1">
                <Button size="sm" variant="outline" onClick={handleTestNotification}>
                  {t('as_notifTestButton')}
                </Button>
                {testResult && <p className="text-xs text-gray-600">{testResult}</p>}
              </div>
            )}
          </div>
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

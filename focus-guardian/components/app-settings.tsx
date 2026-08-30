"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useTranslation, type Language } from "@/lib/i18n"
import { DEFAULT_NUDGE_PREFERENCES, type NudgePreferences } from "@/lib/config"
import type { WeeklyReportSettings } from "@/lib/supabase"
import { Input } from "@/components/ui/input"
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
  nudgePreferences?: NudgePreferences
  onNudgePreferencesChange?: (prefs: NudgePreferences) => void | Promise<void>
  weeklyReport?: WeeklyReportSettings
  onWeeklyReportChange?: (settings: WeeklyReportSettings) => void | Promise<void>
}

export function AppSettings({
  captureInterval,
  onCaptureIntervalChange,
  nudgePreferences = DEFAULT_NUDGE_PREFERENCES,
  onNudgePreferencesChange,
  weeklyReport = { enabled: false, channel: "email" },
  onWeeklyReportChange,
}: AppSettingsProps) {
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
  const [nudgeSaveError, setNudgeSaveError] = useState(false)

  // 週次レポート配信
  const [wrSaveError, setWrSaveError] = useState(false)
  const [slackUrlDraft, setSlackUrlDraft] = useState(weeklyReport.slackWebhookUrl ?? "")
  const [slackUrlError, setSlackUrlError] = useState(false)
  const [wrTesting, setWrTesting] = useState(false)
  const [wrTestResult, setWrTestResult] = useState<string | null>(null)
  useEffect(() => {
    setSlackUrlDraft(weeklyReport.slackWebhookUrl ?? "")
  }, [weeklyReport.slackWebhookUrl])

  const handleWeeklyChange = async (patch: Partial<WeeklyReportSettings>) => {
    setWrSaveError(false)
    try {
      await onWeeklyReportChange?.({ ...weeklyReport, ...patch })
    } catch (e) {
      console.warn("Failed to save weekly report settings:", e)
      setWrSaveError(true)
    }
  }

  const handleSaveSlackUrl = async () => {
    const url = slackUrlDraft.trim()
    // SSRF防止: Slackの正規Webhook以外は保存させない（サーバー側でも再検証される）
    if (url && !url.startsWith("https://hooks.slack.com/")) {
      setSlackUrlError(true)
      return
    }
    setSlackUrlError(false)
    await handleWeeklyChange({ slackWebhookUrl: url })
  }

  const handleWeeklyTest = async () => {
    setWrTesting(true)
    setWrTestResult(null)
    try {
      const res = await fetch("/api/weekly-report/test", { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setWrTestResult(t('wr_errFailed'))
        return
      }
      if (data.errors?.includes("no_email_key")) {
        setWrTestResult(t('wr_errNoEmailKey'))
      } else if (data.errors?.includes("no_slack_url")) {
        setWrTestResult(t('wr_errNoSlackUrl'))
      } else if (data.emailSent && data.slackSent) {
        setWrTestResult(t('wr_testOkBoth'))
      } else if (data.emailSent) {
        setWrTestResult(t('wr_testOkEmail'))
      } else if (data.slackSent) {
        setWrTestResult(t('wr_testOkSlack'))
      } else {
        setWrTestResult(t('wr_errFailed'))
      }
    } catch {
      setWrTestResult(t('wr_errFailed'))
    } finally {
      setWrTesting(false)
    }
  }
  const handleNudgeChange = async (patch: Partial<NudgePreferences>) => {
    setNudgeSaveError(false)
    try {
      await onNudgePreferencesChange?.({ ...nudgePreferences, ...patch })
    } catch (e) {
      // 列が無い環境（align-schema未実行）では保存に失敗する。
      // 機能自体はローカル既定値で動き続けるため、案内だけ出す
      console.warn("Failed to save nudge preferences:", e)
      setNudgeSaveError(true)
    }
  }

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

        {/* 休憩・無操作リマインド */}
        <div className="space-y-3">
          <Label>{t('as_reminderSection')}</Label>

          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="text-sm font-medium text-gray-700">{t('as_breakReminder')}</div>
            <div className="flex gap-2">
              <Select
                value={nudgePreferences.breakEnabled ? "on" : "off"}
                onValueChange={(v) => handleNudgeChange({ breakEnabled: v === "on" })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">{t('as_notifEnabled')}</SelectItem>
                  <SelectItem value="off">{t('as_notifDisabled')}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(nudgePreferences.breakMinutes)}
                onValueChange={(v) => handleNudgeChange({ breakMinutes: Number(v) })}
                disabled={!nudgePreferences.breakEnabled}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {![45, 60, 90, 120].includes(nudgePreferences.breakMinutes) && (
                    <SelectItem value={String(nudgePreferences.breakMinutes)}>
                      {t('as_minutes', { n: nudgePreferences.breakMinutes })}
                    </SelectItem>
                  )}
                  <SelectItem value="45">{t('as_minutes', { n: 45 })}</SelectItem>
                  <SelectItem value="60">{t('as_minutes', { n: 60 })}</SelectItem>
                  <SelectItem value="90">{t('as_minutes', { n: 90 })}</SelectItem>
                  <SelectItem value="120">{t('as_minutes', { n: 120 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500">{t('as_breakReminderHint')}</p>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="text-sm font-medium text-gray-700">{t('as_idleReminder')}</div>
            <div className="flex gap-2">
              <Select
                value={nudgePreferences.idleEnabled ? "on" : "off"}
                onValueChange={(v) => handleNudgeChange({ idleEnabled: v === "on" })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">{t('as_notifEnabled')}</SelectItem>
                  <SelectItem value="off">{t('as_notifDisabled')}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(nudgePreferences.idleMinutes)}
                onValueChange={(v) => handleNudgeChange({ idleMinutes: Number(v) })}
                disabled={!nudgePreferences.idleEnabled}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {![5, 10, 15, 20].includes(nudgePreferences.idleMinutes) && (
                    <SelectItem value={String(nudgePreferences.idleMinutes)}>
                      {t('as_minutes', { n: nudgePreferences.idleMinutes })}
                    </SelectItem>
                  )}
                  <SelectItem value="5">{t('as_minutes', { n: 5 })}</SelectItem>
                  <SelectItem value="10">{t('as_minutes', { n: 10 })}</SelectItem>
                  <SelectItem value="15">{t('as_minutes', { n: 15 })}</SelectItem>
                  <SelectItem value="20">{t('as_minutes', { n: 20 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500">{t('as_idleReminderHint')}</p>
          </div>

          {nudgeSaveError && <p className="text-xs text-red-600">{t('as_saveFailed')}</p>}
        </div>

        {/* 週次レポート配信 */}
        <div className="space-y-2">
          <Label>{t('wr_section')}</Label>
          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <p className="text-xs text-gray-500">{t('wr_hint')}</p>
            <div className="flex gap-2">
              <Select
                value={weeklyReport.enabled ? "on" : "off"}
                onValueChange={(v) => handleWeeklyChange({ enabled: v === "on" })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">{t('as_notifEnabled')}</SelectItem>
                  <SelectItem value="off">{t('as_notifDisabled')}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={weeklyReport.channel}
                onValueChange={(v) => handleWeeklyChange({ channel: v as WeeklyReportSettings["channel"] })}
                disabled={!weeklyReport.enabled}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">{t('wr_channelEmail')}</SelectItem>
                  <SelectItem value="slack">{t('wr_channelSlack')}</SelectItem>
                  <SelectItem value="both">{t('wr_channelBoth')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(weeklyReport.channel === "slack" || weeklyReport.channel === "both") && (
              <div className="space-y-1.5">
                <Label htmlFor="slack-webhook" className="text-xs">{t('wr_slackUrlLabel')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="slack-webhook"
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    value={slackUrlDraft}
                    onChange={(e) => { setSlackUrlDraft(e.target.value); setSlackUrlError(false) }}
                    className="text-sm"
                    autoComplete="off"
                  />
                  <Button size="sm" variant="outline" onClick={handleSaveSlackUrl}>
                    {t('common_save')}
                  </Button>
                </div>
                {slackUrlError && <p className="text-xs text-red-600">{t('wr_slackUrlInvalid')}</p>}
                <p className="text-xs text-gray-500">{t('wr_slackUrlHint')}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleWeeklyTest} disabled={wrTesting}>
                {wrTesting ? t('wr_testing') : t('wr_test')}
              </Button>
              {wrTestResult && <p className="text-xs text-gray-600">{wrTestResult}</p>}
            </div>
            {wrSaveError && <p className="text-xs text-red-600">{t('as_saveFailed')}</p>}
          </div>
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

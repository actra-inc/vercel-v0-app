"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Bell, BellOff } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/notification"

// 脱線アラートのブラウザ通知許可を管理する。
// AudioPermissionManager と同じ作法：許可済みなら何も表示せず、
// 未許可のときだけ小さく許可を促す。
export function NotificationPermissionManager() {
  const { t } = useTranslation()
  const [permission, setPermission] = useState<NotificationPermissionState>("unsupported")

  // 許可状態は設定画面やブラウザ側からも変わるため、マウント時の1回だけでなく
  // フォーカス復帰時と Permissions API の変化イベントでも取り直す
  useEffect(() => {
    const sync = () => setPermission(getNotificationPermission())
    sync()
    window.addEventListener("focus", sync)

    let status: PermissionStatus | null = null
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s
        s.addEventListener("change", sync)
      })
      .catch(() => {
        // Permissions API 未対応ブラウザではフォーカス復帰時の再取得のみで動く
      })

    return () => {
      window.removeEventListener("focus", sync)
      status?.removeEventListener("change", sync)
    }
  }, [])

  const handleRequest = async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
  }

  // 未対応ブラウザ・許可済みの場合は何も表示しない（画面を占有しない）
  if (permission === "unsupported" || permission === "granted") {
    return null
  }

  if (permission === "denied") {
    return (
      <Alert className="border-yellow-200 bg-yellow-50 mb-4">
        <BellOff className="h-4 w-4 text-yellow-600" />
        <AlertDescription>
          <div className="font-medium mb-1 text-yellow-800">{t('np_deniedTitle')}</div>
          <div className="text-sm text-yellow-700">{t('np_deniedDesc')}</div>
        </AlertDescription>
      </Alert>
    )
  }

  // permission === "default"（未回答）
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-orange-600" />
          {t('np_promptTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-gray-600">{t('np_promptDesc')}</div>
        <Button onClick={handleRequest} className="w-full">
          {t('np_enableButton')}
        </Button>
      </CardContent>
    </Card>
  )
}

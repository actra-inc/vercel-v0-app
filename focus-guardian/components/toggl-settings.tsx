"use client"
import { useTranslation } from "@/lib/i18n"

import type React from "react"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  CheckCircle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  AlertTriangle,
} from "lucide-react"

interface TogglEntry {
  project: string | null
  description: string | null
  start: string | null
  duration: number | null
  elapsed_seconds?: number | null
  is_running: boolean
  entry_id: number | null
  project_id: number | null
  workspace_id: number | null
  debug?: any
}

/** 資格情報の保存先。DBに保存できなかった場合はこの端末のみ(local)になる */
export type TogglSaveResult =
  | { stored: "db" }
  | { stored: "local"; cause?: string; detail?: string }

interface TogglSettingsProps {
  /** DB(user_settings)に保存済みの値 */
  savedApiToken?: string
  savedWorkspaceId?: string
  /** DBに保存できず、この端末のlocalStorageにだけ資格情報がある状態か */
  credentialsLocalOnly?: boolean
  /** 検証済みの資格情報をDBへ保存する（空文字でクリア） */
  onCredentialsChange?: (token: string, workspaceId: string) => void | Promise<TogglSaveResult | void>
}

export function TogglSettings({
  savedApiToken = "",
  savedWorkspaceId = "",
  credentialsLocalOnly = false,
  onCredentialsChange,
}: TogglSettingsProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "ja" ? "ja-JP" : "en-US"
  const [apiToken, setApiToken] = useState(savedApiToken)
  const [workspaceId, setWorkspaceId] = useState(savedWorkspaceId)
  const [showApiToken, setShowApiToken] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [currentEntry, setCurrentEntry] = useState<TogglEntry | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<{
    text: string
    variant: "success" | "warning" | "error"
    /** 生のエラー内容（原因を断定するための手掛かり。誤診時にこれが決め手になる） */
    detail?: string
  } | null>(null)
  const [showDebugInfo, setShowDebugInfo] = useState(false)

  // 保存済みの値（DB: user_settings）をフォームへ反映する。
  // 以前は localStorage 保存でDB経路が死んでおり、端末間で設定が同期されず
  // トークンがサーバー側で参照できなかった
  useEffect(() => {
    setApiToken(savedApiToken)
    setWorkspaceId(savedWorkspaceId)
    setIsConfigured(Boolean(savedApiToken && savedWorkspaceId))
  }, [savedApiToken, savedWorkspaceId])

  useEffect(() => {
    // 環境変数によるサーバー側設定（個人運用モード）の確認
    fetch("/api/toggl/status")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch")
        return res.json()
      })
      .then((data) => {
        if (data.configured) setIsConfigured(true)
      })
      .catch((error) => {
        console.warn("Failed to check Toggl status:", error)
      })
  }, [])

  const testTogglConnection = async () => {
    setIsTestingConnection(true)
    setConnectionError(null)
    setCurrentEntry(null)

    try {
      // 未保存の入力値を検証する場合はPOSTボディで送る
      // （URLクエリはアクセスログに残るため使わない）
      const response = await fetch("/api/toggl-current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiToken && workspaceId ? { apiToken, workspaceId } : {}),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (data.error) {
        setConnectionError(data.error)
        setCurrentEntry({
          project: null,
          description: null,
          start: null,
          duration: null,
          is_running: false,
          entry_id: null,
          project_id: null,
          workspace_id: null,
          debug: data.debug,
        })
      } else {
        setCurrentEntry(data)
        console.log("Toggl connection test successful:", data)
      }
    } catch (error: any) {
      console.error("Toggl connection test error:", error)
      setConnectionError(`Network error: ${error.message}`)
    } finally {
      setIsTestingConnection(false)
    }
  }

  // 原因が特定できているときだけ対処法を断定して案内する。
  // 特定できないものまで「列が不足している」と表示すると誤った対処へ誘導してしまうので、
  // その場合は生のエラーメッセージをそのまま見せる
  const describeFailure = (error: any, fallback: string): string => {
    switch (error?.failureCause) {
      case "missing_table":
        return t('tg_diagMissingTable')
      case "missing_column":
        return t('tg_saveMissingColumn')
      case "stale_schema_cache":
        return t('tg_diagStaleCache')
      case "rls_blocked":
        return t('tg_diagRls')
      case "no_user_row":
        return t('tg_diagNoUserRow')
      case "network":
        return t('tg_diagNetwork')
      default:
        return String(error?.message || fallback)
    }
  }

  // 表示した案内が外れていた場合に自力で切り分けられるよう、生の情報も併記する
  // （shown と同じ文言は重複表示になるので落とす）
  const formatDetail = (error: any, shown: string): string | undefined => {
    const parts = [error?.code, error?.message, error?.diagnosisDetail]
      .filter((v): v is string => typeof v === "string" && v.length > 0 && v !== shown)
      .filter((v, i, arr) => arr.indexOf(v) === i)
    if (error?.projectRef) parts.push(`project: ${error.projectRef}`)
    return parts.length > 0 ? parts.join(" / ") : undefined
  }

  const messageClass = (variant: "success" | "warning" | "error") =>
    variant === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : variant === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-800"

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!apiToken || !workspaceId) {
      setSaveMessage({ text: t('tg_requiredFields'), variant: "error" })
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      // First, validate the credentials（POSTボディで送りログに残さない）
      const testResponse = await fetch("/api/toggl-current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken, workspaceId }),
      })

      if (!testResponse.ok) {
        // 失敗理由を出し分ける（従来は一律「Invalid credentials」で、
        // セッション切れやToggl側の一時障害でも正しいトークンを疑わせていた）
        const body = await testResponse.json().catch(() => null)
        if (testResponse.status === 401) {
          throw new Error(t('tg_sessionExpired'))
        }
        if (testResponse.status === 502 || testResponse.status === 503 || testResponse.status >= 500) {
          // 502のうちToggl側が401/403を返した場合のみ資格情報エラー
          const togglStatus = body?.debug?.status
          if (togglStatus === 401 || togglStatus === 403) {
            throw new Error(t('tg_invalidCredentials'))
          }
          throw new Error(t('tg_togglTempError'))
        }
        throw new Error(t('tg_invalidCredentials'))
      }

      const testData = await testResponse.json()
      if (testData.error) {
        throw new Error(testData.error)
      }

      // DB(user_settings)へ保存し、端末間で同期されるようにする。
      // DB側のスキーマが原因で保存できない場合、呼び出し元がこの端末へ退避したうえで
      // stored: "local" を返す（Toggl連携そのものは動く状態にする）
      const result = (await onCredentialsChange?.(apiToken, workspaceId)) as TogglSaveResult | undefined

      setIsConfigured(true)
      if (result?.stored === "local") {
        setSaveMessage({ text: t('tg_savedLocalOnly'), variant: "warning", detail: result.detail })
      } else {
        setSaveMessage({ text: t('tg_saveSuccess'), variant: "success" })
      }
    } catch (error: any) {
      console.error("Error saving credentials:", error)
      const text = describeFailure(error, t('tg_saveFailed'))
      setSaveMessage({ text, variant: "error", detail: formatDetail(error, text) })
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearCredentials = async () => {
    try {
      // 先に保存先をクリアする。UIを先に空にすると、更新失敗時に
      // 「クリアできたように見えてトークンが生き続ける」無言の不整合になる
      await onCredentialsChange?.("", "")

      setApiToken("")
      setWorkspaceId("")
      setIsConfigured(false)
      setCurrentEntry(null)
      setConnectionError(null)
      setSaveMessage(null)
    } catch (error: any) {
      console.error("Error clearing credentials:", error)
      const text = describeFailure(error, t('tg_clearFailed'))
      setSaveMessage({ text, variant: "error", detail: formatDetail(error, text) })
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return "00:00:00"
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  if (isConfigured && apiToken && workspaceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            {t('tg_cardTitle')}
          </CardTitle>
          <CardDescription>{t('tg_cardConfiguredDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="text-green-800">
              {t('tg_connected')}
            </AlertDescription>
          </Alert>

          {/* DBに保存できずこの端末だけに退避している場合は、同期されないことを明示する
              （黙って動くと「保存できたのに他端末で消える」と見える） */}
          {credentialsLocalOnly && saveMessage?.variant !== "warning" && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900">{t('tg_savedLocalOnly')}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={testTogglConnection}
              disabled={isTestingConnection}
              className="flex items-center gap-2 bg-transparent"
            >
              {isTestingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('tg_testConnection')}
            </Button>
            <Button variant="outline" onClick={handleClearCredentials}>
              {t('tg_clearSettings')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDebugInfo(!showDebugInfo)} className="ml-auto">
              {showDebugInfo ? t('tg_hideDebug') : t('tg_showDebug')}
            </Button>
          </div>

          {connectionError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <div className="font-medium">{t('tg_connectionError')}</div>
                <div className="text-sm mt-1">{connectionError}</div>
              </AlertDescription>
            </Alert>
          )}

          {/* クリア失敗などの通知。従来は未設定フォーム側でしか描画されず、
              設定済みカードから実行する「設定をクリア」の失敗が誰にも見えなかった */}
          {saveMessage && (
            <Alert className={messageClass(saveMessage.variant)}>
              <AlertDescription>
                <div>{saveMessage.text}</div>
                {saveMessage.detail && (
                  <div className="mt-1 break-all font-mono text-xs opacity-80">{saveMessage.detail}</div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {currentEntry && (
            <div className="space-y-3">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="text-sm text-orange-800">
                  <div className="font-medium mb-2">{t('tg_currentEntry')}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">{t('tg_project')}</div>
                      <div className="font-medium">{currentEntry.project || t('tg_notSet')}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">{t('tg_task')}</div>
                      <div className="font-medium">{currentEntry.description || t('tg_notSet')}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">{t('tg_startTime')}</div>
                      <div className="font-medium">
                        {currentEntry.start ? new Date(currentEntry.start).toLocaleString(dateLocale) : t('tg_notSet')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">{t('tg_duration')}</div>
                      <div className="font-medium flex items-center gap-2">
                        {formatDuration(currentEntry.elapsed_seconds ?? null)}
                        {currentEntry.is_running && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">{t('tg_running')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {showDebugInfo && currentEntry.debug && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="text-sm">
                    <div className="font-medium mb-2">{t('tg_debugInfo')}</div>
                    <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                      {JSON.stringify(currentEntry.debug, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('tg_formTitle')}
        </CardTitle>
        <CardDescription>{t('tg_description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiToken">{t('tg_apiTokenLabel')}</Label>
            <div className="relative">
              <Input
                id="apiToken"
                name="apiToken"
                type={showApiToken ? "text" : "password"}
                placeholder="••••••••••••••••••••••••••••••••"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required
                className="pr-10"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiToken(!showApiToken)}
              >
                {showApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-gray-500">{t('tg_apiTokenHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspaceId">{t('tg_workspaceIdLabel')}</Label>
            <Input
              id="workspaceId"
              name="workspaceId"
              type="text"
              placeholder={t('tg_workspaceIdPlaceholder')}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              required
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
            />
            <p className="text-xs text-gray-500">{t('tg_workspaceIdHint')}</p>
          </div>
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={isSaving || !apiToken || !workspaceId} className="flex items-center gap-2">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? t('tg_validating') : t('tg_saveCredentials')}
            </Button>
            <Button variant="link" asChild>
              <a href="https://track.toggl.com/profile" target="_blank" rel="noopener noreferrer" className="text-sm">
                {t('tg_findCredentials')} <ExternalLink className="ml-1 h-3 w-3 inline" />
              </a>
            </Button>
          </div>
        </form>
        {saveMessage && (
          <Alert className={`mt-4 ${messageClass(saveMessage.variant)}`}>
            <AlertDescription>
              <div>{saveMessage.text}</div>
              {saveMessage.detail && (
                <div className="mt-1 break-all font-mono text-xs opacity-80">{saveMessage.detail}</div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

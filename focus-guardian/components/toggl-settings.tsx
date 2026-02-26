"use client"

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
  is_running: boolean
  entry_id: number | null
  project_id: number | null
  workspace_id: number | null
  debug?: any
}

export function TogglSettings() {
  const [apiToken, setApiToken] = useState("")
  const [workspaceId, setWorkspaceId] = useState("")
  const [showApiToken, setShowApiToken] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [currentEntry, setCurrentEntry] = useState<TogglEntry | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [showDebugInfo, setShowDebugInfo] = useState(false)

  // Load saved credentials from localStorage (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const savedApiToken = localStorage.getItem("toggl_api_token")
      const savedWorkspaceId = localStorage.getItem("toggl_workspace_id")

      if (savedApiToken) {
        setApiToken(savedApiToken)
        setIsConfigured(true)
      }
      if (savedWorkspaceId) {
        setWorkspaceId(savedWorkspaceId)
      }

      // Check server configuration as well
      fetch("/api/toggl/status")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch")
          return res.json()
        })
        .then((data) => {
          if (data.configured && !savedApiToken) {
            setIsConfigured(true)
          }
        })
        .catch((error) => {
          console.warn("Failed to check Toggl status:", error)
        })
    } catch (error) {
      console.error("Error loading Toggl credentials:", error)
    }
  }, [])

  const testTogglConnection = async () => {
    setIsTestingConnection(true)
    setConnectionError(null)
    setCurrentEntry(null)

    try {
      let url = "/api/toggl-current"
      if (apiToken && workspaceId) {
        url += `?apiToken=${encodeURIComponent(apiToken)}&workspaceId=${encodeURIComponent(workspaceId)}`
      }

      const response = await fetch(url)
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

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!apiToken || !workspaceId) {
      setSaveMessage({ text: "API Token and Workspace ID are required.", success: false })
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      // First, validate the credentials
      const testUrl = `/api/toggl-current?apiToken=${encodeURIComponent(apiToken)}&workspaceId=${encodeURIComponent(workspaceId)}`
      const testResponse = await fetch(testUrl)

      if (!testResponse.ok) {
        throw new Error("Invalid credentials. Please check your API Token and Workspace ID.")
      }

      const testData = await testResponse.json()
      if (testData.error) {
        throw new Error(testData.error)
      }

      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("toggl_api_token", apiToken)
        localStorage.setItem("toggl_workspace_id", workspaceId)
      }

      setIsConfigured(true)
      setSaveMessage({
        text: "Toggl credentials validated and saved successfully!",
        success: true,
      })
    } catch (error: any) {
      console.error("Error saving credentials:", error)
      setSaveMessage({
        text: error.message || "Failed to validate credentials.",
        success: false,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearCredentials = () => {
    try {
      setApiToken("")
      setWorkspaceId("")
      setIsConfigured(false)
      setCurrentEntry(null)
      setConnectionError(null)
      setSaveMessage(null)

      if (typeof window !== "undefined") {
        localStorage.removeItem("toggl_api_token")
        localStorage.removeItem("toggl_workspace_id")
      }
    } catch (error) {
      console.error("Error clearing credentials:", error)
    }
  }

  const formatDuration = (duration: number | null) => {
    if (!duration) return "0:00"

    const seconds = Math.abs(duration)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}`
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`
  }

  if (isConfigured && apiToken && workspaceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            Toggl Integration
          </CardTitle>
          <CardDescription>Your Toggl integration is configured and active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="text-green-800">
              ✅ Toggl連携が完了しています。APIとの接続が可能です。
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={testTogglConnection}
              disabled={isTestingConnection}
              className="flex items-center gap-2 bg-transparent"
            >
              {isTestingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              接続テスト
            </Button>
            <Button variant="outline" onClick={handleClearCredentials}>
              設定をクリア
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDebugInfo(!showDebugInfo)} className="ml-auto">
              {showDebugInfo ? "Debug非表示" : "Debug表示"}
            </Button>
          </div>

          {connectionError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <div className="font-medium">接続エラー:</div>
                <div className="text-sm mt-1">{connectionError}</div>
              </AlertDescription>
            </Alert>
          )}

          {currentEntry && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-800">
                  <div className="font-medium mb-2">📊 現在のTogglエントリ:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">プロジェクト:</div>
                      <div className="font-medium">{currentEntry.project || "未設定"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">作業内容:</div>
                      <div className="font-medium">{currentEntry.description || "未設定"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">開始時刻:</div>
                      <div className="font-medium">
                        {currentEntry.start ? new Date(currentEntry.start).toLocaleString("ja-JP") : "未設定"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">実行時間:</div>
                      <div className="font-medium flex items-center gap-2">
                        {formatDuration(currentEntry.duration)}
                        {currentEntry.is_running && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">実行中</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {showDebugInfo && currentEntry.debug && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="text-sm">
                    <div className="font-medium mb-2">🔧 Debug情報:</div>
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
          Integrations → Toggl
        </CardTitle>
        <CardDescription>
          Connect your Toggl account to automatically track your current task. The API Token and Workspace ID will be
          stored locally in your browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiToken">API Token</Label>
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
            <p className="text-xs text-gray-500">Find your API token in your Toggl Track profile settings.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspaceId">Workspace ID</Label>
            <Input
              id="workspaceId"
              name="workspaceId"
              type="text"
              placeholder="Enter your Toggl Workspace ID"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              required
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
            />
            <p className="text-xs text-gray-500">
              You can find your Workspace ID in the URL when viewing your workspace settings.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={isSaving || !apiToken || !workspaceId} className="flex items-center gap-2">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Validating..." : "Save Credentials"}
            </Button>
            <Button variant="link" asChild>
              <a href="https://track.toggl.com/profile" target="_blank" rel="noopener noreferrer" className="text-sm">
                Find your credentials <ExternalLink className="ml-1 h-3 w-3 inline" />
              </a>
            </Button>
          </div>
        </form>
        {saveMessage && (
          <Alert
            className={`mt-4 ${saveMessage.success ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}
          >
            <AlertDescription>{saveMessage.text}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

"use client"
import { useState, useEffect } from "react"
import { ErrorBoundary } from "@/components/error-boundary"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, AlertCircle, X, Settings, Key, Link, FolderOpen } from "lucide-react"
import { GeminiApiSettings } from "@/components/gemini-api-settings"
import { TogglSettings } from "@/components/toggl-settings"
import { ProjectManager } from "@/components/project-manager"
import { AppSettings } from "@/components/app-settings"

interface SettingsPanelProps {
  apiKey: string
  model: string
  togglApiToken: string
  togglWorkspaceId: string
  captureInterval: number
  onApiKeyChange: (apiKey: string) => Promise<void>
  onModelChange: (model: string) => void
  onTogglCredentialsChange: (token: string, workspaceId: string) => void
  onCaptureIntervalChange: (interval: number) => void
  onClose: () => void
  projects?: any[]
  onProjectsChange?: (projects: any[]) => void
  addProject?: (project: any) => Promise<any>
  editProject?: (id: string, updates: any) => Promise<any>
  removeProject?: (id: string) => Promise<any>
}

export function SettingsPanel({
  apiKey,
  model,
  togglApiToken,
  togglWorkspaceId,
  captureInterval,
  onApiKeyChange,
  onModelChange,
  onTogglCredentialsChange,
  onCaptureIntervalChange,
  onClose,
  projects = [],
  onProjectsChange = () => {},
  addProject,
  editProject,
  removeProject,
}: SettingsPanelProps) {
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("gemini")

  useEffect(() => {
    try {
      setMounted(true)
    } catch (err) {
      console.error("Settings panel mount error:", err)
      setError(err instanceof Error ? err.message : "マウントエラー")
    }

    return () => {
      setMounted(false)
    }
  }, [])

  if (error) {
    return (
      <Card className="m-4 border-yellow-200 bg-yellow-50">
        <CardContent className="pt-4">
          <Alert className="border-yellow-300">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="text-yellow-800">
                <p className="font-medium">設定パネルの読み込みに問題が発生しました</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!mounted) {
    return (
      <Card className="m-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
            <span className="text-gray-600">設定を読み込み中...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <ErrorBoundary>
      <Card className="border-2 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" />
              アプリケーション設定
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="gemini" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Gemini API
              </TabsTrigger>
              <TabsTrigger value="toggl" className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                Toggl連携
              </TabsTrigger>
              <TabsTrigger value="projects" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                プロジェクト
              </TabsTrigger>
              <TabsTrigger value="app" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                その他
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gemini" className="mt-6">
              <GeminiApiSettings
                apiKey={apiKey}
                model={model}
                onApiKeyChange={onApiKeyChange}
                onModelChange={onModelChange}
              />
            </TabsContent>

            <TabsContent value="toggl" className="mt-6">
              <TogglSettings />
            </TabsContent>

            <TabsContent value="projects" className="mt-6">
              {addProject && editProject && removeProject ? (
                <ProjectManager
                  projects={projects}
                  onProjectsChange={onProjectsChange}
                  addProject={addProject}
                  editProject={editProject}
                  removeProject={removeProject}
                />
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>プロジェクト管理機能を読み込めませんでした</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="app" className="mt-6">
              <AppSettings captureInterval={captureInterval} onCaptureIntervalChange={onCaptureIntervalChange} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </ErrorBoundary>
  )
}

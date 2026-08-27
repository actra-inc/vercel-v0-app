"use client"
import { useState, useEffect } from "react"
import { ErrorBoundary } from "@/components/error-boundary"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, AlertCircle, X, Settings, Key, Link, FolderOpen, Info } from "lucide-react"
import { GeminiApiSettings } from "@/components/gemini-api-settings"
import { TogglSettings, type TogglSaveResult } from "@/components/toggl-settings"
import { ProjectManager } from "@/components/project-manager"
import { AppSettings } from "@/components/app-settings"
import { VersionInfo } from "@/components/version-info"
import { useTranslation } from "@/lib/i18n"

interface SettingsPanelProps {
  apiKey: string
  model: string
  togglApiToken: string
  togglWorkspaceId: string
  /** Toggl資格情報がDBではなくこの端末にだけ保存されている状態か */
  togglCredentialsLocalOnly?: boolean
  captureInterval: number
  onApiKeyChange: (apiKey: string) => Promise<void>
  onModelChange: (model: string) => void
  onTogglCredentialsChange: (token: string, workspaceId: string) => void | Promise<TogglSaveResult | void>
  onCaptureIntervalChange: (interval: number) => void
  onClose: () => void
  /** 開いたときに選択しておくタブ（他画面から「Toggl設定へ」などで飛べるように） */
  initialTab?: string
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
  togglCredentialsLocalOnly = false,
  captureInterval,
  onApiKeyChange,
  onModelChange,
  onTogglCredentialsChange,
  onCaptureIntervalChange,
  onClose,
  initialTab = "gemini",
  projects = [],
  onProjectsChange = () => {},
  addProject,
  editProject,
  removeProject,
}: SettingsPanelProps) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(initialTab)

  // 呼び出し元が開きたいタブを指定してきたら追従する
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    try {
      setMounted(true)
    } catch (err) {
      console.error("Settings panel mount error:", err)
      setError(err instanceof Error ? err.message : t('sp_mountError'))
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
                <p className="font-medium">{t('sp_loadError')}</p>
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
            <Loader2 className="h-6 w-6 animate-spin text-orange-600 mr-2" />
            <span className="text-gray-600">{t('sp_loading')}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <ErrorBoundary>
      <Card className="border-2 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-600" />
              {t('sp_title')}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common_close')}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="gemini" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                {t('sp_tabGemini')}
              </TabsTrigger>
              <TabsTrigger value="toggl" className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                {t('sp_tabToggl')}
              </TabsTrigger>
              <TabsTrigger value="projects" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                {t('sp_tabProjects')}
              </TabsTrigger>
              <TabsTrigger value="app" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('sp_tabOther')}
              </TabsTrigger>
              <TabsTrigger value="version" className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                {t('sp_tabVersion')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gemini" className="mt-6">
              <GeminiApiSettings
                apiKey={apiKey}
                model={model}
                onApiKeyChange={onApiKeyChange}
                onModelChange={onModelChange}
                captureInterval={captureInterval}
              />
            </TabsContent>

            <TabsContent value="toggl" className="mt-6">
              <TogglSettings
                savedApiToken={togglApiToken}
                savedWorkspaceId={togglWorkspaceId}
                credentialsLocalOnly={togglCredentialsLocalOnly}
                onCredentialsChange={onTogglCredentialsChange}
              />
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
                  <AlertDescription>{t('sp_projectLoadError')}</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="app" className="mt-6">
              <AppSettings captureInterval={captureInterval} onCaptureIntervalChange={onCaptureIntervalChange} />
            </TabsContent>

            <TabsContent value="version" className="mt-6">
              <VersionInfo />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </ErrorBoundary>
  )
}

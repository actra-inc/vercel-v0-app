"use client"
import { useTranslation } from "@/lib/i18n"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { FileText, TrendingUp, AlertTriangle, CheckCircle, Target, Clock, Trash2, RefreshCw, CalendarDays, Copy, Check, Wrench, ArrowRight } from "lucide-react"
import { deleteWorkLog, deleteAllReports } from "@/lib/supabase"

interface ReportData {
  summary: string
  productivity_analysis: string
  focus_trend: string
  distraction_summary: string
  time_distribution: {
    productive_time: number
    distracted_time: number
    neutral_time: number
  }
  key_findings: string[]
  recommendations: string[]
  overall_score: number
  source_screenshots?: string[]
}

// 日報（report_type='daily'）の report_data 構造
interface DailyReportData {
  date: string
  summary: string
  timeline: { time: string; activity: string; detail: string }[]
  achievements: string[]
  tools_used: string[]
  blockers: string[]
  tomorrow: string[]
  markdown: string
}

interface WorkLogEntry {
  id: string
  timestamp: Date | string
  activity: string
  category: "productive" | "distracted" | "neutral"
  details: string
  report_type?: string
  report_data?: ReportData | DailyReportData | any
}

interface ReportsTabProps {
  workLogs: WorkLogEntry[]
  userId: string
  onRefresh: () => void
  onGenerateReport?: () => Promise<void>
  canGenerate?: boolean
  onGenerateDailyReport?: () => Promise<void>
  canGenerateDaily?: boolean
}

// レポートに保存されたスクリーンショットURLのうち、そのまま描画してよいものだけを返す。
// href/src にそのまま流すと javascript: などのスキームが混ざったときに
// クリックでスクリプトが動くため、http(s)/data:image に限定する
function safeScreenshotUrls(source: unknown): string[] {
  if (!Array.isArray(source)) return []
  return source.filter(
    (url): url is string => typeof url === "string" && /^(https?:\/\/|data:image\/)/i.test(url.trim()),
  )
}

export function ReportsTab({
  workLogs,
  userId,
  onRefresh,
  onGenerateReport,
  canGenerate,
  onGenerateDailyReport,
  canGenerateDaily,
}: ReportsTabProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "ja" ? "ja-JP" : "en-US"
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  // 削除成功したレポートを即座に画面から消すためのローカル状態
  // （onRefreshの再取得を待たずにUIへ反映する）
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

  const handleGenerate = async () => {
    if (!onGenerateReport) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      await onGenerateReport()
    } catch (e) {
      setGenerateError(t('rt_generateError'))
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateDaily = async () => {
    if (!onGenerateDailyReport) return
    setIsGeneratingDaily(true)
    setGenerateError(null)
    try {
      await onGenerateDailyReport()
    } catch (e) {
      console.error("Daily report generation error:", e)
      // 日付跨ぎでボタンが活性のまま残った場合、「今日のログがない」のに
      // 汎用の失敗メッセージが出て誤解を招くため、原因別に文言を出し分ける
      const msg = e instanceof Error ? e.message : ""
      alert(msg === "No logs today" ? t('dr_noLogsToday') : t('dr_generateError'))
    } finally {
      setIsGeneratingDaily(false)
    }
  }

  // レポートのみを抽出し、日付順にソート
  // （summary=集中レポート、daily=日報。削除済みIDはローカルで即時除外）
  const reports = workLogs
    .filter((log) => {
      return (
        (log.report_type === "summary" || log.report_type === "daily") &&
        log.report_data != null &&
        !deletedIds.has(log.id)
      )
    })
    .sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime()
      const dateB = new Date(b.timestamp).getTime()
      return dateB - dateA
    })

  const handleDeleteReport = async (reportId: string) => {
    try {
      setDeletingId(reportId)
      const { error, deletedCount } = await deleteWorkLog(reportId, userId)

      if (error) {
        throw new Error(error.message || "Failed to delete report")
      }
      // RLSのDELETEポリシー欠如などで「エラーなし・0行削除」になるケースを検知
      if (deletedCount === 0) {
        throw new Error(t('rt_deleteNoPermission'))
      }

      // 再取得を待たずに画面から即時に消す
      setDeletedIds((prev) => {
        const next = new Set(prev)
        next.add(reportId)
        return next
      })
      alert(t('rt_deleted'))
      onRefresh()
    } catch (error) {
      console.error("Delete report error:", error)
      alert(error instanceof Error ? error.message : t('rt_deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteAllReports = async () => {
    try {
      setDeletingAll(true)
      const { error, deletedCount } = await deleteAllReports(userId)

      if (error) {
        throw new Error(error.message || "Failed to delete all reports")
      }
      if (deletedCount === 0) {
        throw new Error(t('rt_deleteNoPermission'))
      }

      // 表示中の全レポートを即時に消す
      setDeletedIds((prev) => {
        const next = new Set(prev)
        reports.forEach((r) => next.add(r.id))
        return next
      })
      alert(t('rt_allDeleted'))
      onRefresh()
    } catch (error) {
      console.error("Delete all reports error:", error)
      alert(error instanceof Error ? error.message : t('rt_allDeleteError'))
    } finally {
      setDeletingAll(false)
    }
  }

  if (reports.length === 0) {
    return (
      <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
        <CardContent className="p-12 text-center">
          <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('rt_noReports')}</h3>
          <p className="text-sm text-gray-500 mb-4">
            {t('rt_noReportsDesc')}
            <br />
            {t('rt_noReportsHint')}
          </p>
          {generateError && (
            <p className="text-sm text-red-500 mb-3">{generateError}</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
            {onGenerateReport && (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !canGenerate}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                title={!canGenerate ? t('rt_needMoreLogs') : t('rt_generateHint')}
              >
                <FileText className="h-4 w-4 mr-2" />
                {isGenerating ? t('rt_generating') : t('rt_generateReport')}
              </Button>
            )}
            {onGenerateDailyReport && (
              <Button
                onClick={handleGenerateDaily}
                disabled={isGeneratingDaily || !canGenerateDaily}
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50 bg-transparent"
                title={!canGenerateDaily ? t('dr_noLogsToday') : t('dr_generateHint')}
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                {isGeneratingDaily ? t('dr_generating') : t('dr_generateButton')}
              </Button>
            )}
            <Button onClick={onRefresh} variant="outline" className="bg-transparent">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common_refresh')}
            </Button>
          </div>
          {!canGenerate && (
            <p className="text-xs text-gray-400 mt-2">{t('rt_needMoreLogs')}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-orange-600" />
          <h2 className="text-2xl font-bold text-gray-800">{t('rt_title')}</h2>
          <Badge variant="secondary" className="text-lg">
            {reports.length}{t('ai_count_unit')}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {onGenerateDailyReport && (
            <Button
              onClick={handleGenerateDaily}
              disabled={isGeneratingDaily || !canGenerateDaily}
              variant="outline"
              size="sm"
              className="border-orange-300 text-orange-700 hover:bg-orange-50 bg-transparent"
              title={!canGenerateDaily ? t('dr_noLogsToday') : t('dr_generateHint')}
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              {isGeneratingDaily ? t('dr_generating') : t('dr_generateButton')}
            </Button>
          )}
          <Button onClick={onRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('common_refresh')}
          </Button>
          {reports.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 bg-transparent">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('rt_deleteAll')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('rt_confirmDeleteAll')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('rt_confirmDeleteAllDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common_cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAllReports}
                    disabled={deletingAll}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deletingAll ? t('rt_deleting') : t('rt_deleteAll')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* レポート一覧 */}
      <ScrollArea className="h-[750px]">
        <div className="space-y-6 px-6 pb-6">
          {reports.map((report, index) => {
            // 日報は専用カードで表示
            if (report.report_type === "daily") {
              return (
                <DailyReportCard
                  key={report.id}
                  report={report}
                  onDelete={() => handleDeleteReport(report.id)}
                  deleting={deletingId === report.id}
                />
              )
            }

            const data = report.report_data!
            // AI生成レポートはフィールドが欠けている場合があるため防御的に扱う
            const timeDistribution = data.time_distribution ?? {
              productive_time: 0,
              distracted_time: 0,
              neutral_time: 0,
            }
            const keyFindings: string[] = Array.isArray(data.key_findings) ? data.key_findings : []
            const recommendations: string[] = Array.isArray(data.recommendations) ? data.recommendations : []
            const timestamp = new Date(report.timestamp)

            return (
              <Card
                key={report.id}
                className="shadow-lg border-0 bg-gradient-to-br from-orange-50 via-white to-orange-50"
              >
                <CardHeader className="pb-4 bg-gradient-to-r from-orange-100 to-orange-100 rounded-t-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500 rounded-lg">
                        <FileText className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl text-gray-800">{t('rt_reportTitle', { num: String(reports.length - index) })}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {timestamp.toLocaleString(dateLocale, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50 text-lg px-4 py-1">
                        <Target className="h-4 w-4 mr-1" />
                        {data.overall_score ?? 0}{t('rt_scoreUnit')}
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('rt_confirmDeleteOne')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('rt_confirmDeleteOneDesc')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common_cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteReport(report.id)}
                              disabled={deletingId === report.id}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {deletingId === report.id ? t('rt_deleting') : t('common_delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {/* 解析元スクリーンショット */}
                  {safeScreenshotUrls(data.source_screenshots).length > 0 && (
                    <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                      <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-orange-600" />
                        {t('wsr_sourceScreenshots')}
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        {safeScreenshotUrls(data.source_screenshots).map((url: string, imgIndex: number) => (
                          <a key={imgIndex} href={url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={url}
                              alt={t('wsr_screenshotAlt', { num: imgIndex + 1 })}
                              className="w-full rounded border border-gray-200 object-cover aspect-video hover:opacity-80 transition-opacity"
                              onError={(e) => {
                                const anchor = e.currentTarget.closest("a")
                                if (anchor) anchor.style.display = "none"
                              }}
                            />
                          </a>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">{t('wsr_screenshotSessionNote')}</p>
                    </div>
                  )}

                  {/* サマリー */}
                  <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-orange-600" />
                      {t('wsr_overview')}
                    </h4>
                    <p className="text-gray-700">{data.summary}</p>
                  </div>

                  {/* 時間配分 */}
                  <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-orange-600" />
                      {t('wsr_timeDistribution')}
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{t('wsr_productiveTime')}</span>
                            <span className="font-semibold text-green-600">
                              {timeDistribution.productive_time}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${timeDistribution.productive_time}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{t('wsr_distractionTime')}</span>
                            <span className="font-semibold text-red-600">
                              {timeDistribution.distracted_time}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-red-500 h-2 rounded-full transition-all"
                              style={{ width: `${timeDistribution.distracted_time}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{t('wsr_neutralTime')}</span>
                            <span className="font-semibold text-gray-600">{timeDistribution.neutral_time}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gray-400 h-2 rounded-full transition-all"
                              style={{ width: `${timeDistribution.neutral_time}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 詳細分析セクション */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* 生産性分析 */}
                    <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                      <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-orange-600" />
                        {t('wsr_productivityAnalysis')}
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">{data.productivity_analysis}</p>
                    </div>

                    {/* 集中度の推移 */}
                    <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                      <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4 text-orange-600" />
                        {t('wsr_focusTrend')}
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">{data.focus_trend}</p>
                    </div>
                  </div>

                  {/* 脱線パターン */}
                  <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      {t('wsr_distractionPattern')}
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed">{data.distraction_summary}</p>
                  </div>

                  {/* 重要な発見 */}
                  <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-orange-600" />
                      {t('wsr_keyFindings')}
                    </h4>
                    <ul className="space-y-2">
                      {keyFindings.map((finding, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-orange-600 mt-0.5 flex-shrink-0">•</span>
                          <span className="leading-relaxed">{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 改善提案 */}
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4 text-green-600" />
                      {t('wsr_suggestions')}
                    </h4>
                    <ul className="space-y-2">
                      {recommendations.map((recommendation, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-green-600 mt-0.5 flex-shrink-0 font-bold">✓</span>
                          <span className="leading-relaxed font-medium">{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

// 日報カード（report_type='daily' の表示。既存レポートカードのデザイン言語を踏襲）
function DailyReportCard({
  report,
  onDelete,
  deleting,
}: {
  report: WorkLogEntry
  onDelete: () => void
  deleting: boolean
}) {
  const { t, language } = useTranslation()
  const dateLocale = language === "ja" ? "ja-JP" : "en-US"
  const [copied, setCopied] = useState(false)
  const data = (report.report_data ?? {}) as DailyReportData

  const timeline = Array.isArray(data.timeline) ? data.timeline : []
  const achievements = Array.isArray(data.achievements) ? data.achievements : []
  const toolsUsed = Array.isArray(data.tools_used) ? data.tools_used : []
  const blockers = Array.isArray(data.blockers) ? data.blockers : []
  const tomorrow = Array.isArray(data.tomorrow) ? data.tomorrow : []

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.markdown || data.summary || "")
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-orange-50 via-white to-orange-50">
      <CardHeader className="pb-4 bg-gradient-to-r from-orange-100 to-orange-100 rounded-t-lg">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500 rounded-lg">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-gray-800">
                {t('dr_cardTitle')} {data.date || ""}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                <Clock className="h-3 w-3 inline mr-1" />
                {new Date(report.timestamp).toLocaleString(dateLocale)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="border-orange-300 text-orange-700 hover:bg-orange-50 bg-transparent"
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? t('dr_copied') : t('dr_copyMarkdown')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('rt_confirmDeleteOne')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('rt_confirmDeleteOneDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common_cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
                    {deleting ? t('rt_deleting') : t('common_delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* サマリー */}
        {data.summary && (
          <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
            <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-600" />
              {t('dr_summary')}
            </h4>
            <p className="text-gray-700">{data.summary}</p>
          </div>
        )}

        {/* タイムライン */}
        {timeline.length > 0 && (
          <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              {t('dr_timeline')}
            </h4>
            <ul className="space-y-2">
              {timeline.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="font-mono text-orange-700 flex-shrink-0 mt-0.5">{item.time}</span>
                  <span className="leading-relaxed">
                    <span className="font-medium">{item.activity}</span>
                    {item.detail && <span className="text-gray-500"> — {item.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 本日の成果 */}
        {achievements.length > 0 && (
          <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-orange-600" />
              {t('dr_achievements')}
            </h4>
            <ul className="space-y-2">
              {achievements.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-orange-600 mt-0.5 flex-shrink-0">•</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 詰まった点・課題 */}
        {blockers.length > 0 && (
          <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              {t('dr_blockers')}
            </h4>
            <ul className="space-y-2">
              {blockers.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-orange-600 mt-0.5 flex-shrink-0">•</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 明日の予定 */}
        {tomorrow.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 shadow-sm">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-green-600" />
              {t('dr_tomorrow')}
            </h4>
            <ul className="space-y-2">
              {tomorrow.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-green-600 mt-0.5 flex-shrink-0 font-bold">✓</span>
                  <span className="leading-relaxed font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 使用ツール */}
        {toolsUsed.length > 0 && (
          <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-600" />
              {t('dr_toolsUsed')}
            </h4>
            <div className="flex flex-wrap gap-1">
              {toolsUsed.map((tool, idx) => (
                <Badge key={idx} variant="outline" className="text-xs border-gray-300 text-gray-600 bg-gray-50">
                  {tool}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

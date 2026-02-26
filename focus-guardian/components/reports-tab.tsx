"use client"

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
import { FileText, TrendingUp, AlertTriangle, CheckCircle, Target, Clock, Trash2, RefreshCw } from "lucide-react"
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
}

interface WorkLogEntry {
  id: string
  timestamp: Date | string
  activity: string
  category: "productive" | "distracted" | "neutral"
  details: string
  report_type?: string
  report_data?: ReportData
}

interface ReportsTabProps {
  workLogs: WorkLogEntry[]
  userId: string
  onRefresh: () => void
}

export function ReportsTab({ workLogs, userId, onRefresh }: ReportsTabProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)

  // レポートのみを抽出し、日付順にソート
  const reports = workLogs
    .filter((log) => {
      return log.report_type === "summary" && log.report_data != null
    })
    .sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime()
      const dateB = new Date(b.timestamp).getTime()
      return dateB - dateA
    })

  const handleDeleteReport = async (reportId: string) => {
    try {
      setDeletingId(reportId)
      const { error } = await deleteWorkLog(reportId)

      if (error) {
        throw new Error(error.message || "Failed to delete report")
      }

      alert("レポートを削除しました")
      onRefresh()
    } catch (error) {
      console.error("Delete report error:", error)
      alert(error instanceof Error ? error.message : "レポートの削除中にエラーが発生しました")
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteAllReports = async () => {
    try {
      setDeletingAll(true)
      const { error } = await deleteAllReports(userId)

      if (error) {
        throw new Error(error.message || "Failed to delete all reports")
      }

      alert("すべてのレポートを削除しました")
      onRefresh()
    } catch (error) {
      console.error("Delete all reports error:", error)
      alert(error instanceof Error ? error.message : "すべてのレポートの削除中にエラーが発生しました")
    } finally {
      setDeletingAll(false)
    }
  }

  if (reports.length === 0) {
    return (
      <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
        <CardContent className="p-12 text-center">
          <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">レポートがまだありません</h3>
          <p className="text-sm text-gray-500 mb-4">
            3件の作業ログが記録されると、自動的に統合レポートが生成されます。
            <br />
            画面解析を開始して作業を記録してください。
          </p>
          <Button onClick={onRefresh} variant="outline" className="mt-4 bg-transparent">
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-800">統合レポート履歴</h2>
          <Badge variant="secondary" className="text-lg">
            {reports.length}件
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </Button>
          {reports.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 bg-transparent">
                  <Trash2 className="h-4 w-4 mr-2" />
                  すべて削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>すべてのレポートを削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    この操作は取り消せません。すべてのレポート履歴が完全に削除されます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAllReports}
                    disabled={deletingAll}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deletingAll ? "削除中..." : "すべて削除"}
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
            const data = report.report_data!
            const timestamp = new Date(report.timestamp)

            return (
              <Card
                key={report.id}
                className="shadow-lg border-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50"
              >
                <CardHeader className="pb-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-t-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <FileText className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl text-gray-800">統合レポート #{reports.length - index}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {timestamp.toLocaleString("ja-JP", {
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
                      <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 text-lg px-4 py-1">
                        <Target className="h-4 w-4 mr-1" />
                        {data.overall_score}点
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>このレポートを削除しますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                              この操作は取り消せません。レポートが完全に削除されます。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteReport(report.id)}
                              disabled={deletingId === report.id}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {deletingId === report.id ? "削除中..." : "削除"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {/* サマリー */}
                  <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      概要
                    </h4>
                    <p className="text-gray-700">{data.summary}</p>
                  </div>

                  {/* 時間配分 */}
                  <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      時間配分
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">生産的な時間</span>
                            <span className="font-semibold text-green-600">
                              {data.time_distribution.productive_time}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${data.time_distribution.productive_time}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">脱線時間</span>
                            <span className="font-semibold text-red-600">
                              {data.time_distribution.distracted_time}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-red-500 h-2 rounded-full transition-all"
                              style={{ width: `${data.time_distribution.distracted_time}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">中立時間</span>
                            <span className="font-semibold text-gray-600">{data.time_distribution.neutral_time}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gray-400 h-2 rounded-full transition-all"
                              style={{ width: `${data.time_distribution.neutral_time}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 詳細分析セクション */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* 生産性分析 */}
                    <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
                      <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                        生産性分析
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">{data.productivity_analysis}</p>
                    </div>

                    {/* 集中度の推移 */}
                    <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
                      <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-600" />
                        集中度の推移
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">{data.focus_trend}</p>
                    </div>
                  </div>

                  {/* 脱線パターン */}
                  <div className="p-4 bg-white rounded-lg border border-orange-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      脱線パターン
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed">{data.distraction_summary}</p>
                  </div>

                  {/* 重要な発見 */}
                  <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      重要な発見
                    </h4>
                    <ul className="space-y-2">
                      {data.key_findings.map((finding, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-blue-600 mt-0.5 flex-shrink-0">•</span>
                          <span className="leading-relaxed">{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 改善提案 */}
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4 text-green-600" />
                      改善提案
                    </h4>
                    <ul className="space-y-2">
                      {data.recommendations.map((recommendation, idx) => (
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

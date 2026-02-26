"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Volume2, AlertTriangle, CheckCircle, Clock, Zap } from "lucide-react"
import { WorkSummaryReport } from "@/components/work-summary-report"

interface DistractionCheck {
  is_distracted: boolean
  reason: string
  planned_task: string
  severity: "high" | "medium" | "low"
}

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

interface WorkLogItemProps {
  log: {
    id: string
    timestamp: Date
    activity: string
    category: "productive" | "distracted" | "neutral"
    details: string
    screenshot_url?: string
    confidence?: number
    applications?: string[]
    focus_score?: number
    distraction_check?: DistractionCheck
    report_type?: string
    report_data?: ReportData
  }
  onPlayAlert: () => void
}

export function WorkLogItem({ log, onPlayAlert }: WorkLogItemProps) {
  // レポートタイプの場合は専用コンポーネントで表示
  if (log.report_type === "summary" && log.report_data) {
    return <WorkSummaryReport timestamp={log.timestamp} reportData={log.report_data} />
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "productive":
        return "bg-green-100 text-green-800 border-green-200"
      case "distracted":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "productive":
        return <CheckCircle className="h-4 w-4" />
      case "distracted":
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <Zap className="h-4 w-4" />
    }
  }

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800 border-red-300"
      case "medium":
        return "bg-orange-100 text-orange-800 border-orange-300"
      case "low":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      default:
        return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  return (
    <Card className="shadow-md border-0 bg-white/95 backdrop-blur-sm hover:shadow-lg transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={getCategoryColor(log.category)}>
                {getCategoryIcon(log.category)}
                <span className="ml-1">{log.activity}</span>
              </Badge>
              {log.focus_score !== undefined && (
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                  集中度: {log.focus_score}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {log.timestamp.toLocaleString("ja-JP")}
            </p>
          </div>
          {log.confidence !== undefined && (
            <Badge variant="secondary" className="bg-gray-100 text-gray-700">
              信頼度: {Math.round(log.confidence * 100)}%
            </Badge>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-gray-700">{log.details}</p>

          {log.applications && log.applications.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {log.applications.map((app, index) => (
                <Badge key={index} variant="outline" className="text-xs border-gray-300 text-gray-600 bg-gray-50">
                  {app}
                </Badge>
              ))}
            </div>
          )}

          {log.distraction_check?.is_distracted && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-red-800">脱線を検知しました</span>
                </div>
                <Badge variant="outline" className={getSeverityColor(log.distraction_check.severity)}>
                  {log.distraction_check.severity === "high"
                    ? "高"
                    : log.distraction_check.severity === "medium"
                      ? "中"
                      : "低"}
                </Badge>
              </div>
              <div className="text-sm text-red-700 space-y-1">
                <p>
                  <strong>理由:</strong> {log.distraction_check.reason}
                </p>
                <p>
                  <strong>予定作業:</strong> {log.distraction_check.planned_task}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onPlayAlert}
                className="w-full flex items-center justify-center gap-2 border-red-300 text-red-700 hover:bg-red-50 bg-transparent"
              >
                <Volume2 className="h-4 w-4" />
                アラート音を再生
              </Button>
            </div>
          )}

          {log.screenshot_url && (
            <div className="mt-3">
              <img
                src={log.screenshot_url || "/placeholder.svg"}
                alt="Screenshot"
                className="w-full h-auto rounded-lg border border-gray-200 shadow-sm"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

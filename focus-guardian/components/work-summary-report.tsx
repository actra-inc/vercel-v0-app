"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, TrendingUp, AlertTriangle, CheckCircle, Target, Clock } from "lucide-react"

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

interface WorkSummaryReportProps {
  timestamp: Date
  reportData: ReportData
}

export function WorkSummaryReport({ timestamp, reportData }: WorkSummaryReportProps) {
  return (
    <Card className="shadow-xl border-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <CardHeader className="pb-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-t-lg">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-gray-800">作業統合レポート（自動生成）</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                <Clock className="h-3 w-3 inline mr-1" />
                {timestamp.toLocaleString("ja-JP")}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 text-lg px-4 py-1">
            <Target className="h-4 w-4 mr-1" />
            {reportData.overall_score}点
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* サマリー */}
        <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            概要
          </h4>
          <p className="text-gray-700">{reportData.summary}</p>
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
                  <span className="font-semibold text-green-600">{reportData.time_distribution.productive_time}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${reportData.time_distribution.productive_time}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">脱線時間</span>
                  <span className="font-semibold text-red-600">{reportData.time_distribution.distracted_time}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{ width: `${reportData.time_distribution.distracted_time}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">中立時間</span>
                  <span className="font-semibold text-gray-600">{reportData.time_distribution.neutral_time}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gray-400 h-2 rounded-full"
                    style={{ width: `${reportData.time_distribution.neutral_time}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 生産性分析 */}
        <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            生産性分析
          </h4>
          <p className="text-gray-700">{reportData.productivity_analysis}</p>
        </div>

        {/* 集中度の推移 */}
        <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" />
            集中度の推移
          </h4>
          <p className="text-gray-700">{reportData.focus_trend}</p>
        </div>

        {/* 脱線パターン */}
        <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
          <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            脱線パターン
          </h4>
          <p className="text-gray-700">{reportData.distraction_summary}</p>
        </div>

        {/* 重要な発見 */}
        <div className="p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            重要な発見
          </h4>
          <ul className="space-y-2">
            {reportData.key_findings.map((finding, index) => (
              <li key={index} className="flex items-start gap-2 text-gray-700">
                <span className="text-blue-600 mt-1">•</span>
                <span>{finding}</span>
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
            {reportData.recommendations.map((recommendation, index) => (
              <li key={index} className="flex items-start gap-2 text-gray-700">
                <span className="text-green-600 mt-1">✓</span>
                <span>{recommendation}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

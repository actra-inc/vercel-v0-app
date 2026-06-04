"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Brain, Zap, TrendingUp } from "lucide-react"

interface AIAnalysisStatusProps {
  totalLogs: number
  averageFocusScore: number
  productivePercentage: number
  isAnalyzing: boolean
}

export function AIAnalysisStatus({
  totalLogs,
  averageFocusScore,
  productivePercentage,
  isAnalyzing,
}: AIAnalysisStatusProps) {
  const getFocusScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    if (score >= 40) return "text-orange-600"
    return "text-red-600"
  }

  const getProductivityColor = (percentage: number) => {
    if (percentage >= 70) return "text-green-600"
    if (percentage >= 50) return "text-yellow-600"
    return "text-red-600"
  }

  return (
    <Card className="mb-4 shadow-lg border-0 bg-gradient-to-br from-orange-50 to-amber-50">
      <CardHeader className="pb-3 bg-gradient-to-r from-orange-100 to-amber-100 rounded-t-lg border-b border-orange-200">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
          <Brain className="h-5 w-5 text-orange-600" />
          AI分析サマリー
          {isAnalyzing && (
            <Badge variant="secondary" className="animate-pulse bg-orange-100 text-orange-700 border-orange-200">
              解析中...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 総ログ数 */}
          <div className="text-center p-4 bg-white/60 rounded-lg border border-orange-100 shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="p-2 bg-orange-100 rounded-full">
                <Zap className="h-4 w-4 text-orange-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">解析済みログ</span>
            </div>
            <div className="text-3xl font-bold text-orange-600 mb-1">{totalLogs}</div>
            <div className="text-xs text-gray-500">件</div>
          </div>

          {/* 平均集中度 */}
          <div className="text-center p-4 bg-white/60 rounded-lg border border-amber-100 shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="p-2 bg-amber-100 rounded-full">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">平均集中度</span>
            </div>
            <div className={`text-3xl font-bold mb-1 ${getFocusScoreColor(averageFocusScore)}`}>
              {Math.round(averageFocusScore)}
            </div>
            <div className="text-xs text-gray-500 mb-2">/100</div>
            <Progress value={averageFocusScore} className="h-3 bg-gray-200" />
          </div>

          {/* 生産性率 */}
          <div className="text-center p-4 bg-white/60 rounded-lg border border-green-100 shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="p-2 bg-green-100 rounded-full">
                <Brain className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">生産性率</span>
            </div>
            <div className={`text-3xl font-bold mb-1 ${getProductivityColor(productivePercentage)}`}>
              {Math.round(productivePercentage)}%
            </div>
            <div className="text-xs text-gray-500 mb-2">productive活動の割合</div>
            <Progress value={productivePercentage} className="h-3 bg-gray-200" />
          </div>
        </div>

        {totalLogs > 0 && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="text-sm text-orange-800">
              💡 <strong>AI分析結果:</strong>
              {averageFocusScore >= 70
                ? " 高い集中力を維持できています！"
                : averageFocusScore >= 50
                  ? " 集中力にムラがあります。定期的な休憩を取りましょう。"
                  : " 集中力が低下しています。環境を見直してみてください。"}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

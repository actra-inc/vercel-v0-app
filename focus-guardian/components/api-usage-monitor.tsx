"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { BarChart3, Clock, Zap } from "lucide-react"

interface ApiUsageMonitorProps {
  requestCount: number
  onUsageUpdate: (count: number) => void
}

export function ApiUsageMonitor({ requestCount, onUsageUpdate }: ApiUsageMonitorProps) {
  const [dailyUsage, setDailyUsage] = useState(0)
  const [minuteUsage, setMinuteUsage] = useState(0)
  const [lastResetTime, setLastResetTime] = useState<Date>(new Date())

  // 無料枠の制限
  const DAILY_LIMIT = 1000000 // 1M tokens per day
  const MINUTE_LIMIT = 15 // 15 requests per minute

  useEffect(() => {
    // ローカルストレージから使用量を読み込み
    const savedUsage = localStorage.getItem("gemini_daily_usage")
    const savedDate = localStorage.getItem("gemini_usage_date")
    const today = new Date().toDateString()

    if (savedDate === today && savedUsage) {
      setDailyUsage(Number.parseInt(savedUsage))
    } else {
      // 新しい日なのでリセット
      setDailyUsage(0)
      localStorage.setItem("gemini_usage_date", today)
      localStorage.setItem("gemini_daily_usage", "0")
    }

    // 分単位の使用量をリセット
    const now = new Date()
    const currentMinute = now.getMinutes()
    const savedMinute = localStorage.getItem("gemini_current_minute")

    if (savedMinute !== currentMinute.toString()) {
      setMinuteUsage(0)
      localStorage.setItem("gemini_current_minute", currentMinute.toString())
      localStorage.setItem("gemini_minute_usage", "0")
    } else {
      const savedMinuteUsage = localStorage.getItem("gemini_minute_usage")
      if (savedMinuteUsage) {
        setMinuteUsage(Number.parseInt(savedMinuteUsage))
      }
    }
  }, [])

  useEffect(() => {
    // リクエスト数が更新されたら使用量を更新
    if (requestCount > 0) {
      const newMinuteUsage = minuteUsage + 1
      const newDailyUsage = dailyUsage + 1000 // 推定1000トークン/リクエスト

      setMinuteUsage(newMinuteUsage)
      setDailyUsage(newDailyUsage)

      localStorage.setItem("gemini_minute_usage", newMinuteUsage.toString())
      localStorage.setItem("gemini_daily_usage", newDailyUsage.toString())
    }
  }, [requestCount])

  const getUsageStatus = () => {
    if (minuteUsage >= MINUTE_LIMIT) {
      return { status: "danger", message: "分間制限に達しました" }
    }
    if (dailyUsage >= DAILY_LIMIT) {
      return { status: "danger", message: "日間制限に達しました" }
    }
    if (minuteUsage >= MINUTE_LIMIT * 0.8) {
      return { status: "warning", message: "分間制限に近づいています" }
    }
    if (dailyUsage >= DAILY_LIMIT * 0.8) {
      return { status: "warning", message: "日間制限に近づいています" }
    }
    return { status: "normal", message: "正常範囲内です" }
  }

  const usageStatus = getUsageStatus()
  const minutePercentage = (minuteUsage / MINUTE_LIMIT) * 100
  const dailyPercentage = (dailyUsage / DAILY_LIMIT) * 100

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          API使用量モニター
          <Badge
            variant={
              usageStatus.status === "danger"
                ? "destructive"
                : usageStatus.status === "warning"
                  ? "secondary"
                  : "default"
            }
          >
            {usageStatus.message}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 分間使用量 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">分間リクエスト数</span>
            </div>
            <span className="text-sm font-bold">
              {minuteUsage}/{MINUTE_LIMIT}
            </span>
          </div>
          <Progress
            value={minutePercentage}
            className="h-2"
            style={{
              background: minutePercentage >= 80 ? "#fee2e2" : "#f3f4f6",
            }}
          />
          <div className="text-xs text-gray-500">毎分リセット • 残り: {MINUTE_LIMIT - minuteUsage}リクエスト</div>
        </div>

        {/* 日間使用量 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">日間トークン数</span>
            </div>
            <span className="text-sm font-bold">
              {(dailyUsage / 1000).toFixed(1)}K/{(DAILY_LIMIT / 1000).toFixed(0)}K
            </span>
          </div>
          <Progress
            value={dailyPercentage}
            className="h-2"
            style={{
              background: dailyPercentage >= 80 ? "#fee2e2" : "#f3f4f6",
            }}
          />
          <div className="text-xs text-gray-500">
            毎日リセット • 残り: {((DAILY_LIMIT - dailyUsage) / 1000).toFixed(0)}Kトークン
          </div>
        </div>

        {/* 警告メッセージ */}
        {usageStatus.status !== "normal" && (
          <Alert
            className={usageStatus.status === "danger" ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50"}
          >
            <AlertDescription className={usageStatus.status === "danger" ? "text-red-800" : "text-yellow-800"}>
              {usageStatus.status === "danger" ? "⚠️" : "💡"} {usageStatus.message}
              {usageStatus.status === "danger" && (
                <div className="mt-1 text-xs">しばらく待ってから再試行してください。</div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* 使用量の詳細 */}
        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{requestCount}</div>
            <div className="text-xs text-gray-600">総リクエスト数</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              {Math.max(0, Math.floor((DAILY_LIMIT - dailyUsage) / 1000))}
            </div>
            <div className="text-xs text-gray-600">残りリクエスト数（推定）</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

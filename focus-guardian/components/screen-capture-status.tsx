"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Monitor, Camera, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ScreenCaptureStatusProps {
  isTracking: boolean
  isAnalyzing: boolean
  lastCaptureTime: Date | null
  mediaStream: MediaStream | null
}

export function ScreenCaptureStatus({
  isTracking,
  isAnalyzing,
  lastCaptureTime,
  mediaStream,
}: ScreenCaptureStatusProps) {
  const getStatusColor = () => {
    if (!isTracking) return "bg-gray-100 text-gray-800"
    if (isAnalyzing) return "bg-blue-100 text-blue-800"
    return "bg-green-100 text-green-800"
  }

  const getStatusText = () => {
    if (!isTracking) return "停止中"
    if (isAnalyzing) return "解析中"
    return "監視中"
  }

  const getStatusIcon = () => {
    if (!isTracking) return <Monitor className="h-4 w-4" />
    if (isAnalyzing) return <Camera className="h-4 w-4 animate-pulse" />
    return <Monitor className="h-4 w-4" />
  }

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-full", getStatusColor())}>{getStatusIcon()}</div>
            <div>
              <div className="font-medium">画面キャプチャ</div>
              <div className="text-sm text-gray-600">{isTracking ? "30秒間隔で自動解析" : "画面共有が必要です"}</div>
            </div>
          </div>

          <div className="text-right">
            <Badge variant="outline" className={getStatusColor()}>
              {getStatusText()}
            </Badge>
            {lastCaptureTime && (
              <div className="text-xs text-gray-500 mt-1">{lastCaptureTime.toLocaleTimeString("ja-JP")}</div>
            )}
          </div>
        </div>

        {isTracking && !mediaStream && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800">画面共有の許可を待っています...</span>
          </div>
        )}

        {isTracking && mediaStream && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm text-green-800">✅ 画面共有が有効です。30秒間隔で自動キャプチャ中...</div>
          </div>
        )}

        {!isTracking && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm text-blue-800">
              💡 <strong>画面共有の手順:</strong>
              <ol className="mt-2 list-decimal list-inside space-y-1 text-blue-700">
                <li>「開始」ボタンをクリック</li>
                <li>ブラウザの許可ダイアログで共有する画面/ウィンドウを選択</li>
                <li>「共有」ボタンをクリックして許可</li>
                <li>自動的に30秒間隔でキャプチャが開始されます</li>
              </ol>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

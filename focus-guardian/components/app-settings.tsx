"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface AppSettingsProps {
  captureInterval: number
  onCaptureIntervalChange: (interval: number) => void
}

export function AppSettings({ captureInterval, onCaptureIntervalChange }: AppSettingsProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            アプリケーション設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-4">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          アプリケーション設定
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="capture-interval">画面キャプチャ間隔</Label>
            <Select
              value={captureInterval.toString()}
              onValueChange={(value) => onCaptureIntervalChange(Number(value))}
            >
              <SelectTrigger id="capture-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30秒ごと</SelectItem>
                <SelectItem value="60">1分ごと</SelectItem>
                <SelectItem value="120">2分ごと</SelectItem>
                <SelectItem value="300">5分ごと</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">集中作業時は短い間隔、バッテリー節約時は長い間隔がおすすめです</p>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm text-blue-800">
              <div className="font-medium mb-2">💡 推奨設定:</div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>集中作業時: 30秒〜1分間隔</li>
                <li>調査・学習時: 1〜2分間隔</li>
                <li>バッテリー節約: 5分間隔</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Settings } from "lucide-react"

interface CaptureSettingsProps {
  onIntervalChange: (interval: number) => void
  onQualityChange: (quality: number) => void
}

export function CaptureSettings({ onIntervalChange, onQualityChange }: CaptureSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [interval, setInterval] = useState(30)
  const [quality, setQuality] = useState(0.8)
  const [autoAnalysis, setAutoAnalysis] = useState(true)

  const handleIntervalChange = (value: string) => {
    const newInterval = Number.parseInt(value)
    setInterval(newInterval)
    onIntervalChange(newInterval * 1000) // ミリ秒に変換
  }

  const handleQualityChange = (value: string) => {
    const newQuality = Number.parseFloat(value)
    setQuality(newQuality)
    onQualityChange(newQuality)
  }

  if (!isOpen) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)} className="flex items-center gap-2">
        <Settings className="h-4 w-4" />
        設定
      </Button>
    )
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">キャプチャ設定</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            ✕
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="interval">キャプチャ間隔</Label>
            <Select value={interval.toString()} onValueChange={handleIntervalChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10秒</SelectItem>
                <SelectItem value="30">30秒</SelectItem>
                <SelectItem value="60">1分</SelectItem>
                <SelectItem value="120">2分</SelectItem>
                <SelectItem value="300">5分</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quality">画質</Label>
            <Select value={quality.toString()} onValueChange={handleQualityChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">低画質</SelectItem>
                <SelectItem value="0.8">標準</SelectItem>
                <SelectItem value="1.0">高画質</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="auto-analysis">自動AI解析</Label>
          <Switch id="auto-analysis" checked={autoAnalysis} onCheckedChange={setAutoAnalysis} />
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p>
            💡 <strong>推奨設定:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>集中作業時: 1-2分間隔</li>
            <li>調査・学習時: 30秒間隔</li>
            <li>バッテリー節約: 5分間隔 + 低画質</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

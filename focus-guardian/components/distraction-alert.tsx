"use client"

import { useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle, X, Volume2 } from "lucide-react"

interface DistractionResult {
  is_distracted: boolean
  reason: string
  severity: "high" | "medium" | "low"
  suggestion: string
  timestamp: string
}

interface DistractionAlertProps {
  result: DistractionResult | null
  plannedTask: string
  actualActivity: string
  onDismiss: () => void
}

export function DistractionAlert({ result, plannedTask, actualActivity, onDismiss }: DistractionAlertProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // 脱線検知時に音を鳴らす
    if (result?.is_distracted) {
      playAlertSound()
    }
  }, [result])

  const playAlertSound = () => {
    // Web Audio APIで警告音を生成
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

    // 警告音のパラメータ
    const frequency1 = 800 // Hz
    const frequency2 = 600 // Hz
    const duration = 0.3 // 秒

    // 2回鳴らす
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.setValueAtTime(frequency1, audioContext.currentTime)
        oscillator.frequency.setValueAtTime(frequency2, audioContext.currentTime + duration / 2)

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + duration)
      }, i * 400)
    }
  }

  if (!result) return null

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "border-red-200 bg-red-50"
      case "medium":
        return "border-orange-200 bg-orange-50"
      case "low":
        return "border-yellow-200 bg-yellow-50"
      default:
        return "border-gray-200 bg-gray-50"
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "high":
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      case "medium":
        return <AlertTriangle className="h-5 w-5 text-orange-600" />
      case "low":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      default:
        return <CheckCircle className="h-5 w-5 text-green-600" />
    }
  }

  return (
    <Card
      className={`mb-4 border-2 ${result.is_distracted ? getSeverityColor(result.severity) : "border-green-200 bg-green-50"}`}
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {result.is_distracted ? (
              getSeverityIcon(result.severity)
            ) : (
              <CheckCircle className="h-5 w-5 text-green-600" />
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="font-semibold text-lg">
                {result.is_distracted ? "🚨 脱線を検知しました" : "✅ 集中して作業中"}
              </div>
              <div className="text-sm text-gray-600 mt-1">{result.reason}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-white/50 rounded-lg">
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">予定していた作業</div>
                <div className="text-sm">{plannedTask}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">実際の活動</div>
                <div className="text-sm">{actualActivity}</div>
              </div>
            </div>

            {result.is_distracted && (
              <Alert className="border-blue-200 bg-blue-50">
                <AlertDescription className="text-blue-800">
                  💡 <strong>提案:</strong> {result.suggestion}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={playAlertSound} className="h-8 w-8 p-0" title="音を再生">
              <Volume2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

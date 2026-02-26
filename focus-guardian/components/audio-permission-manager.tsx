"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Volume2, VolumeX, CheckCircle, AlertTriangle } from "lucide-react"

interface AudioPermissionManagerProps {
  onPermissionGranted: () => void
}

export function AudioPermissionManager({ onPermissionGranted }: AudioPermissionManagerProps) {
  const [audioPermission, setAudioPermission] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown")
  const [isTestingAudio, setIsTestingAudio] = useState(false)

  useEffect(() => {
    checkAudioPermission()
  }, [])

  const checkAudioPermission = async () => {
    try {
      // Web Audio APIの利用可能性をチェック
      if (!window.AudioContext && !(window as any).webkitAudioContext) {
        setAudioPermission("denied")
        return
      }

      // 基本的にWeb Audio APIは許可不要だが、ユーザーインタラクションが必要
      setAudioPermission("prompt")
    } catch (error) {
      console.error("Audio permission check error:", error)
      setAudioPermission("denied")
    }
  }

  const requestAudioPermission = async () => {
    try {
      setIsTestingAudio(true)

      // ユーザーインタラクションによってAudioContextを初期化
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass()

      // テスト音を再生
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)

      setAudioPermission("granted")
      onPermissionGranted()

      setTimeout(() => {
        audioContext.close()
      }, 1000)
    } catch (error) {
      console.error("Audio permission request error:", error)
      setAudioPermission("denied")
    } finally {
      setIsTestingAudio(false)
    }
  }

  const playTestSound = async () => {
    try {
      setIsTestingAudio(true)

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass()

      // 脱線警告音のテスト
      for (let i = 0; i < 2; i++) {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator()
          const gainNode = audioContext.createGain()

          oscillator.connect(gainNode)
          gainNode.connect(audioContext.destination)

          oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.15)

          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

          oscillator.start(audioContext.currentTime)
          oscillator.stop(audioContext.currentTime + 0.3)
        }, i * 400)
      }

      setTimeout(() => {
        audioContext.close()
        setIsTestingAudio(false)
      }, 1000)
    } catch (error) {
      console.error("Test sound error:", error)
      setIsTestingAudio(false)
    }
  }

  const getPermissionIcon = () => {
    switch (audioPermission) {
      case "granted":
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case "denied":
        return <VolumeX className="h-5 w-5 text-red-600" />
      case "prompt":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      default:
        return <Volume2 className="h-5 w-5 text-gray-600" />
    }
  }

  const getPermissionColor = () => {
    switch (audioPermission) {
      case "granted":
        return "border-green-200 bg-green-50"
      case "denied":
        return "border-red-200 bg-red-50"
      case "prompt":
        return "border-yellow-200 bg-yellow-50"
      default:
        return "border-gray-200 bg-gray-50"
    }
  }

  if (audioPermission === "granted") {
    return (
      <Alert className="border-green-200 bg-green-50 mb-4">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="flex items-center justify-between">
          <span>🔊 音声アラート機能が有効です</span>
          <Button variant="outline" size="sm" onClick={playTestSound} disabled={isTestingAudio}>
            {isTestingAudio ? "再生中..." : "テスト音"}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          {getPermissionIcon()}
          音声アラート設定
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className={getPermissionColor()}>
          <AlertDescription>
            {audioPermission === "prompt" && (
              <div>
                <div className="font-medium mb-2">🔊 音声アラート機能を有効にしてください</div>
                <div className="text-sm">脱線検知時に警告音を再生するため、音声機能の初期化が必要です。</div>
              </div>
            )}
            {audioPermission === "denied" && (
              <div>
                <div className="font-medium mb-2 text-red-800">❌ 音声機能が利用できません</div>
                <div className="text-sm text-red-700">
                  ブラウザまたはシステムの設定で音声が無効になっている可能性があります。
                </div>
              </div>
            )}
          </AlertDescription>
        </Alert>

        {audioPermission === "prompt" && (
          <div className="space-y-3">
            <Button onClick={requestAudioPermission} disabled={isTestingAudio} className="w-full">
              {isTestingAudio ? "テスト中..." : "音声アラートを有効にする"}
            </Button>

            <div className="text-sm text-gray-600">
              <div className="font-medium mb-2">🍎 macOS での音声設定:</div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>システム設定 &gt; サウンド &gt; 出力 でスピーカーが選択されていることを確認</li>
                <li>ブラウザの音量がミュートになっていないことを確認</li>
                <li>システムの音量が適切に設定されていることを確認</li>
                <li>「おやすみモード」が有効になっていないことを確認</li>
              </ul>
            </div>
          </div>
        )}

        {audioPermission === "granted" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={playTestSound}
              disabled={isTestingAudio}
              className="flex-1 bg-transparent"
            >
              {isTestingAudio ? "再生中..." : "警告音をテスト"}
            </Button>
            <Button variant="outline" onClick={checkAudioPermission} className="flex-1 bg-transparent">
              再確認
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

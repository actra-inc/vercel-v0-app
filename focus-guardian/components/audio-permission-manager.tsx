"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Volume2, VolumeX, CheckCircle, AlertTriangle } from "lucide-react"
import { useTranslation } from "@/lib/i18n"

interface AudioPermissionManagerProps {
  onPermissionGranted: () => void
}

export function AudioPermissionManager({ onPermissionGranted }: AudioPermissionManagerProps) {
  const { t } = useTranslation()
  const [audioPermission, setAudioPermission] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown")
  const [isTestingAudio, setIsTestingAudio] = useState(false)

  useEffect(() => {
    checkAudioPermission()
  }, [])

  const checkAudioPermission = async () => {
    try {
      if (!window.AudioContext && !(window as any).webkitAudioContext) {
        setAudioPermission("denied")
        return
      }
      setAudioPermission("prompt")
    } catch (error) {
      console.error("Audio permission check error:", error)
      setAudioPermission("denied")
    }
  }

  const requestAudioPermission = async () => {
    try {
      setIsTestingAudio(true)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass()

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
          <span>{t('ap_granted')}</span>
          <Button variant="outline" size="sm" onClick={playTestSound} disabled={isTestingAudio}>
            {isTestingAudio ? t('ap_playingTest') : t('ap_testSound')}
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
          {t('ap_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className={getPermissionColor()}>
          <AlertDescription>
            {audioPermission === "prompt" && (
              <div>
                <div className="font-medium mb-2">{t('ap_promptTitle')}</div>
                <div className="text-sm">{t('ap_promptDesc')}</div>
              </div>
            )}
            {audioPermission === "denied" && (
              <div>
                <div className="font-medium mb-2 text-red-800">{t('ap_deniedTitle')}</div>
                <div className="text-sm text-red-700">{t('ap_deniedDesc')}</div>
              </div>
            )}
          </AlertDescription>
        </Alert>

        {audioPermission === "prompt" && (
          <div className="space-y-3">
            <Button onClick={requestAudioPermission} disabled={isTestingAudio} className="w-full">
              {isTestingAudio ? t('ap_testingButton') : t('ap_enableButton')}
            </Button>

            <div className="text-sm text-gray-600">
              <div className="font-medium mb-2">{t('ap_macTitle')}</div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>{t('ap_macStep1')}</li>
                <li>{t('ap_macStep2')}</li>
                <li>{t('ap_macStep3')}</li>
                <li>{t('ap_macStep4')}</li>
              </ul>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle } from "lucide-react"

interface BrowserInfo {
  name: string
  version: string
  isSupported: boolean
  isMac: boolean
}

export function BrowserCompatibility() {
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null)

  useEffect(() => {
    const detectBrowser = (): BrowserInfo => {
      const userAgent = navigator.userAgent
      const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform)

      let name = "Unknown"
      let version = "Unknown"
      let isSupported = false

      if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
        name = "Chrome"
        const match = userAgent.match(/Chrome\/(\d+)/)
        version = match ? match[1] : "Unknown"
        isSupported = Number.parseInt(version) >= 72 // Chrome 72+ supports getDisplayMedia
      } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
        name = "Safari"
        const match = userAgent.match(/Version\/(\d+)/)
        version = match ? match[1] : "Unknown"
        isSupported = Number.parseInt(version) >= 13 // Safari 13+ supports getDisplayMedia
      } else if (userAgent.includes("Firefox")) {
        name = "Firefox"
        const match = userAgent.match(/Firefox\/(\d+)/)
        version = match ? match[1] : "Unknown"
        isSupported = Number.parseInt(version) >= 66 // Firefox 66+ supports getDisplayMedia
      } else if (userAgent.includes("Edg")) {
        name = "Edge"
        const match = userAgent.match(/Edg\/(\d+)/)
        version = match ? match[1] : "Unknown"
        isSupported = Number.parseInt(version) >= 79 // Edge 79+ supports getDisplayMedia
      }

      return { name, version, isSupported, isMac }
    }

    setBrowserInfo(detectBrowser())
  }, [])

  if (!browserInfo) return null

  const getStatusIcon = () => {
    if (browserInfo.isSupported) {
      return <CheckCircle className="h-4 w-4 text-green-600" />
    }
    return <XCircle className="h-4 w-4 text-red-600" />
  }

  const getStatusColor = () => {
    if (browserInfo.isSupported) {
      return "border-green-200 bg-green-50"
    }
    return "border-red-200 bg-red-50"
  }

  return (
    <Alert className={`mb-4 ${getStatusColor()}`}>
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <AlertDescription className="flex items-center gap-2">
          <span>
            {browserInfo.name} {browserInfo.version}
            {browserInfo.isMac && " (macOS)"}
          </span>
          <Badge variant={browserInfo.isSupported ? "default" : "destructive"}>
            {browserInfo.isSupported ? "対応" : "非対応"}
          </Badge>
        </AlertDescription>
      </div>

      {!browserInfo.isSupported && (
        <div className="mt-2 text-sm text-red-700">
          <div className="font-medium">推奨ブラウザ:</div>
          <ul className="mt-1 space-y-1">
            <li>• Chrome 72以降</li>
            <li>• Safari 13以降 (macOS)</li>
            <li>• Firefox 66以降</li>
            <li>• Edge 79以降</li>
          </ul>
        </div>
      )}

      {browserInfo.isSupported && browserInfo.isMac && (
        <div className="mt-2 text-sm text-green-700">
          ✅ ブラウザは対応しています。macOSの画面収録権限の設定をご確認ください。
        </div>
      )}
    </Alert>
  )
}

"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Monitor, Shield, RefreshCw, ExternalLink } from "lucide-react"

export function MacSetupGuide() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const setupSteps = [
    {
      title: "システム設定を開く",
      description: "Appleメニュー > システム設定 をクリック",
      icon: <Shield className="h-5 w-5" />,
    },
    {
      title: "プライバシーとセキュリティ",
      description: "左サイドバーから「プライバシーとセキュリティ」を選択",
      icon: <Shield className="h-5 w-5" />,
    },
    {
      title: "画面収録を許可",
      description: "「画面収録」をクリックし、使用中のブラウザ（Safari/Chrome）をオンにする",
      icon: <Monitor className="h-5 w-5" />,
    },
    {
      title: "ブラウザを再起動",
      description: "ブラウザを完全に終了して再起動する",
      icon: <RefreshCw className="h-5 w-5" />,
    },
  ]

  const detectBrowser = () => {
    const userAgent = navigator.userAgent
    if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
      return "Safari"
    } else if (userAgent.includes("Chrome")) {
      return "Chrome"
    } else if (userAgent.includes("Firefox")) {
      return "Firefox"
    }
    return "ブラウザ"
  }

  const browserName = detectBrowser()

  if (!isExpanded) {
    return (
      <Alert className="mb-4">
        <Shield className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>🍎 Mac で画面共有を使用するには追加設定が必要です</span>
          <Button variant="outline" size="sm" onClick={() => setIsExpanded(true)}>
            設定方法を見る
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            🍎 Mac での画面共有設定
            <Badge variant="outline">{browserName}</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
            ✕
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {setupSteps.map((step, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                index === currentStep
                  ? "bg-blue-50 border-blue-200"
                  : index < currentStep
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 border-gray-200"
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  index === currentStep
                    ? "bg-blue-100 text-blue-600"
                    : index < currentStep
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {step.icon}
              </div>
              <div className="flex-1">
                <div className="font-medium">{step.title}</div>
                <div className="text-sm text-gray-600 mt-1">{step.description}</div>
              </div>
              <div className="flex items-center gap-2">
                {index < currentStep && <span className="text-green-600">✓</span>}
                {index === currentStep && (
                  <Button size="sm" onClick={() => setCurrentStep(index + 1)}>
                    完了
                  </Button>
                )}
              </div>
            </div>
          ))}

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-yellow-600">⚠️</span>
              <div className="text-sm">
                <div className="font-medium text-yellow-800">重要な注意事項:</div>
                <ul className="mt-2 space-y-1 text-yellow-700">
                  <li>• 設定変更後は必ずブラウザを完全に再起動してください</li>
                  <li>• 初回は「画面を共有しますか？」のダイアログが表示されます</li>
                  <li>• プライベートブラウジングでは動作しない場合があります</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
              }
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              システム設定を開く
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              ページを再読み込み
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

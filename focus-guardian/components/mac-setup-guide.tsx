"use client"
import { useTranslation } from "@/lib/i18n"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Monitor, Shield, RefreshCw, ExternalLink } from "lucide-react"

export function MacSetupGuide() {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const setupSteps = [
    {
      title: t('ms_step1Title'),
      description: t('ms_step1Desc'),
      icon: <Shield className="h-5 w-5" />,
    },
    {
      title: t('ms_step2Title'),
      description: t('ms_step2Desc'),
      icon: <Shield className="h-5 w-5" />,
    },
    {
      title: t('ms_step3Title'),
      description: t('ms_step3Desc'),
      icon: <Monitor className="h-5 w-5" />,
    },
    {
      title: t('ms_step4Title'),
      description: t('ms_step4Desc'),
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
    return t('ms_browser')
  }

  const browserName = detectBrowser()

  if (!isExpanded) {
    return (
      <Alert className="mb-4">
        <Shield className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{t('ms_alertText')}</span>
          <Button variant="outline" size="sm" onClick={() => setIsExpanded(true)}>
            {t('ms_setupButton')}
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
            {t('ms_cardTitle')}
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
                  ? "bg-orange-50 border-orange-200"
                  : index < currentStep
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 border-gray-200"
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  index === currentStep
                    ? "bg-orange-100 text-orange-600"
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
                <div className="font-medium text-yellow-800">{t('ms_important')}</div>
                <ul className="mt-2 space-y-1 text-yellow-700">
                  <li>• {t('ms_note1')}</li>
                  <li>• {t('ms_note2')}</li>
                  <li>• {t('ms_note3')}</li>
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

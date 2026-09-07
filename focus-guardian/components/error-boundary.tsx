"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { useTranslation } from "@/lib/i18n"

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo)
    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />
    }

    return this.props.children
  }
}

// クラスコンポーネント（境界）では hooks が使えないため、表示は関数コンポーネントに分ける
function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="m-4 border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-5 w-5" />
          {t('eb_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-red-300 bg-white">
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium text-red-900">{t('eb_desc')}</p>
              {error && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-red-700 hover:text-red-900">{t('eb_showDetails')}</summary>
                  <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 overflow-auto">
                    <div className="font-mono text-xs">
                      <div className="text-red-600 font-bold mb-2">{error.message}</div>
                      <div className="text-gray-600 whitespace-pre-wrap">{error.stack}</div>
                    </div>
                  </div>
                </details>
              )}
            </div>
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button onClick={onReset} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('eb_reload')}
          </Button>
        </div>

        <div className="text-sm text-gray-600">
          <p className="font-medium mb-2">{t('eb_troubleshootTitle')}</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>{t('eb_step1')}</li>
            <li>{t('eb_step2')}</li>
            <li>{t('eb_step3')}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

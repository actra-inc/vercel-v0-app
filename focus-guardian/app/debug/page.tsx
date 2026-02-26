"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, RefreshCw, Trash2 } from "lucide-react"
import {
  getEnvironmentInfo,
  clearAllStorage,
  testSupabaseConnection,
  validateUrls,
  generateCorrectUrls,
} from "@/lib/debug-utils"

export default function DebugPage() {
  const [envInfo, setEnvInfo] = useState(null)
  const [supabaseTest, setSupabaseTest] = useState(null)
  const [urlValidation, setUrlValidation] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadDebugInfo()
  }, [])

  const loadDebugInfo = async () => {
    setLoading(true)
    try {
      const env = getEnvironmentInfo()
      const validation = validateUrls()
      const supabase = await testSupabaseConnection()

      setEnvInfo(env)
      setUrlValidation(validation)
      setSupabaseTest(supabase)
    } catch (error) {
      console.error("Debug info loading error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleClearStorage = () => {
    const success = clearAllStorage()
    if (success) {
      alert("ストレージをクリアしました。ページをリロードしてください。")
      window.location.reload()
    } else {
      alert("ストレージのクリアに失敗しました。")
    }
  }

  const correctUrls = typeof window !== "undefined" ? generateCorrectUrls(window.location.origin) : null

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🔍 デバッグページ</h1>
          <p className="text-gray-600">アプリケーションの状態と設定を確認します</p>
        </div>

        <div className="flex gap-4 justify-center">
          <Button onClick={loadDebugInfo} disabled={loading} className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            再読み込み
          </Button>
          <Button onClick={handleClearStorage} variant="destructive" className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            ストレージクリア
          </Button>
        </div>

        {/* 環境変数の状態 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {urlValidation?.isValid ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              環境変数の状態
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {envInfo && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">NEXTAUTH_URL</label>
                  <div className="flex items-center gap-2">
                    <Badge variant={envInfo.nextAuthUrl ? "default" : "destructive"}>
                      {envInfo.nextAuthUrl || "未設定"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">NEXTAUTH_SECRET</label>
                  <div className="flex items-center gap-2">
                    <Badge variant={envInfo.nextAuthSecret === "***SET***" ? "default" : "destructive"}>
                      {envInfo.nextAuthSecret}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">SUPABASE_URL</label>
                  <div className="flex items-center gap-2">
                    <Badge variant={envInfo.supabaseUrl ? "default" : "destructive"}>
                      {envInfo.supabaseUrl || "未設定"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">SUPABASE_ANON_KEY</label>
                  <div className="flex items-center gap-2">
                    <Badge variant={envInfo.supabaseAnonKey === "***SET***" ? "default" : "destructive"}>
                      {envInfo.supabaseAnonKey}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {urlValidation?.issues && urlValidation.issues.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-medium text-red-800 mb-2">⚠️ 設定の問題</h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {urlValidation.issues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Supabase接続テスト */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {supabaseTest?.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              Supabase接続テスト
            </CardTitle>
          </CardHeader>
          <CardContent>
            {supabaseTest ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={supabaseTest.success ? "default" : "destructive"}>
                    {supabaseTest.success ? "接続成功" : "接続失敗"}
                  </Badge>
                </div>
                {supabaseTest.error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-sm text-red-700">{supabaseTest.error}</p>
                  </div>
                )}
                {supabaseTest.tables && (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <p className="text-sm text-green-700">テーブル数: {supabaseTest.tables.length}</p>
                    <p className="text-xs text-green-600 mt-1">{supabaseTest.tables.join(", ")}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">テスト中...</p>
            )}
          </CardContent>
        </Card>

        {/* 正しい設定値 */}
        {correctUrls && (
          <Card>
            <CardHeader>
              <CardTitle>🔧 正しい設定値</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Vercel環境変数</h4>
                <div className="bg-gray-100 rounded p-3 font-mono text-sm">
                  <div>NEXTAUTH_URL={correctUrls.nextAuthUrl}</div>
                  <div>NEXTAUTH_SECRET=your-random-secret-32-chars-minimum</div>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Supabase認証設定</h4>
                <div className="bg-gray-100 rounded p-3 font-mono text-sm">
                  <div>Site URL: {correctUrls.supabaseSiteUrl}</div>
                  <div>Redirect URLs: {correctUrls.supabaseRedirectUrl}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 現在のURL情報 */}
        <Card>
          <CardHeader>
            <CardTitle>📍 現在のURL情報</CardTitle>
          </CardHeader>
          <CardContent>
            {typeof window !== "undefined" && (
              <div className="space-y-2 font-mono text-sm">
                <div>Origin: {window.location.origin}</div>
                <div>Full URL: {window.location.href}</div>
                <div>User Agent: {navigator.userAgent.substring(0, 100)}...</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

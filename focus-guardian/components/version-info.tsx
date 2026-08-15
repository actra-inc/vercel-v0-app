"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Info } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import { APP_VERSION, BUILD_COMMIT, BUILD_TIME, ENV_LABEL, FULL_VERSION_LABEL } from "@/lib/version"

// 設定 > バージョン情報タブ。
// どのデプロイ（ビルド）を使っているかを画面から確認できるようにする
export function VersionInfo() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          {t('as_buildInfo')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* トップページのフッターと同じ1行表示 */}
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-sm font-mono text-gray-800 break-all">{FULL_VERSION_LABEL}</p>
        </div>

        {/* 項目ごとの詳細 */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <dl className="space-y-2 text-sm">
            {[
              { label: t('as_buildVersion'), value: `v${APP_VERSION}` },
              { label: t('as_buildCommit'), value: BUILD_COMMIT },
              { label: t('as_buildEnv'), value: ENV_LABEL },
              { label: t('as_buildTime'), value: BUILD_TIME },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-gray-500 flex-shrink-0">{label}</dt>
                <dd className="font-mono text-gray-800 truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-gray-500">{t('as_buildInfoHint')}</p>
      </CardContent>
    </Card>
  )
}

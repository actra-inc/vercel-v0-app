"use client"

import { FULL_VERSION_LABEL } from "@/lib/version"

/**
 * デプロイされているビルドを画面から識別するための表示。
 * ステージング環境で「プッシュした修正が反映されているか」を
 * コミットハッシュとビルド時刻で確認できるようにする。
 */
export function VersionBadge({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-gray-400 font-mono ${className}`} title="ビルド情報（バージョン・コミット・環境・ビルド日時）">
      {FULL_VERSION_LABEL}
    </p>
  )
}

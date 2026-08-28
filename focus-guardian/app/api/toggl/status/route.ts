import { NextResponse } from "next/server"
import { getAuthenticatedUser, hasTogglEnvCredentials, isTogglEnvOwner } from "@/lib/toggl-server"

// 認証チェックにcookieを使うため Node.js ランタイムで実行する
// （以前は edge かつ無認証で、誰でもサーバー側のToggl設定の有無を確認できた）

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: ログインが必要です" }, { status: 401 })
  }

  // 「サーバー側の環境変数で設定済み（個人運用モード）」と言えるのはオーナー本人だけ。
  // 他のユーザーに configured: true を返すと、実際には使えない資格情報を
  // 「設定済み」と表示してしまう
  const configured = hasTogglEnvCredentials() && isTogglEnvOwner(user)

  return NextResponse.json({ configured })
}

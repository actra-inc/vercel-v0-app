// 本番環境用設定

// 画面キャプチャ間隔の既定値（秒）。
// 新規ユーザー作成時（use-supabase-data）と設定未取得時のフォールバック（page.tsx）の
// 両方から参照する。2026-08-23 のユーザー判断で 30 秒に統一
// （経緯: 旧バグで 180、その後 60、検証の結果 30 が採用）
export const DEFAULT_CAPTURE_INTERVAL_SECONDS = 30

// 判定ルール（誤判定フィードバック）の上限。
// UI・APIサーバーの両方から参照して検証を揃える
export const MAX_ANALYSIS_RULES = 20
export const MAX_ANALYSIS_RULE_LENGTH = 200

// 休憩・無操作リマインドの既定値。
// user_settings.nudge_preferences（JSONB）が未設定・列欠落でもこの値で動作する
export interface NudgePreferences {
  breakEnabled: boolean
  breakMinutes: number
  idleEnabled: boolean
  idleMinutes: number
}

export const DEFAULT_NUDGE_PREFERENCES: NudgePreferences = {
  breakEnabled: true,
  breakMinutes: 90,
  idleEnabled: true,
  idleMinutes: 10,
}

// DBから来た値を安全に正規化する（部分的な保存・不正値でも既定値で埋める）
export function normalizeNudgePreferences(raw: unknown): NudgePreferences {
  const r = (raw ?? {}) as Partial<NudgePreferences>
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 480 ? Math.round(v) : fallback
  return {
    breakEnabled: typeof r.breakEnabled === "boolean" ? r.breakEnabled : DEFAULT_NUDGE_PREFERENCES.breakEnabled,
    breakMinutes: num(r.breakMinutes, DEFAULT_NUDGE_PREFERENCES.breakMinutes),
    idleEnabled: typeof r.idleEnabled === "boolean" ? r.idleEnabled : DEFAULT_NUDGE_PREFERENCES.idleEnabled,
    idleMinutes: num(r.idleMinutes, DEFAULT_NUDGE_PREFERENCES.idleMinutes),
  }
}

// 注意: このファイルはクライアントへバンドルされる。
// 以前ここにあった config オブジェクトは SUPABASE_SERVICE_ROLE_KEY 等の
// サーバー専用環境変数を参照しており（値は含まれないが変数名が
// クライアントチャンクに残る）、どこからも使われていなかったため削除した。
// サーバー専用の設定は各APIルート/lib/supabase-admin.ts 側で直接参照する。


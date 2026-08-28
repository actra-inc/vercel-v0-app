"use client"

// Toggl資格情報のローカル退避。
// 正はDB(user_settings)で、ここに置くのは
//  (a) DBが受け付けない環境（列欠落等）での一時退避
//  (b) 旧仕様（localStorageに平文保存）からの移行元
// の2つだけ。
//
// 退避先はユーザーIDで名前空間を分ける。旧仕様のキーは共有端末で
// 別アカウントにログインすると他人のトークンをそのまま拾ってしまうため、
// 一度だけ読み出して本人のキーへ移し、旧キーは消す。

const LEGACY_TOKEN_KEY = "toggl_api_token"
const LEGACY_WORKSPACE_KEY = "toggl_workspace_id"
const scopedKey = (userId: string) => `flownudge_toggl_creds_${userId}`

export interface LocalTogglCredentials {
  token: string
  workspaceId: string
}

const safeGet = (key: string): string | null => {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeRemove = (key: string) => {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(key)
  } catch {
    /* プライベートモード等では無視 */
  }
}

/** 本人のキーに退避された資格情報 */
export const readScopedTogglCredentials = (userId: string): LocalTogglCredentials | null => {
  if (!userId) return null
  const raw = safeGet(scopedKey(userId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const token = typeof parsed?.token === "string" ? parsed.token : ""
    const workspaceId = typeof parsed?.workspaceId === "string" ? parsed.workspaceId : ""
    return token && workspaceId ? { token, workspaceId } : null
  } catch {
    return null
  }
}

/** 旧仕様のキー（ユーザー非依存）。移行のときだけ読む */
export const readLegacyTogglCredentials = (): LocalTogglCredentials | null => {
  const token = safeGet(LEGACY_TOKEN_KEY) || ""
  const workspaceId = safeGet(LEGACY_WORKSPACE_KEY) || ""
  return token && workspaceId ? { token, workspaceId } : null
}

export const writeScopedTogglCredentials = (userId: string, creds: LocalTogglCredentials) => {
  if (!userId || typeof window === "undefined") return
  try {
    localStorage.setItem(scopedKey(userId), JSON.stringify(creds))
  } catch {
    /* 保存できない環境では何もしない（呼び出し側がDB保存失敗として扱う） */
  }
}

export const clearLegacyTogglCredentials = () => {
  safeRemove(LEGACY_TOKEN_KEY)
  safeRemove(LEGACY_WORKSPACE_KEY)
}

/** 端末上の退避コピーを消す（DBに保存できた・利用者がクリアしたとき） */
export const clearTogglCredentials = (userId: string) => {
  if (userId) safeRemove(scopedKey(userId))
  clearLegacyTogglCredentials()
}

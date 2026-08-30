"use client"

// 脱線検知のブラウザ通知（Notification API）ユーティリティ。
// new Notification() はChromeがバックグラウンド（他アプリ使用中）のとき
// macOSで画面ポップアップが出ずNotification Centerのみに入る制限がある。
// Service Worker の showNotification() を優先使用することで解消する。

const ENABLED_STORAGE_KEY = "distraction_notification_enabled"

// 通知の連発を防ぐクールダウン（キャプチャ間隔30秒でも鳴りすぎないように）
const COOLDOWN_MS = 60 * 1000
let lastNotifiedAt = 0

// 登録済みSWを保持。navigator.serviceWorker.ready は未登録時に永久待機するため
// 登録時に直接取得して保持する方式を採る
let swRegistration: ServiceWorkerRegistration | null = null

export const isNotificationSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window

export type NotificationPermissionState = NotificationPermission | "unsupported"

export const getNotificationPermission = (): NotificationPermissionState => {
  if (!isNotificationSupported()) return "unsupported"
  return Notification.permission
}

// 必ずユーザー操作（クリック）から呼び出すこと
export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  if (!isNotificationSupported()) return "unsupported"
  try {
    // Safariの旧仕様はコールバック形式のみのため両対応
    const result = Notification.requestPermission((p) => p)
    if (result && typeof (result as Promise<NotificationPermission>).then === "function") {
      return await result
    }
    return Notification.permission
  } catch {
    return Notification.permission
  }
}

// アプリ内設定（デフォルトON。ブラウザ許可とは別のスイッチ）
export const isDistractionNotificationEnabled = (): boolean => {
  if (typeof window === "undefined") return true
  return localStorage.getItem(ENABLED_STORAGE_KEY) !== "off"
}

export const setDistractionNotificationEnabled = (enabled: boolean) => {
  localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? "on" : "off")
}

// Service Workerを登録する。通知コンポーネントのmount時に呼び出す。
// 登録済みSWをモジュール変数に保持し、navigator.serviceWorker.ready の
// 永久待機問題を回避する。
export const registerServiceWorker = async (): Promise<void> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js")
    console.log("[notification] SW registered:", swRegistration.scope)
  } catch (e) {
    console.warn("[notification] SW registration failed:", e)
    swRegistration = null
  }
}

export interface DistractionNotificationOptions {
  title: string
  body: string
}

// 通知が出せなかった理由。通知が届かないときの切り分けに使う
export type NotificationSkipReason =
  | "unsupported"
  | "not-granted"
  | "disabled-in-app"
  | "cooldown"
  | "error"

export interface ShowNotificationResult {
  shown: boolean
  reason?: NotificationSkipReason
}

// 実際に通知を出す共通処理。
// 登録済みSWがあれば showNotification()、なければ new Notification() にフォールバック。
const createNotification = async (
  title: string,
  body: string,
  tag = "flownudge-distraction",
): Promise<ShowNotificationResult> => {
  const options: NotificationOptions = {
    body,
    icon: "/flownudge-logo.png",
    tag,
    requireInteraction: true,
    renotify: true,
  } as NotificationOptions

  // Service Worker 経由（バックグラウンドでも確実にポップアップ）
  // swRegistration が null の場合は未登録 or 登録失敗 → フォールバックへ
  if (swRegistration) {
    try {
      await swRegistration.showNotification(title, options)
      console.log("[notification] Shown via SW:", title)
      return { shown: true }
    } catch (swError) {
      console.warn("[notification] SW showNotification failed, falling back:", swError)
    }
  }

  // フォールバック: new Notification()（フォアグラウンド時・SW未使用環境で動く）
  try {
    const notification = new Notification(title, options)
    notification.onclick = () => {
      try { window.focus() } catch { /* no-op */ }
      notification.close()
    }
    notification.onerror = (event) => {
      console.warn("[notification] Notification error event:", event)
    }
    console.log("[notification] Shown via new Notification():", title)
    return { shown: true }
  } catch (error) {
    console.warn("[notification] Failed to show notification:", error)
    return { shown: false, reason: "error" }
  }
}

// 脱線通知を表示する。出せなかった場合は理由を返す
export const showDistractionNotification = async ({
  title,
  body,
}: DistractionNotificationOptions): Promise<ShowNotificationResult> => {
  if (!isNotificationSupported()) {
    console.warn("[notification] Skipped: このブラウザは通知に未対応です")
    return { shown: false, reason: "unsupported" }
  }
  if (Notification.permission !== "granted") {
    console.warn(`[notification] Skipped: ブラウザの通知許可が ${Notification.permission} です`)
    return { shown: false, reason: "not-granted" }
  }
  if (!isDistractionNotificationEnabled()) {
    console.warn("[notification] Skipped: アプリ設定で脱線通知がオフです")
    return { shown: false, reason: "disabled-in-app" }
  }

  const now = Date.now()
  if (now - lastNotifiedAt < COOLDOWN_MS) {
    console.log("[notification] Skipped (cooldown)")
    return { shown: false, reason: "cooldown" }
  }
  lastNotifiedAt = now

  return createNotification(title, body)
}

// 休憩・無操作リマインドの通知。
// 脱線通知とは別タグ・別クールダウン（同じ種類の連投だけを5分抑制する安全弁。
// 発火頻度の制御は呼び出し側のロジックが担う）
const reminderLastShownAt: Record<string, number> = {}
const REMINDER_MIN_GAP_MS = 5 * 60 * 1000

export const showReminderNotification = async (
  kind: "break" | "idle",
  title: string,
  body: string,
): Promise<ShowNotificationResult> => {
  if (!isNotificationSupported()) return { shown: false, reason: "unsupported" }
  if (Notification.permission !== "granted") return { shown: false, reason: "not-granted" }
  const now = Date.now()
  if (now - (reminderLastShownAt[kind] ?? 0) < REMINDER_MIN_GAP_MS) {
    return { shown: false, reason: "cooldown" }
  }
  reminderLastShownAt[kind] = now
  return createNotification(title, body, `flownudge-reminder-${kind}`)
}

// 画面共有が意図せず切れたときの通知。
// 脱線通知のクールダウンやアプリ内オン/オフとは独立させている
// （気付かないと解析が止まったままになるうえ、頻発する種類の通知ではないため）
export const showCaptureInterruptedNotification = async (
  title: string,
  body: string,
): Promise<ShowNotificationResult> => {
  if (!isNotificationSupported()) return { shown: false, reason: "unsupported" }
  if (Notification.permission !== "granted") return { shown: false, reason: "not-granted" }
  return createNotification(title, body, "flownudge-capture-interrupted")
}

// 設定画面から「通知が届くか」を確かめるためのテスト通知。
// クールダウンとアプリ内オン/オフの影響を受けない（許可状態だけを検証する）
export const sendTestNotification = async (title: string, body: string): Promise<ShowNotificationResult> => {
  if (!isNotificationSupported()) return { shown: false, reason: "unsupported" }
  if (Notification.permission !== "granted") return { shown: false, reason: "not-granted" }
  // 実際の脱線通知を上書きしないよう別タグにする
  return createNotification(title, body, "flownudge-test")
}

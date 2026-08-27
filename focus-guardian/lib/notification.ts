"use client"

// 脱線検知のブラウザ通知（Notification API）ユーティリティ。
// new Notification() はChromeがバックグラウンドのときmacOSで画面ポップアップが
// 出ずNotification Centerにのみ入る。Service Worker の showNotification() を
// 優先使用することでバックグラウンド時も確実にポップアップを表示する。

const ENABLED_STORAGE_KEY = "distraction_notification_enabled"

// 通知の連発を防ぐクールダウン（キャプチャ間隔30秒でも鳴りすぎないように）
const COOLDOWN_MS = 60 * 1000
let lastNotifiedAt = 0

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
export const registerServiceWorker = async (): Promise<void> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  try {
    await navigator.serviceWorker.register("/sw.js")
  } catch (e) {
    console.warn("[notification] SW registration failed:", e)
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
// Service Worker が使えるときは showNotification()、使えない場合は new Notification() にフォールバック。
// Chrome on macOS では new Notification() はバックグラウンド時に画面に出ないため SW を優先する。
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
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(title, options)
      console.log("[notification] Shown via SW:", title)
      return { shown: true }
    } catch (swError) {
      console.warn("[notification] SW showNotification failed, falling back to new Notification():", swError)
    }
  }

  // フォールバック: new Notification()（フォアグラウンド時は動く）
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

// 設定画面から「通知が届くか」を確かめるためのテスト通知。
// クールダウンとアプリ内オン/オフの影響を受けない（許可状態だけを検証する）
export const sendTestNotification = async (title: string, body: string): Promise<ShowNotificationResult> => {
  if (!isNotificationSupported()) return { shown: false, reason: "unsupported" }
  if (Notification.permission !== "granted") return { shown: false, reason: "not-granted" }
  // 実際の脱線通知を上書きしないよう別タグにする
  return createNotification(title, body, "flownudge-test")
}

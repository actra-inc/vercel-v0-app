"use client"

// 脱線検知のブラウザ通知（Notification API）ユーティリティ。
// 脱線している時こそ FlowNudge のタブは見られていないため、
// 音のアラートに加えて OS レベルの通知で気づけるようにする。

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

export interface DistractionNotificationOptions {
  title: string
  body: string
}

// 脱線通知を表示する。表示できた場合 true を返す
export const showDistractionNotification = ({ title, body }: DistractionNotificationOptions): boolean => {
  if (!isNotificationSupported()) return false
  if (Notification.permission !== "granted") return false
  if (!isDistractionNotificationEnabled()) return false

  const now = Date.now()
  if (now - lastNotifiedAt < COOLDOWN_MS) {
    console.log("[notification] Skipped (cooldown)")
    return false
  }
  lastNotifiedAt = now

  try {
    const notification = new Notification(title, {
      body,
      icon: "/flownudge-logo.png",
      tag: "flownudge-distraction", // 同種の通知は積み上げず置き換える
    })

    // 通知クリックでアプリのタブへ戻す
    notification.onclick = () => {
      try {
        window.focus()
      } catch {
        // no-op
      }
      notification.close()
    }

    // 10秒で自動クローズ（残り続けないように）
    setTimeout(() => notification.close(), 10 * 1000)
    return true
  } catch (error) {
    console.warn("[notification] Failed to show notification:", error)
    return false
  }
}

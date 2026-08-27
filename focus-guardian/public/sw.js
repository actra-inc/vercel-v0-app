// Service Worker for FlowNudge notifications
// new Notification() はChromeがバックグラウンドのときmacOSで画面ポップアップが
// 出ずNotification Centerのみに入る。SW の showNotification() で解消する。

// 既存ページを待たず即座に有効化する（新規登録時は常にアクティブになる）
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow('/')
    })
  )
})

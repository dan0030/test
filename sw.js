// O-note 서비스 워커: 알림 표시와 알림을 눌렀을 때 O-note 열기만 담당 (페이지 캐시는 하지 않음)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => c.url.startsWith(self.registration.scope));
    if (win) return win.focus();
    return self.clients.openWindow(url);
  }));
});

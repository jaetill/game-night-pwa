// Service worker — Web Push + notification click handling.
//
// Served from /sw.js (public/ → site root) so its scope covers the whole
// app. Registered by src/js/utils/push.js on app init. No fetch/caching
// logic here — this SW exists purely for push notifications; offline
// caching is a separate feature if we ever want it.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON payload */ }

  const title = data.title || 'Game Night';
  const options = {
    body:  data.body || '',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   data.tag || undefined,        // same-tag notifications collapse
    data:  { url: data.url || '/' },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Home-screen badge count (iOS 16.4+, Android/Chrome). We don't track
    // unread state server-side, so a plain "flag" badge (no count) it is —
    // cleared by the app on next open.
    if ('setAppBadge' in self.navigator) {
      try { await self.navigator.setAppBadge(); } catch { /* unsupported */ }
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    if ('clearAppBadge' in self.navigator) {
      try { await self.navigator.clearAppBadge(); } catch { /* unsupported */ }
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});

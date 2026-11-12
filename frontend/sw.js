/* Service worker Aqua: только показ уведомлений и переход в чат по тапу (кэша нет). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const chatId = e.notification.data?.chatId;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all[0];
    if (c) { await c.focus(); c.postMessage({ type: 'open-chat', chatId }); }
    else await self.clients.openWindow('./');
  })());
});

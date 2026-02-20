self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      body: event.data ? event.data.text() : '',
    };
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'Уведомление';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: typeof payload.icon === 'string' && payload.icon.trim() ? payload.icon : '/favicon.ico',
    badge: typeof payload.badge === 'string' && payload.badge.trim() ? payload.badge : '/favicon.ico',
    tag: typeof payload.tag === 'string' && payload.tag.trim() ? payload.tag : 'ege-homework',
    renotify: Boolean(payload.renotify),
    data: payload.data && typeof payload.data === 'object' ? payload.data : {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification && event.notification.data && typeof event.notification.data === 'object'
    ? event.notification.data
    : {};
  const targetUrl = typeof payload.url === 'string' && payload.url.trim() ? payload.url : '/';

  event.waitUntil((async () => {
    const target = new URL(targetUrl, self.location.origin);
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (!client?.url) continue;
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== target.origin) continue;
      await client.focus();
      if (clientUrl.href !== target.href) {
        try {
          await client.navigate(target.href);
        } catch {
          // Ignore navigation failures and keep focused window.
        }
      }
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});


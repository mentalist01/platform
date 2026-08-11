self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shellCache = await caches.open('ivan-ege-shell-v2');
    const staticCache = await caches.open('ivan-ege-static-v2');
    const shellUrl = new URL('/', self.location.origin).toString();
    const shellResponse = await fetch(new Request(shellUrl, { cache: 'reload' }));
    if (shellResponse.ok) {
      await shellCache.put('/', shellResponse.clone());
      const shellHtml = await shellResponse.text();
      const buildAssetUrls = Array.from(shellHtml.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g))
        .map((match) => match[1]);
      await Promise.all(buildAssetUrls.map(async (assetUrl) => {
        const absoluteAssetUrl = new URL(assetUrl, self.location.origin).toString();
        const response = await fetch(new Request(absoluteAssetUrl, { cache: 'reload' }));
        if (!response.ok) throw new Error(`Failed to cache ${assetUrl}: ${response.status}`);
        await staticCache.put(absoluteAssetUrl, response);
      }));
    }
    await Promise.allSettled([
      shellCache.add(new Request(new URL('/logo1.png', self.location.origin).toString(), { cache: 'reload' })),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keepPrefixes = [
      'ivan-ege-shell-v2',
      'ivan-ege-static-v2',
      'ivan-ege-homework-assets-v1-',
    ];
    const names = await caches.keys();
    await Promise.all(names.map((name) => (
      name.startsWith('ivan-ege-') && !keepPrefixes.some((prefix) => name.startsWith(prefix))
        ? caches.delete(name)
        : Promise.resolve(false)
    )));
    await self.clients.claim();
  })());
});

const findPrivateHomeworkAsset = async (request) => {
  const names = await caches.keys();
  const homeworkCacheNames = names.filter((name) => name.startsWith('ivan-ege-homework-assets-v1-'));
  for (const cacheName of homeworkCacheNames) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
  }
  return null;
};

const handleNavigationRequest = async (request) => {
  const shellCache = await caches.open('ivan-ege-shell-v2');
  try {
    const response = await fetch(request);
    if (response?.ok) {
      await shellCache.put('/', response.clone());
    }
    return response;
  } catch {
    return (await shellCache.match(request)) || (await shellCache.match('/')) || Response.error();
  }
};

const handleStaticRequest = async (request) => {
  const staticCache = await caches.open('ivan-ege-static-v2');
  const cached = await staticCache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response?.ok) {
    await staticCache.put(request, response.clone());
  }
  return response;
};

const handleHomeworkAssetRequest = async (request) => {
  try {
    return await fetch(request);
  } catch {
    return (await findPrivateHomeworkAsset(request)) || Response.error();
  }
};

const isDevelopmentModulePath = (pathname) => (
  pathname.startsWith('/src/')
  || pathname.startsWith('/@vite/')
  || pathname.startsWith('/@react-refresh')
  || pathname.startsWith('/@id/')
  || pathname.startsWith('/@fs/')
  || pathname.startsWith('/node_modules/.vite/')
);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  // A production service worker can remain registered when the same origin is
  // later opened through Vite. Never let its cache serve stale ESM source files.
  if (isDevelopmentModulePath(url.pathname)) return;
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(handleHomeworkAssetRequest(request));
    return;
  }
  if (
    url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/sounds/')
    || /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|mp3|webm)$/i.test(url.pathname)
  ) {
    event.respondWith(handleStaticRequest(request));
  }
});

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
  let targetUrl = typeof payload.url === 'string' && payload.url.trim() ? payload.url : '/';
  const requestedView = typeof payload.view === 'string' ? payload.view.trim() : '';
  const requestedChatId = typeof payload.chatId === 'string' ? payload.chatId.trim() : '';

  try {
    const next = new URL(targetUrl, self.location.origin);
    if (requestedView && !next.searchParams.get('view')) {
      next.searchParams.set('view', requestedView);
    }
    if (requestedChatId && !next.searchParams.get('chatId')) {
      next.searchParams.set('chatId', requestedChatId);
    }
    targetUrl = next.toString();
  } catch {
    // Ignore malformed URLs and use the raw target.
  }

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


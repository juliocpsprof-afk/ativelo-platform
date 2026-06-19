const CACHE_NAME = "ativelo-static-20260614-125715";
const CACHE_PREFIX = "ativelo-static-";

const CORE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/ativelo-32.png",
  "/icons/ativelo-192.png",
  "/icons/ativelo-512.png",
  "/icons/ativelo-maskable-512.png",
];

function isCacheableStaticRequest(request, url) {
  if (request.method !== "GET") {
    return false;
  }

  if (request.headers.has("Authorization")) {
    return false;
  }

  if (url.origin !== self.location.origin) {
    return false;
  }

  const blockedPrefixes = [
    "/api/",
    "/auth/",
    "/rest/",
    "/storage/",
    "/functions/",
    "/realtime/",
  ];

  if (
    blockedPrefixes.some((prefix) =>
      url.pathname.startsWith(prefix),
    )
  ) {
    return false;
  }

  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/offline.html" ||
    /\.(?:css|js|mjs|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(
      url.pathname,
    )
  );
}

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);

  await cache.addAll(CORE_ASSETS);

  try {
    const response = await fetch("/", {
      cache: "reload",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return;
    }

    const html = await response.clone().text();
    const assetUrls = new Set();

    const expression =
      /(?:src|href)=["'](\/assets\/[^"'?#]+(?:\?[^"']*)?)["']/g;

    let match;

    while ((match = expression.exec(html)) !== null) {
      assetUrls.add(match[1]);
    }

    if (assetUrls.size > 0) {
      await cache.addAll([...assetUrls]);
    }

    await cache.put("/", response);
  } catch {
    // A instalacao continua com os arquivos essenciais.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith(CACHE_PREFIX) &&
                cacheName !== CACHE_NAME,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put("/", response.clone());
    }

    return response;
  } catch {
    return (
      (await caches.match("/")) ||
      (await caches.match("/offline.html")) ||
      Response.error()
    );
  }
}

async function cacheFirstStatic(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);

  if (
    response.ok &&
    response.type === "basic" &&
    !request.headers.has("Authorization")
  ) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (!isCacheableStaticRequest(request, url)) {
    return;
  }

  event.respondWith(cacheFirstStatic(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === "CLEAR_STATIC_CACHES") {
    event.waitUntil(
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) =>
              cacheName.startsWith(CACHE_PREFIX),
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
    );
  }
});
/* ATIVELO_WEB_PUSH_V1 */
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Ativelo",
      body: event.data.text(),
    };
  }

  const title =
    payload.title || "Ativelo";

  const options = {
    body: payload.body || "",
    icon:
      payload.icon ||
      "/icons/ativelo-192.png",
    badge:
      payload.badge ||
      "/icons/ativelo-32.png",
    tag:
      payload.tag ||
      "ativelo-notification",
    renotify: false,
    requireInteraction:
      Boolean(
        payload.requireInteraction,
      ),
    data: {
      url:
        payload.url || "/",
      notificationId:
        payload.data
          ?.notificationId ||
        null,
      category:
        payload.data?.category ||
        null,
      entityType:
        payload.data
          ?.entityType ||
        null,
      entityId:
        payload.data?.entityId ||
        null,
    },
  };

  event.waitUntil(
    self.registration
      .showNotification(
        title,
        options,
      ),
  );
});

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const destination =
      event.notification.data?.url ||
      "/";

    event.waitUntil(
      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((clients) => {
          for (const client of clients) {
            if (
              "focus" in client
            ) {
              client.postMessage({
                type:
                  "ATIVELO_PUSH_OPENED",
                notificationId:
                  event.notification.data
                    ?.notificationId ||
                  null,
                category:
                  event.notification.data
                    ?.category ||
                  null,
              });

              client.navigate(
                destination,
              );

              return client.focus();
            }
          }

          return self.clients
            .openWindow(
              destination,
            );
        }),
    );
  },
);

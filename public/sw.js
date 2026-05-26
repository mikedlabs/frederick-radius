/**
 * Frederick Radius service worker. Hand-rolled, no build plugin, so it
 * is safe on Next 16 + Turbopack and trivial to reason about.
 *
 * Safety-first by design: navigations are NETWORK-FIRST. The cache and
 * the offline page are only ever a fallback when the network actually
 * fails. A bad deploy or a stale cache can therefore never trap a user
 * on a broken page -- the worst case offline is the explicit /offline
 * screen, and online always shows live content. Bump CACHE_VERSION to
 * invalidate everything; post {type:'CLEAR_CACHES'} to nuke at runtime.
 */
const CACHE_VERSION = "fr-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-img`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  // A5: do NOT call skipWaiting() here. We want a freshly deployed SW
  // to enter the "waiting" state so ServiceWorkerRegister can prompt
  // the user with an update toast. The user (or closing all tabs)
  // triggers activation via the SKIP_WAITING message below. This
  // avoids surprise mid-session worker swaps that can interleave
  // with in-flight requests.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.add(OFFLINE_URL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "CLEAR_CACHES") {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

function isImage(req, url) {
  return (
    req.destination === "image" ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:png|jpg|jpeg|webp|avif|gif|svg)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  // 1. Navigations: NETWORK-FIRST. Live content always wins; cache then
  //    the offline page are only used when the network truly fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL))),
    );
    return;
  }

  // 2. Build assets (content-hashed, immutable): cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  // 3. Images (photos, proxied media): stale-while-revalidate.
  if (isImage(request, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const net = fetch(request)
          .then((res) => {
            if (res && res.status === 200) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  // Everything else: pass through (network), no caching.
});

/* ─────────────────────────────────────────────────────
 * Web Push — opt-in notifications.
 *
 *   `push`              fires when the push service delivers a payload.
 *                       We expect the server to send valid JSON; if it
 *                       doesn't (an unauth ping, an empty test), we
 *                       fall back to a generic title so the user still
 *                       sees something rather than nothing.
 *   `notificationclick` focuses an existing tab at the payload's url
 *                       when possible (no extra tab spam); otherwise
 *                       opens a new one.
 * ───────────────────────────────────────────────────── */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Frederick Radius", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Frederick Radius";
  const body = payload.body || "";
  const url = payload.url || "/today";
  const options = {
    body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/badge-72.png",
    tag: payload.tag,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const target = new URL(url, self.location.origin).href;
        // Reuse an existing tab when one is already on the right URL.
        for (const c of clients) {
          if (c.url === target) return c.focus();
        }
        // Or any open tab — push it to the URL.
        const first = clients[0];
        if (first && "navigate" in first) return first.navigate(url).then(() => first.focus());
        return self.clients.openWindow(url);
      }),
  );
});

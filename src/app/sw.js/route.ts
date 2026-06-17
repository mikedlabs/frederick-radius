
/**
 * /sw.js — the service worker, served dynamically so the CACHE_VERSION
 * embedded inside it bumps on every deploy.
 *
 * Why dynamic instead of public/sw.js?
 *   Previously public/sw.js had `CACHE_VERSION = "fr-v1"` hardcoded.
 *   The browser would re-fetch /sw.js, byte-compare against the
 *   registered worker, and — finding identical bytes — keep the old
 *   one active forever. Result: a user on iOS would see the OLD build
 *   even after a deploy, because the SW had cached the old HTML/chunks
 *   and the activate handler only nukes caches whose key DOESN'T start
 *   with the current CACHE_VERSION (which was always "fr-v1").
 *
 *   Serving the SW from a route handler lets us substitute the
 *   deployment id into CACHE_VERSION at response time. Each deploy =
 *   different bytes in /sw.js = browser detects an update = the new
 *   SW's activate handler nukes old caches because their key starts
 *   with the OLD version. The "A new version is ready" toast fires.
 *
 * Cache-Control: must-revalidate so the browser actually re-checks
 * this file on each page load. Without that, Safari can sit on a
 * cached /sw.js for hours.
 *
 * Body stays inline so the build pipeline doesn't need a custom
 * loader. Edit the SW source here, NOT in public/.
 */

// Deployment identifier embedded into CACHE_VERSION. Vercel exposes
// the commit SHA as VERCEL_GIT_COMMIT_SHA at runtime; locally + on
// preview builds we fall back to a timestamped dev version so the
// behaviour is still correct, just less stable.
function buildVersion(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.NEXT_PUBLIC_BUILD_VERSION ??
    `dev-${Date.now()}`
  );
}

const SW_SOURCE = (version: string) => `/**
 * Frederick Radius service worker. Hand-rolled, no build plugin.
 * Served dynamically by app/sw.js/route.ts so CACHE_VERSION bumps
 * on every deploy.
 *
 * Safety-first by design: navigations are NETWORK-FIRST. The cache
 * and the offline page are only ever a fallback when the network
 * actually fails. A bad deploy or a stale cache can therefore never
 * trap a user on a broken page: the worst case offline is the
 * explicit /offline screen, and online always shows live content.
 *
 * CACHE_VERSION is the build's deployment id, embedded at response
 * time. When a new deploy lands, this string changes → the SW file's
 * bytes change → the browser registers the new worker → the activate
 * handler nukes any cache key that doesn't start with the new
 * version. Post {type:'CLEAR_CACHES'} to nuke at runtime.
 */
const CACHE_VERSION = "fr-${version}";
const STATIC_CACHE = CACHE_VERSION + "-static";
const IMAGE_CACHE = CACHE_VERSION + "-img";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  // Do NOT call skipWaiting() here. We want a freshly deployed SW
  // to enter the "waiting" state so ServiceWorkerRegister can prompt
  // the user with an update toast. The user (or closing all tabs)
  // triggers activation via the SKIP_WAITING message below.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.add(OFFLINE_URL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
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
    /\\.(?:png|jpg|jpeg|webp|avif|gif|svg)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  // 1. Navigations: NETWORK-FIRST. Live content always wins.
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
 * Web Push: opt-in notifications.
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
  const url = payload.url || "/guide";
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
  const url = (event.notification.data && event.notification.data.url) || "/guide";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const target = new URL(url, self.location.origin).href;
        for (const c of clients) {
          if (c.url === target) return c.focus();
        }
        const first = clients[0];
        if (first && "navigate" in first) return first.navigate(url).then(() => first.focus());
        return self.clients.openWindow(url);
      }),
  );
});
`;

export function GET() {
  const body = SW_SOURCE(buildVersion());
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // must-revalidate so the browser actually re-checks /sw.js on
      // each page load. Without this Safari can sit on a cached copy
      // for hours and never realize a new version landed.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}

// Force runtime so the env var read happens per-request, not at
// build time. (We want the value Vercel actually injected at deploy.)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

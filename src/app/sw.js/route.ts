
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

function cacheControlForbidsStorage(response) {
  const value = (response.headers.get("cache-control") || "").toLowerCase();
  return value.includes("private") || value.includes("no-store");
}

function isCacheableResponse(response) {
  return Boolean(
    response &&
      response.ok &&
      response.type === "basic" &&
      !response.redirected &&
      !cacheControlForbidsStorage(response),
  );
}

async function cacheOfflineFallback() {
  const response = await fetch(OFFLINE_URL, {
    cache: "reload",
    credentials: "same-origin",
  });
  if (!isCacheableResponse(response)) return;

  // A beta/auth redirect must never be stored under the /offline key.
  const finalUrl = new URL(response.url);
  if (finalUrl.origin !== self.location.origin || finalUrl.pathname !== OFFLINE_URL) return;

  const cache = await caches.open(STATIC_CACHE);
  await cache.put(OFFLINE_URL, response);
}

self.addEventListener("install", (event) => {
  // Do NOT call skipWaiting() here. We want a freshly deployed SW
  // to enter the "waiting" state so ServiceWorkerRegister can prompt
  // the user with an update toast. The user (or closing all tabs)
  // triggers activation via the SKIP_WAITING message below.
  event.waitUntil(
    // Non-fatal: a transient non-200 on /offline during install must not
    // abort the SW install (which would disable offline support). The runtime
    // navigate handler re-fetches /offline on demand.
    cacheOfflineFallback().catch(() => {}),
  );
});

async function purgeLegacyRuntimeEntries() {
  // A same-version worker may inherit HTML cached by an older version of this
  // file. Keep only the explicit offline fallback and immutable build assets.
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  await Promise.all([
    ...keys.map((request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === OFFLINE_URL || pathname.startsWith("/_next/static/")) return undefined;
      return cache.delete(request);
    }),
    // Clear any same-version image cache created by the older worker. Public
    // images will refill; a formerly cacheable personalized image must not.
    caches.delete(IMAGE_CACHE),
  ]);
}

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
      .then(() => purgeLegacyRuntimeEntries())
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

const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/auth",
  "/beta",
  "/settings",
  "/my-radius",
  "/collect",
  "/business/manage",
];
const PUBLIC_IMAGE_API_PREFIXES = ["/api/place-photo", "/api/static-map", "/api/og"];
const CAPABILITY_QUERY_KEYS = new Set([
  "code",
  "token",
  "key",
  "secret",
  "signature",
  "sig",
  "endpoint",
  "passcode",
  "manage_token",
]);

function matchesPathPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function isSensitiveRequest(request, url) {
  if (request.headers.has("authorization") || request.cache === "no-store") return true;
  if (PRIVATE_PATH_PREFIXES.some((prefix) => matchesPathPrefix(url.pathname, prefix))) return true;
  for (const key of url.searchParams.keys()) {
    if (CAPABILITY_QUERY_KEYS.has(key.toLowerCase())) return true;
  }

  // API responses are private by default. Only the three image-proxy routes
  // are intentionally public and eligible for the image cache.
  if (
    url.pathname.startsWith("/api/") &&
    !PUBLIC_IMAGE_API_PREFIXES.some((prefix) => matchesPathPrefix(url.pathname, prefix))
  ) {
    return true;
  }
  return false;
}

/**
 * Bound the public image cache to its newest MAX entries (FIFO by insertion
 * order; Cache keys() returns insertion order). Fire-and-forget after each
 * put; never blocks a response.
 */
function trimCache(name, max) {
  caches.open(name).then(async (cache) => {
    const keys = await cache.keys();
    let excess = keys.length - max;
    for (let i = 0; i < keys.length && excess > 0; i++) {
      cache.delete(keys[i]);
      excess--;
    }
  }).catch(() => {});
}
const MAX_IMAGE_ENTRIES = 150;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  // /admin is Basic-Auth gated in middleware. When a SW mediates the fetch,
  // several engines (Safari, installed PWAs, some Chromium contexts) suppress
  // the browser's credential prompt: the user gets the bare 401 body instead
  // of a login dialog and the page "never loads". Let the browser own every
  // /admin request natively; the admin surface needs no offline support.
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return;

  // 1. Navigations: network-only with one generic offline fallback. Never
  // persist HTML: a page can vary by login, beta access, cookies, location,
  // or a capability URL even when its pathname looks public.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // Authenticated, personalized, API, and capability-bearing requests never
  // enter any runtime cache. Let the browser perform its normal network fetch.
  if (isSensitiveRequest(request, url)) return;

  // 2. Build assets (content-hashed, immutable): cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (isCacheableResponse(res)) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
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
            if (isCacheableResponse(res)) {
              cache.put(request, res.clone()).then(() => trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES)).catch(() => {});
            }
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
function hasUnsafeRedirectCharacters(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (value[i] === "\\\\" || code <= 31 || code === 127) return true;
  }
  return false;
}

function safeNavigationTarget(raw) {
  if (typeof raw !== "string") return "/today";
  if (hasUnsafeRedirectCharacters(raw)) return "/today";
  const candidate = raw.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/today";

  let inspected = candidate;
  for (let i = 0; i < 4; i++) {
    try {
      const decoded = decodeURIComponent(inspected);
      if (decoded === inspected) break;
      inspected = decoded;
    } catch {
      return "/today";
    }
  }
  if (inspected.startsWith("//") || hasUnsafeRedirectCharacters(inspected)) return "/today";

  try {
    const parsed = new URL(candidate, self.location.origin);
    if (parsed.origin !== self.location.origin || parsed.pathname.startsWith("//")) return "/today";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/today";
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Frederick Radius", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Frederick Radius";
  const body = payload.body || "";
  const url = safeNavigationTarget(payload.url);
  const options = {
    body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/badge-72.png",
    tag: payload.tag,
    data: { url, n: payload.n },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNavigationTarget(event.notification.data && event.notification.data.url);
  // Fire-and-forget open ping so the composer can count opens per send.
  const n = event.notification.data && event.notification.data.n;
  if (n) fetch("/api/push/opened?n=" + encodeURIComponent(n), { keepalive: true }).catch(() => {});
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

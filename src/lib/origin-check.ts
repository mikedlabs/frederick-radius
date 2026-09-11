/**
 * Cheap abuse protection for paid-upstream API routes.
 *
 * The `/api/place-photo`, `/api/discover/*`, and `/api/travel-time`
 * routes proxy paid Google APIs. Anyone could hammer them from
 * outside our own app and rack up bills. This guard blocks the
 * easiest attack vector — hot-linking from another origin — by
 * checking the `Referer` / `Origin` headers.
 *
 * It's NOT a security boundary (a determined attacker can forge
 * headers). It's a cheap rate-shaper that filters the casual
 * scraper / accidental loop. The real defense is the Vercel
 * Firewall rule set in the dashboard, which adds per-IP rate
 * limiting on top of this.
 */

const ALLOWED_HOSTS = new Set<string>([
  // Production
  "frederickradius.app",
  "www.frederickradius.app",
  // Vercel preview URLs follow this pattern
  // (we accept *.vercel.app subdomains for our project only)
  // Localhost for dev. Ports vary — the host comparison strips the port.
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

// Matches our own preview deploys: frederick-radius-<hash>-mikedlab.vercel.app
const PROJECT_PREVIEW_HOST = /^frederick-radius-[a-z0-9]+(?:-mikedlab)?\.vercel\.app$/;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function parsedUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedAppUrl(url: URL): boolean {
  if (LOCAL_HOSTS.has(url.hostname)) {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  return (
    url.protocol === "https:" &&
    (ALLOWED_HOSTS.has(url.hostname) || PROJECT_PREVIEW_HOST.test(url.hostname))
  );
}

function isSameAppOrigin(source: URL, target: URL): boolean {
  // Next's development server can canonicalize the request URL to localhost
  // even when the browser opened 127.0.0.1. They are the same loopback app;
  // keep the port/protocol exact so this exception cannot bridge dev servers.
  if (LOCAL_HOSTS.has(source.hostname) && LOCAL_HOSTS.has(target.hostname)) {
    return source.protocol === target.protocol && source.port === target.port;
  }
  return source.origin === target.origin;
}

/**
 * Returns true when the request looks like it came from our own app
 * (server-rendered page or client fetch within the same origin).
 *
 * Accepts requests that either:
 *  - have a `Referer` whose hostname is one of ours, OR
 *  - have an `Origin` whose hostname is one of ours, OR
 *  - have neither (server-to-server fetches from a Server Component
 *    on Vercel don't always send these; we don't want to break SSR).
 *
 * Rejects requests with a foreign `Referer` or `Origin`.
 */
export function isSameOriginRequest(req: Request): boolean {
  const refererHost = hostFromUrl(req.headers.get("referer"));
  const originHost = hostFromUrl(req.headers.get("origin"));
  const candidate = refererHost ?? originHost;
  if (!candidate) return true; // missing headers — give the benefit of the doubt (likely server-to-server)
  if (ALLOWED_HOSTS.has(candidate)) return true;
  if (PROJECT_PREVIEW_HOST.test(candidate)) return true;
  return false;
}

/**
 * True when a request carries NEITHER a Referer nor an Origin.
 *
 * `isSameOriginRequest` deliberately admits these, because Next's image
 * optimizer and some server-to-server fetches genuinely arrive bare, and
 * rejecting them would break real rendering. The cost of that kindness is
 * that "send no headers" is also the easiest way for anyone on the internet
 * to reach a route that spends money on a cache miss: strip two headers and
 * the origin guard waves you through.
 *
 * So separate the two questions. Callers keep using isSameOriginRequest to
 * decide whether to serve at all, and use this to decide how much
 * unattributed traffic they are willing to pay for. A browser loading an
 * image from one of our own pages always sends a Referer, so a tight
 * unattributed budget costs real users nothing.
 */
export function isUnattributedRequest(req: Request): boolean {
  return !req.headers.get("referer") && !req.headers.get("origin");
}

/**
 * The rate-limit check for a route that spends money upstream.
 *
 * Two buckets, because the traffic is two different things. The normal
 * budget bounds a real visitor, who is generous by design: a page of cards
 * is a dozen photos and a browsing session is many pages. The unattributed
 * budget bounds a caller who sent no Referer and no Origin, which
 * `isSameOriginRequest` admits so Next's image optimizer and genuine
 * server-to-server renders keep working, and which is therefore also the
 * cheapest way for anyone to reach a paid upstream on our bill.
 *
 * A page in a real browser always sends a Referer for its own subresource
 * requests, so the tight bucket never touches a visitor. Keeping both in one
 * call means a new paid route cannot pick up the permissive half and silently
 * miss the other.
 */
export async function isOverPaidRequestBudget(
  req: Request,
  key: string,
  limit: number,
  windowSeconds: number,
  unattributedLimit: number,
): Promise<boolean> {
  if (await isRateLimited(req, key, limit, windowSeconds)) return true;
  if (!isUnattributedRequest(req)) return false;
  return isRateLimited(req, `${key}-unattributed`, unattributedLimit, windowSeconds);
}

/**
 * Strict CSRF-style guard for browser POST endpoints that mutate public data.
 *
 * Unlike `isSameOriginRequest`, this rejects production requests when both
 * browser source headers are absent. Every supplied Origin/Referer must be a
 * valid app URL and must exactly match the request origin; a good Referer can
 * therefore never mask a foreign Origin. Localhost requests may omit both
 * headers so unit tests, curl-driven local checks, and local development keep
 * working without weakening the production path.
 */
export function isSameOriginMutationRequest(req: Request): boolean {
  const target = parsedUrl(req.url);
  if (!target || !isAllowedAppUrl(target)) return false;

  const supplied = [req.headers.get("origin"), req.headers.get("referer")].filter(
    (value): value is string => value !== null,
  );

  if (supplied.length === 0) return LOCAL_HOSTS.has(target.hostname);

  return supplied.every((value) => {
    const source = parsedUrl(value);
    return source !== null && isAllowedAppUrl(source) && isSameAppOrigin(source, target);
  });
}

/** Exact-enough JSON media-type check; accepts the normal optional charset. */
export function hasJsonContentType(req: Request): boolean {
  return req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

export type LimitedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "body-too-large" | "invalid-json" };

export type LimitedTextResult =
  | { ok: true; value: string }
  | { ok: false; error: "body-too-large" | "invalid-body" };

/**
 * Read and parse JSON with a hard retained-body cap. Content-Length provides an
 * early rejection when present; the streaming byte count remains authoritative
 * for chunked or dishonest requests and stops the read as soon as the cap is
 * crossed.
 */
export async function readJsonBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<LimitedJsonResult> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (declaredBytes > maxBytes) return { ok: false, error: "body-too-large" };
  }

  if (!req.body) return { ok: false, error: "invalid-json" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return { ok: false, error: "body-too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid-json" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, error: "invalid-json" };
  }
}

/**
 * Read a small text/form body without ever retaining more than `maxBytes`.
 * This is intentionally separate from `request.formData()`: the platform
 * parser may buffer an entire attacker-controlled multipart body before an
 * application can reject it.
 */
export async function readTextBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<LimitedTextResult> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (declaredBytes > maxBytes) return { ok: false, error: "body-too-large" };
  }

  if (!req.body) return { ok: false, error: "invalid-body" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return { ok: false, error: "body-too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid-body" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

/**
 * Per-IP rate limiter backed by Vercel KV (Upstash Redis under the
 * hood). Returns true when the request is OVER the limit and should
 * be rejected; false otherwise.
 *
 * Graceful fallback: when `KV_REST_API_URL` and `KV_REST_API_TOKEN`
 * are not set or temporarily fail, a bounded in-memory counter still
 * rate-limits each warm function instance. It cannot coordinate across
 * serverless instances, so KV remains the stronger production option, but a
 * missing integration no longer turns every application limit into a no-op.
 *
 * Uses Upstash's REST API directly (a single fetch with INCR + EXPIRE)
 * to avoid adding the `@upstash/redis` SDK as a dependency. Each
 * `bucket` key gets its own counter — pass different bucket names per
 * route family so e.g. /api/place-photo doesn't share a budget with
 * /api/travel-time.
 *
 *   const limited = await isRateLimited(req, "place-photo", 60, 60);
 *   if (limited) return new Response("Too Many Requests", { status: 429 });
 *
 * The first call sets the key with TTL=window; subsequent calls in
 * the same window just INCR. When the value exceeds `max`, return true.
 */

let kvWarned = false;
function warnKvUnconfiguredOnce(): void {
  if (kvWarned) return;
  kvWarned = true;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[rate-limit] KV_REST_API_URL/KV_REST_API_TOKEN not set: using a per-instance fallback; distributed limits require KV.",
    );
  }
}

type LocalLimit = { count: number; expiresAt: number };
const localLimits = new Map<string, LocalLimit>();
const MAX_LOCAL_LIMIT_KEYS = 5_000;
let nextLocalSweep = 0;

function isLocallyRateLimited(
  ip: string,
  bucket: string,
  max: number,
  windowSec: number,
): boolean {
  const now = Date.now();
  if (now >= nextLocalSweep) {
    for (const [key, value] of localLimits) {
      if (value.expiresAt <= now) localLimits.delete(key);
    }
    nextLocalSweep = now + 60_000;
  }

  const key = `${bucket}:${ip}`;
  const current = localLimits.get(key);
  if (!current || current.expiresAt <= now) {
    if (localLimits.size >= MAX_LOCAL_LIMIT_KEYS) {
      const oldest = localLimits.keys().next().value as string | undefined;
      if (oldest) localLimits.delete(oldest);
    }
    localLimits.set(key, { count: 1, expiresAt: now + windowSec * 1_000 });
    return false;
  }

  current.count += 1;
  return current.count > max;
}

export async function isRateLimited(
  req: Request,
  bucket: string,
  max: number,
  windowSec: number,
): Promise<boolean> {
  const ip = clientIp(req);
  if (!ip) return false; // no stable identity to bucket

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    // Say so once per instance, then retain meaningful local protection.
    warnKvUnconfiguredOnce();
    return isLocallyRateLimited(ip, bucket, max, windowSec);
  }

  const key = `rl:${bucket}:${ip}`;
  try {
    // Pipeline INCR + EXPIRE so we hit Upstash once and atomically
    // set the TTL on the first request in a window.
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec), "NX"],
      ]),
      // Don't keep the connection waiting forever; if KV is slow,
      // fail open rather than block the user.
      signal: AbortSignal.timeout(750),
    });
    if (!res.ok) return isLocallyRateLimited(ip, bucket, max, windowSec);
    const data = (await res.json()) as Array<{ result?: number }>;
    const count = data[0]?.result ?? 0;
    return count > max;
  } catch {
    // A transient KV failure falls back to the bounded warm-instance counter.
    return isLocallyRateLimited(ip, bucket, max, windowSec);
  }
}

/**
 * Best-effort client IP extraction. On Vercel, `x-real-ip` is set by the
 * platform edge to the peer it actually saw and OVERWRITES any inbound value,
 * so a caller cannot forge it. `x-forwarded-for` is a list whose LEFTMOST entry
 * is client-supplied — trusting it first let anyone rotate their rate-limit
 * bucket by sending `X-Forwarded-For: <random>`, sidestepping the per-IP caps
 * on the paid Google/Mapbox and LLM-spend routes. So we prefer x-real-ip and
 * fall back to XFF only when it is absent (non-Vercel/local). On localhost both
 * are empty — we return null and the limiter treats that as "no IP to bucket
 * against" and lets the request through. The Vercel Firewall remains the
 * authoritative edge defense; this just stops the trivial in-app bypass.
 */
function clientIp(req: Request): string | null {
  const real = req.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

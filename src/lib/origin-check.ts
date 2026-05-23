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
  // Vercel preview URLs follow this pattern
  // (we accept *.vercel.app subdomains for our project only)
  // Localhost for dev. Ports vary — the host comparison strips the port.
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

// Matches our own preview deploys: frederick-radius-<hash>-mikedlab.vercel.app
const PROJECT_PREVIEW_HOST = /^frederick-radius-[a-z0-9]+(?:-mikedlab)?\.vercel\.app$/;

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
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
 * Per-IP rate limiter backed by Vercel KV (Upstash Redis under the
 * hood). Returns true when the request is OVER the limit and should
 * be rejected; false otherwise.
 *
 * Graceful fallback: when `KV_REST_API_URL` and `KV_REST_API_TOKEN`
 * are not set, this is a NO-OP that always allows the request — so
 * pre-KV deploys still work, and the origin-check guard above
 * remains the only defense. Adding the Vercel KV integration in the
 * dashboard auto-injects the env vars and this guard lights up.
 *
 * Uses Upstash's REST API directly (a single fetch with INCR + EXPIRE)
 * to avoid adding the `@upstash/redis` SDK as a dependency. Each
 * `bucket` key gets its own counter — pass different bucket names per
 * route family so e.g. /api/place-photo doesn't share a budget with
 * /api/discover/nearby.
 *
 *   const limited = await isRateLimited(req, "place-photo", 60, 60);
 *   if (limited) return new Response("Too Many Requests", { status: 429 });
 *
 * The first call sets the key with TTL=window; subsequent calls in
 * the same window just INCR. When the value exceeds `max`, return true.
 */
export async function isRateLimited(
  req: Request,
  bucket: string,
  max: number,
  windowSec: number,
): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false; // KV not configured — no-op

  const ip = clientIp(req);
  if (!ip) return false; // no IP to bucket against — let it through

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
    if (!res.ok) return false; // KV error — fail open
    const data = (await res.json()) as Array<{ result?: number }>;
    const count = data[0]?.result ?? 0;
    return count > max;
  } catch {
    // Network error, timeout, JSON parse error — fail open. We'd
    // rather serve a legit user than block them on a transient KV blip.
    return false;
  }
}

/**
 * Best-effort client IP extraction. Vercel sets `x-forwarded-for` (the
 * first entry is the original client) and `x-real-ip` (the immediate
 * peer). On localhost both will be empty — we return null and the
 * rate limiter treats that as "no IP to bucket against" and lets the
 * request through.
 */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

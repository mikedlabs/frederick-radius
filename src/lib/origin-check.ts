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

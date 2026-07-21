import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { BETA_COOKIE, betaToken, verifyCodeCookie, verifyMemberCookie } from "@/lib/beta-gate";
import { MEMBER_COOKIE } from "@/lib/nfc-constants";

/**
 * Edge middleware: three independent gates, applied conditionally
 * by path.
 *
 *   1. /admin/*   — Basic Auth (P0-5 interim gate). Fails CLOSED:
 *                   if ADMIN_USER / ADMIN_PASSWORD aren't configured,
 *                   /admin is unreachable. Set both env vars to
 *                   enable. Edge-safe (Web `atob`, no Node crypto).
 *
 *   2. Everywhere else — Supabase session refresh. Short-lived
 *                   access tokens (~1h) get silently refreshed on
 *                   each request that carries a session cookie.
 *                   Logged-out users pass through with no change.
 *                   Does NOT enforce auth; pages decide whether
 *                   they need a signed-in user via getServerUser().
 *
 *   3. Static + image paths — skipped via the matcher below so the
 *                   middleware doesn't intercept _next/image, _next/
 *                   static, or asset requests.
 *
 * Onboarding redirect was REMOVED in the pre-launch pass. The persona
 * affordance survives as an in-page chip on /now which a returning
 * user can opt into when they want to.
 */
function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Frederick Radius Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Paths that stay reachable even while the beta wall is up: the unlock page,
 *  the legal pages linked from its consent copy, all API/fetch routes (never
 *  redirect a fetch to an HTML page), and anything that is a real file (sw.js,
 *  manifest, icons, og images). Exported so the wall's public surface is
 *  covered by a focused unit test. */
export function isBetaExempt(pathname: string): boolean {
  return (
    pathname === "/beta" ||
    pathname.startsWith("/beta/") ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/") ||
    pathname === "/terms" ||
    pathname.startsWith("/terms/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/sitemap") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/opengraph") ||
    // Food-truck operator surfaces: a truck owner claiming their truck and an
    // approved operator dropping a live beacon are NOT beta users, so these two
    // pages must be reachable without a code. The /food-trucks browse directory
    // itself stays gated. (The beacon/claim API routes are already exempt via
    // /api/ above.)
    pathname === "/food-trucks/claim" ||
    pathname === "/food-trucks/out" ||
    // NFC tap endpoint: /j/<code> is the access-GRANTING route. It must reach
    // its handler while the wall is up so it can validate the card and set the
    // unlock cookie itself; the wall would otherwise 307 the tap to /beta.
    pathname.startsWith("/j/") ||
    /\.[a-z0-9]+$/i.test(pathname) // sw.js, manifest.webmanifest, robots.txt, *.png, ...
  );
}

// Memoize the expected token across requests on a warm edge worker; recompute
// only if the password env changes (a redeploy resets module scope anyway).
let cachedPw: string | undefined;
let cachedToken: string | null = null;
async function expectedBetaToken(pw: string): Promise<string> {
  if (cachedPw !== pw) {
    cachedToken = await betaToken(pw);
    cachedPw = pw;
  }
  return cachedToken!;
}

/** The shared-password beta wall. Returns a redirect to /beta when the site is
 *  gated and this request is not yet unlocked; null otherwise (incl. gate off).
 *
 *  NOTE: BETA_PASSWORD is read into the Edge Middleware bundle at BUILD time, so
 *  setting or changing it in Vercel requires a FRESH build (a new commit, or a
 *  Redeploy with "Use existing Build Cache" UNCHECKED). A cache-reusing redeploy
 *  keeps the old bundle and the gate stays off. */
/** Link-preview / unfurl bots that may pass the beta wall READ-ONLY.
 *
 *  The wall 307s every scraper to /beta, so every place or event link a beta
 *  tester texts or posts renders the generic early-access card — the built
 *  /api/og cards (place, event, muni, story) are unreachable, muting word of
 *  mouth during exactly the highest-enthusiasm window. These UAs fetch a page
 *  once to render its preview; they are not indexers (Googlebot is NOT here,
 *  and /beta stays noindex), and the wall is a soft velvet rope, not auth —
 *  nothing behind it is sensitive. Substring match on the UA, GETs only.
 */
const PREVIEW_BOT_UA =
  /facebookexternalhit|twitterbot|slackbot|linkedinbot|discordbot|whatsapp|telegrambot|applebot(?!-extended)|pinterestbot|skypeuripreview/i;

async function betaGate(req: NextRequest): Promise<NextResponse | null> {
  const pw = process.env.BETA_PASSWORD;
  if (!pw) return null; // gate disabled: site is public
  const { pathname } = req.nextUrl;
  if (isBetaExempt(pathname)) return null;
  // Unfurl bots see the real page so shared links carry real previews.
  if (req.method === "GET" && PREVIEW_BOT_UA.test(req.headers.get("user-agent") ?? "")) {
    return null;
  }
  const cookie = req.cookies.get(BETA_COOKIE)?.value;
  // Two ways the fr_beta cookie unlocks: the shared-password token (owner master
  // key), or a signed per-user access code. Both are pure crypto checks — no DB.
  if (cookie) {
    if (cookie === (await expectedBetaToken(pw))) return null; // master password
    if (await verifyCodeCookie(cookie)) return null; // valid per-user code
  }
  // A tapped NFC device also stays in for the ~1-year life of its signed
  // fr_member cookie, so it isn't locked out when the 12h fr_beta unlock expires
  // — the whole point of per-member cards is to follow a device over time, which
  // a same-day lockout would defeat. The member id grants beta access and
  // nothing more (never admin), and is forgeable only with the server signing
  // secret, exactly like the code cookie above. Emergency revocation of ALL
  // access is still a secret rotation, same as the beta codes.
  if (await verifyMemberCookie(req.cookies.get(MEMBER_COOKIE)?.value)) return null;
  const url = new URL("/beta", req.url);
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

function adminBasicAuth(req: NextRequest): NextResponse | null {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return unauthorized();

  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  const sep = decoded.indexOf(":");
  if (sep === -1) return unauthorized();
  const u = decoded.slice(0, sep);
  const p = decoded.slice(sep + 1);

  if (u !== user || p !== pass) return unauthorized();
  return null; // pass-through
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isAdminPath(pathname)) {
    const block = adminBasicAuth(req);
    if (block) return block;
    // Admin paths skip Supabase session refresh — the admin surface
    // is its own world.
    return NextResponse.next();
  }

  // Beta wall (when BETA_PASSWORD is set): redirect un-unlocked visitors to
  // /beta. Sits before the session refresh so a locked visitor never reaches
  // the app. No-op when the gate is disabled.
  const blocked = await betaGate(req);
  if (blocked) return blocked;

  // Everywhere else: refresh Supabase session on the cookie if there
  // is one, then pass through. Logged-out users get an unchanged
  // response.
  return await updateSession(req);
}

export const config = {
  // Run on everything EXCEPT static assets + API images. The browser
  // makes a lot of `/_next/static/*` requests; skipping them avoids
  // running the session refresh logic on every chunk.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|api/place-photo|api/og).*)",
  ],
};

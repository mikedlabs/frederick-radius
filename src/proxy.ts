import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Request proxy: admin protection plus public-session refresh.
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
 *
 * The public beta wall was removed for launch. BETA_PASSWORD may remain
 * configured for legacy invite tooling, but it must never block a public
 * route here.
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

/**
 * Constant-time string equality for edge (Web Crypto, no Node `crypto`).
 * Compares SHA-256 digests of the two inputs: the digests are fixed 32-byte
 * length regardless of input, so this leaks neither the credential length nor
 * (via an early `!==` exit) how many leading characters matched — closing the
 * timing side-channel the old `u !== user || p !== pass` compare left open.
 */
async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

async function adminBasicAuth(req: NextRequest): Promise<NextResponse | null> {
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

  // Compare the whole `user:pass` pair in constant time (ADMIN_USER carries no
  // colon, so the reconstructed expected value is canonical). A mismatch in
  // either field fails identically, with no per-character timing leak.
  if (!(await timingSafeEqualStr(decoded, `${user}:${pass}`))) return unauthorized();
  return null; // pass-through
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isAdminPath(pathname)) {
    const block = await adminBasicAuth(req);
    if (block) return block;
    // Admin paths skip Supabase session refresh — the admin surface
    // is its own world.
    return NextResponse.next();
  }

  // Every public route is open. Refresh Supabase session state when a cookie is
  // present, then pass through unchanged for logged-out visitors.
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

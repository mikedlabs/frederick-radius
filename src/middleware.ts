import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

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

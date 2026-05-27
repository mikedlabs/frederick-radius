import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: two independent gates.
 *
 * Onboarding redirect was REMOVED in the pre-launch pass. The previous
 * behavior sent first-time visitors of `/now` to `/welcome` and
 * first-time visitors of `/` to `/about`. Pre-launch review caught
 * this as the single biggest UX failure: a stranger who lands on
 * "Frederick Radius — the field guide" via a shared Facebook link
 * should see the actual product, not a persona-picker. The persona
 * affordance survives as an in-page chip on /now ("Tune this for
 * you") which a returning user can opt into when they want to. The
 * old `fr_onboarded` cookie is left alone — it still does its job on
 * the welcome flow itself; we just no longer gate the product behind
 * its absence.
 *
 * What remains:
 *   - Gate 1: admin Basic Auth on /admin. P0-5 interim gate, NOT the
 *     full Auth.js direction. Fails CLOSED: if ADMIN_USER /
 *     ADMIN_PASSWORD aren't configured, /admin is unreachable for
 *     everyone. Set both env vars to enable access. Zero
 *     dependencies, edge-safe (Web `atob`, no Node Buffer/crypto).
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

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Admin Basic Auth (everything below).
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};

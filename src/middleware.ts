import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: two independent gates.
 *
 * 1. Onboarding nudge. A first-time visitor of the entry routes (/ and
 *    /today) with no `fr_onboarded` cookie is sent to /welcome once.
 *    Cookie-based because middleware cannot read localStorage; only the
 *    two entry routes are gated, so deep links are never blocked.
 *
 * 2. P0-5 admin access gate: Basic Auth on /admin. The roadmap's
 *    sanctioned interim gate, NOT the full Auth.js direction. It fails
 *    CLOSED: if ADMIN_USER / ADMIN_PASSWORD are not configured, /admin
 *    is unreachable for everyone. Set both env vars (Vercel project
 *    settings + .env.local for local) to enable access. Zero
 *    dependencies, edge-safe (Web `atob`, no Node Buffer/crypto).
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

  // Gate 1: onboarding nudge for the two entry routes. A visitor with
  // no `fr_onboarded` cookie sees /welcome once; everyone else passes.
  if (pathname === "/" || pathname === "/today") {
    if (!req.cookies.get("fr_onboarded")) {
      const url = req.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Gate 2: admin Basic Auth (everything below).
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
  matcher: ["/admin", "/admin/:path*", "/", "/today"],
};

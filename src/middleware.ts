import { NextResponse, type NextRequest } from "next/server";

/**
 * P0-5 minimal admin access gate.
 *
 * This is the roadmap's sanctioned interim gate, NOT the full Auth.js /
 * ADMIN_EMAILS direction. It fails CLOSED: if ADMIN_USER / ADMIN_PASSWORD
 * are not configured, /admin is unreachable for everyone, so anonymous
 * users can never load admin pages. Set both env vars (Vercel project
 * settings + .env.local for local) to enable access. Zero dependencies,
 * edge-safe (Web `atob`, no Node Buffer/crypto), instant rollback.
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

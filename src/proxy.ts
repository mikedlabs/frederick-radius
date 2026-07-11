import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, loginUrlFor } from "@/lib/auth-routing";
import { updateSession, type SessionUpdate } from "@/lib/supabase/proxy";

/** Keep the existing fail-closed Basic Auth boundary around the admin tools. */
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

function adminBasicAuth(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) return unauthorized();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return unauthorized();
  if (
    decoded.slice(0, separator) !== expectedUser ||
    decoded.slice(separator + 1) !== expectedPassword
  ) {
    return unauthorized();
  }

  return null;
}

function protectedRouteRedirect(request: NextRequest, session: SessionUpdate) {
  const loginUrl = loginUrlFor(request.url);
  loginUrl.searchParams.set(
    "reason",
    session.authState === "unavailable"
      ? "verification_unavailable"
      : session.hadSessionCookie
        ? "session_ended"
        : "sign_in_required",
  );

  const redirect = NextResponse.redirect(loginUrl);
  session.response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  redirect.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  redirect.headers.set("Pragma", "no-cache");
  redirect.headers.set("Expires", "0");
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAdminPath(pathname)) {
    return adminBasicAuth(request) ?? NextResponse.next();
  }

  const session = await updateSession(request);
  if (isProtectedPath(pathname) && session.authState !== "authenticated") {
    return protectedRouteRedirect(request, session);
  }

  return session.response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|api/place-photo|api/og).*)",
  ],
};

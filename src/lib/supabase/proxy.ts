import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export type SessionAuthState = "authenticated" | "anonymous" | "unavailable";

export type SessionUpdate = {
  response: NextResponse;
  authState: SessionAuthState;
  hadSessionCookie: boolean;
};

/**
 * Refresh and verify a Supabase session for a Next.js Proxy request.
 *
 * Anonymous traffic stays fast: without an auth cookie we do not contact
 * Supabase. Requests carrying a session call getClaims(), which verifies the
 * JWT and refreshes it when needed. Cookie writes and Supabase's private/no-
 * store response headers are forwarded together so Vercel can never cache one
 * person's refreshed session for another visitor.
 */
export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  let response = NextResponse.next({ request });
  const hadSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { response, authState: "unavailable", hadSessionCookie };
  }

  if (!hadSessionCookie) {
    return { response, authState: "anonymous", hadSessionCookie };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  // Keep this call immediately after client creation. Supabase's SSR client
  // relies on the refresh side effects happening before any response work.
  try {
    const { data, error } = await supabase.auth.getClaims();
    return {
      response,
      authState: !error && data?.claims?.sub ? "authenticated" : "anonymous",
      hadSessionCookie,
    };
  } catch {
    // Public pages should remain usable during an Auth outage. Protected pages
    // treat this state as signed out and fail closed in src/proxy.ts.
    return { response, authState: "unavailable", hadSessionCookie };
  }
}

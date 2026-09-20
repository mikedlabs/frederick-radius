import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export type SessionAuthState = "authenticated" | "anonymous" | "unavailable";

export type SessionUpdate = {
  response: NextResponse;
  authState: SessionAuthState;
  hadSessionCookie: boolean;
};

// A stalled Auth refresh must not hold every public route until Vercel's
// function deadline. Protected routes still treat a timeout as unavailable.
export const SESSION_VERIFICATION_TIMEOUT_MS = 4_000;

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

  const controller = new AbortController();
  let acceptingCookies = true;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      acceptingCookies = false;
      console.warn("[auth] Session verification deadline exceeded.");
      reject(new Error("Session verification timed out"));
      controller.abort();
    }, SESSION_VERIFICATION_TIMEOUT_MS);
  });

  try {
    const supabase = createServerClient(url, key, {
      global: {
        fetch(input, init) {
          const upstreamSignal = init?.signal ??
            (input instanceof Request ? input.signal : undefined);
          return fetch(input, {
            ...init,
            signal: upstreamSignal
              ? AbortSignal.any([upstreamSignal, controller.signal])
              : controller.signal,
          });
        },
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // SDK retries or a fetch implementation that ignores abort may
          // finish later. Never mutate request/response cookies after return.
          if (!acceptingCookies) return;
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

    // Keep this call immediately after client creation. Refresh cookie/header
    // side effects must finish before the verified response is returned.
    const { data, error } = await Promise.race([
      supabase.auth.getClaims(),
      deadline,
    ]);
    return {
      response,
      authState: !error && data?.claims?.sub ? "authenticated" : "anonymous",
      hadSessionCookie,
    };
  } catch {
    // Public pages should remain usable during an Auth outage. Protected pages
    // treat this state as signed out and fail closed in src/proxy.ts.
    response.headers.set("Cache-Control", "private, no-store");
    return { response, authState: "unavailable", hadSessionCookie };
  } finally {
    acceptingCookies = false;
    clearTimeout(timer!);
    controller.abort();
  }
}

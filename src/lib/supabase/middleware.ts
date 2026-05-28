/**
 * Supabase middleware helper.
 *
 * The auth library issues short-lived access tokens (~1h) plus a
 * longer refresh token. Without middleware, expired tokens never
 * refresh and the user gets logged out mid-session. This helper
 * runs on every request inside src/middleware.ts: it reads the
 * incoming cookies, asks Supabase to refresh if needed, and writes
 * the refreshed cookies onto the outgoing response.
 *
 * Performance note: this adds one Supabase round-trip per request
 * that has a session. It's a small cost — the alternative is users
 * silently signing themselves out every hour. @supabase/ssr handles
 * the actual refresh logic; we just plumb cookies through it.
 *
 * It does NOT enforce authentication on routes. Anything that needs
 * "logged in only" gates is enforced in the page / route handler
 * itself via getServerUser(). Public browsing stays fully usable
 * without an account.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(req: NextRequest) {
  let supabaseResponse = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return supabaseResponse; // Auth not configured; skip silently.

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          req.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Triggers the refresh-if-needed flow. Result is intentionally
  // ignored — we only care about the side effect on the cookies.
  await supabase.auth.getUser();

  return supabaseResponse;
}

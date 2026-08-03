/**
 * Server-side auth helpers.
 *
 * One source of truth for "who's signed in?" inside Server Components
 * and Route Handlers. The session itself lives in cookies (managed by
 * @supabase/ssr); these helpers just expose the user shape the app
 * needs.
 *
 * Auth is OPTIONAL throughout the app. Every page falls back to the
 * logged-out experience when getServerUser() returns null. The only
 * "require auth" enforcement happens inside Route Handlers that
 * write user-specific data (e.g. /api/follows).
 */
import { createClient } from "@/lib/supabase/server";

export type ServerUser = {
  id: string;
  email: string | null;
  /** ISO timestamp of last sign-in. Useful for "new here?" surfaces. */
  last_sign_in_at: string | null;
};

/**
 * Return the current authenticated user, or null if no session.
 * Read-only — safe to call inside Server Components.
 *
 * Uses supabase.auth.getClaims(), which verifies the JWT signature and expiry.
 * With Supabase's asymmetric signing keys that verification is local after the
 * JWKS cache is warm; older symmetric projects safely fall back to the Auth
 * server. This preserves the verified-identity contract without forcing a
 * network round trip on every page and route that already crossed middleware.
 * We deliberately do NOT use getSession(), which only trusts cookie storage.
 */
export async function getServerUser(): Promise<ServerUser | null> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    // Supabase not configured (env vars missing) — treat as anonymous
    // rather than throwing. Auth is optional: every consumer already
    // handles a null user ("on this device" mode), so this keeps pages
    // rendering and, critically, stops the static prerender of tabs
    // like /my-radius from crashing the production build when keys
    // aren't present in the build environment.
    return null;
  }
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return {
      id: data.claims.sub,
      email:
        typeof data.claims.email === "string" ? data.claims.email : null,
      // The JWT intentionally does not promise the Auth user record's
      // last_sign_in_at field. Nothing currently consumes it, so keep the
      // honest unknown instead of relabeling the token-issued timestamp.
      last_sign_in_at: null,
    };
  } catch {
    // Auth transport/JWKS failure is anonymous for read surfaces and therefore
    // fails closed for every write route that requires a user id.
    return null;
  }
}

/**
 * Convenience: return the user's id only, or null. Most write paths
 * just need this and not the full user object.
 */
export async function getServerUserId(): Promise<string | null> {
  const u = await getServerUser();
  return u?.id ?? null;
}

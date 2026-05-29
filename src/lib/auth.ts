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
 * Uses supabase.auth.getUser() (which validates the token with the
 * Supabase auth server) NOT getSession() (which trusts the cookie).
 * The former is the safe default for any server-side authz check.
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
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    last_sign_in_at: data.user.last_sign_in_at ?? null,
  };
}

/**
 * Convenience: return the user's id only, or null. Most write paths
 * just need this and not the full user object.
 */
export async function getServerUserId(): Promise<string | null> {
  const u = await getServerUser();
  return u?.id ?? null;
}

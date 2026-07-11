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
import { redirect } from "next/navigation";
import { PROTECTED_SYNC_PATH, sanitizeRedirectPath } from "@/lib/auth-routing";

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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      last_sign_in_at: data.user.last_sign_in_at ?? null,
    };
  } catch {
    // Auth is optional everywhere except explicitly protected routes. Missing
    // preview env vars or a transient Supabase outage must not take down public
    // My Radius/Settings pages; their device-local experience still works.
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

/** Defense-in-depth gate for protected Server Components. */
export async function requireServerUser(
  nextPath: string = PROTECTED_SYNC_PATH,
): Promise<ServerUser> {
  const user = await getServerUser();
  if (user) return user;

  const next = sanitizeRedirectPath(nextPath, PROTECTED_SYNC_PATH);
  redirect(`/auth/login?next=${encodeURIComponent(next)}&reason=sign_in_required`);
}

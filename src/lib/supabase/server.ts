/**
 * Server-side Supabase client.
 *
 * Use this inside Server Components, Route Handlers, and Server Actions.
 * It reads/writes the auth cookies via Next.js's `cookies()` so the
 * session round-trips across requests.
 *
 * IMPORTANT: this client uses the same publishable (anon) key as the
 * browser client — RLS still applies. For unrestricted server-only
 * operations (e.g. ingestion, admin batch jobs) use a service-role
 * key client; that's a separate file we'll add when first needed.
 *
 * Why the `cookies-noop` set/remove paths exist: in Server Components
 * we sometimes get a `cookies()` handle that is read-only (Next throws
 * if you try to mutate it from a component). The middleware refreshes
 * the session, so this client only needs *write* access in the auth
 * callback Route Handler — which has a mutable cookie store. We
 * swallow the set/remove errors elsewhere so a stale-token refresh
 * during page render doesn't crash the page; the next request picks
 * up the refreshed cookie from middleware.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — the cookies() handle is
          // read-only there. Middleware refreshes the session on the
          // next request; safe to swallow.
        }
      },
    },
  });
}

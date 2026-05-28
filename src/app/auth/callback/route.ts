import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { user_profiles } from "@/lib/db/schema";

/**
 * /auth/callback — completes the magic-link sign-in.
 *
 * Supabase sends the user here after they click the link in their
 * email. The URL carries either:
 *   - ?code=…&next=… (PKCE flow — default for @supabase/ssr)
 *   - error params if the link expired or was tampered with
 *
 * Steps:
 *   1. Exchange the code for a session (sets the auth cookies).
 *   2. Upsert a user_profiles row for the just-signed-in user.
 *      Idempotent on the auth.users.id PK, so repeated sign-ins
 *      don't create duplicates and don't clobber an existing profile.
 *   3. Redirect to the `next` param (or /my-radius as default).
 *
 * On any failure, we redirect to /auth/login?error=… so the user
 * doesn't bounce off a blank 500. The error message is intentionally
 * generic — the underlying causes are mostly "link expired" or "link
 * already used", neither of which the user can act on beyond
 * requesting a new one.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/my-radius";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login?error=missing_code", req.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) {
    return NextResponse.redirect(new URL("/auth/login?error=expired", req.url));
  }

  // Upsert profile row. ON CONFLICT DO NOTHING keeps existing
  // display_name + prefs intact on re-sign-in. Skips silently if the
  // DB isn't reachable (dev env without DATABASE_URL) — Phase 1c's
  // useFollows hook lazily creates the profile on first follow.
  try {
    const db = getDb();
    if (db) {
      await db
        .insert(user_profiles)
        .values({ id: data.user.id })
        .onConflictDoNothing({ target: user_profiles.id });
    }
  } catch (err) {
    // Don't block sign-in on a profile-write hiccup; we'll lazily
    // create it the first time the user opens /my-radius if missing.

    console.error("[auth/callback] profile upsert failed:", err);
  }

  // Safe-list `next` to same-origin paths only — prevents using us as
  // an open redirector. Anything that doesn't start with "/" goes home.
  const safeNext = next.startsWith("/") ? next : "/my-radius";
  return NextResponse.redirect(new URL(safeNext, req.url));
}

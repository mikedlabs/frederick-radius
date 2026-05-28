import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * /auth/signout — clears the Supabase session.
 *
 * POST-only (forms must use method="post") so a stray prefetch
 * doesn't accidentally sign the user out. After signOut(), we
 * redirect to /my-radius — the user's localStorage list is still
 * there, so the experience degrades gracefully from "synced
 * follows" to "device-local list" without breaking the page.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/my-radius", req.url), { status: 303 });
}

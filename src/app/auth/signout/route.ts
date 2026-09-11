import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * /auth/signout — stops sync on this device only.
 *
 * POST-only so a prefetch cannot sign the user out. Supabase defaults to a
 * global sign-out, so scope is explicitly local: sessions on the user's other
 * devices continue working. Device-local saves and settings are untouched.
 */
export async function POST(req: NextRequest) {
  let signedOut = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    signedOut = !error;
  } catch {
    signedOut = false;
  }

  const destination = new URL(signedOut ? "/my-radius" : "/settings/sync", req.url);
  destination.searchParams.set(signedOut ? "signed_out" : "signout", signedOut ? "1" : "failed");
  return NextResponse.redirect(destination, {
    status: 303,
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

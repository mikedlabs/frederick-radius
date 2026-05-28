import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";

/**
 * /api/auth/me — the "who am I?" lightweight endpoint for client code.
 *
 * Returns { user: { id, email } | null }. Always 200 — clients
 * branch on the user field, not on status. Cached per-request only
 * (no-store) so the cookie's session is always the source of truth.
 */
export async function GET() {
  const user = await getServerUser();
  return NextResponse.json(
    { user: user ? { id: user.id, email: user.email } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

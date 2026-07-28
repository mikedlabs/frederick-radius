import { NextResponse } from "next/server";
import { getDeckKeys } from "@/lib/deck/readings";

/**
 * The deck's refresh endpoint.
 *
 * The board is server-rendered once on /compass, which made it a snapshot: a
 * page left open showed a bus count from whenever it loaded. The client polls
 * this while the tab is visible so the readings actually move, which is the
 * entire claim a live board makes.
 *
 * Upstream cost is bounded by the integrations themselves — each one carries
 * its own `next: { revalidate }` window, so a poll usually serves Next's cache
 * rather than hitting eleven providers again.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const keys = await getDeckKeys(now);
  return NextResponse.json(
    { keys, readAt: now.toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";

export const revalidate = 300;

/**
 * One event, by slug, from THE unified assembly (curated + live feeds,
 * same set /today and /events render — never a second query that could
 * disagree with the page).
 *
 * Exists for the sheet system's on-demand path: lean surfaces (/today,
 * /live-music) deliberately keep the event corpus out of their client
 * payload, so a tap there fetches just the one tapped event instead of
 * shipping hundreds up front. Shares the five-minute cache horizon of
 * the pages themselves.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { publicEvents } = await assembleUnifiedEvents(new Date());
  const event = publicEvents.find((e) => e.slug === slug);
  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    { event },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}

import { NextResponse } from "next/server";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { EVENTS } from "@/data/events";
import { selectTodayEvents } from "@/lib/today-events";

export const revalidate = 300;

export async function GET() {
  const now = new Date();
  const snapshot = await loadTodayEventSnapshot(now).catch(() => null);
  const events = selectTodayEvents(snapshot?.publicEvents ?? EVENTS, now);

  return NextResponse.json(
    { events, partial: !snapshot || snapshot.sourceHealth.degraded },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}

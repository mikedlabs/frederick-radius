import { NextResponse } from "next/server";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { EVENTS } from "@/data/events";
import { selectTodayEvents } from "@/lib/today-events";

export const revalidate = 300;

export async function GET() {
  const now = new Date();
  const live = await Promise.race([
    assembleUnifiedEvents(now).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_250)),
  ]);
  const events = selectTodayEvents(live?.publicEvents ?? EVENTS, now);

  return NextResponse.json(
    { events, partial: !live || live.sourceHealth.degraded },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}

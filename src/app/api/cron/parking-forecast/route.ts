/**
 * Predictive parking-forecast cron — LIVE today, no external feed needed.
 *
 * Frederick has no free public live-occupancy feed, but we can still help: when
 * a crowd-drawing event is about to start downtown, the closest garage tends to
 * fill, so we push a calm heads-up ("Carroll Creek deck usually fills, try Court
 * Street or Church Street") to subscribers on the `parking` topic. It's a
 * PREDICTION, framed as one, built only from data we already hold — the unified
 * event set (geo + time + category) and the five garage coordinates.
 *
 * Dedupe is per event per day via push_log, so an event alerts once even though
 * it's eligible for several cron ticks inside its lead window. Skips cleanly
 * when VAPID isn't configured or nothing is eligible.
 *
 * Schedule (vercel.json): every 30 minutes. Auth: the shared CRON_SECRET bearer.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { hasPhysicalAttendance } from "@/lib/events/attendance";
import { parkingForecasts, type ForecastEvent } from "@/lib/parking-forecast";
import { PARKING_GARAGES } from "@/data/parking-garages";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (!configurePush()) {
    return NextResponse.json({ ok: true, skipped: "VAPID not configured" });
  }

  const now = new Date();
  // Same live board the public event surfaces use: unifiedEvents (curated +
  // feeds + ingested calendars), not the hand-curated seed file. Filter to
  // physical events with a point so parkingForecasts can test downtown
  // garage proximity. Deduped by slug inside parkingForecasts().
  const { publicEvents } = await assembleUnifiedEvents(now);
  const events: ForecastEvent[] = publicEvents
    .filter((event) => hasPhysicalAttendance(event) && event.geom)
    .map((event) => ({
      slug: event.slug,
      title: event.title,
      starts_at: event.starts_at,
      geom: event.geom,
      category: event.category,
    }));

  if (events.length === 0) {
    console.error(
      "[events] parking-forecast checked zero events",
      { public_events: publicEvents.length },
    );
  } else {
    console.info("[events] parking-forecast checked", events.length, "events");
  }

  const forecasts = parkingForecasts(events, PARKING_GARAGES, now);

  const results: Array<{ event: string; garage: string; claimed: boolean; sent: number }> = [];
  for (const f of forecasts) {
    const alts = f.alternatives.length
      ? `${f.primaryGarage.name} usually fills. Try ${f.alternatives.join(" or ")}.`
      : `${f.primaryGarage.name} usually fills, so arrive early or plan a backup.`;
    const r = await fanoutToTopic("parking", f.dedupeKey, {
      title: `Parking heads-up: ${f.event.title}`,
      body: alts,
      url: "/parking",
      tag: `parking-forecast:${f.event.slug}`,
    });
    results.push({ event: f.event.slug, garage: f.primaryGarage.slug, claimed: r.claimed, sent: r.sent });
  }

  return NextResponse.json({
    ran_at: now.toISOString(),
    events_checked: events.length,
    public_events: publicEvents.length,
    forecasts: forecasts.length,
    detail: results,
    ...(events.length === 0 ? { note: "zero events to check" } : {}),
  });
}

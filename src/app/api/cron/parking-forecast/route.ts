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
import { allUpcoming, civicUpcoming } from "@/lib/loaders/events";
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
  // The curated + civic upcoming set carries reliable geo/time/category for
  // downtown events (Alive @ Five, Weinberg shows, festivals) — exactly the
  // garage-filling draws. Deduped by slug inside parkingForecasts().
  const events: ForecastEvent[] = [...allUpcoming(now), ...civicUpcoming(now)].map((e) => ({
    slug: e.slug,
    title: e.title,
    starts_at: e.starts_at,
    geom: e.geom,
    category: e.category,
  }));

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
    forecasts: forecasts.length,
    detail: results,
  });
}

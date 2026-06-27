/**
 * Garage-full fanout cron — DORMANT until the live feed is wired.
 *
 * Pulls the live downtown-garage occupancy snapshot and pushes a "garage is
 * full" alert to subscribers on the `garage-full` topic whenever a deck crosses
 * the full threshold (see GARAGE_FULL_THRESHOLD). Dedupe is by deck + a coarse
 * time window via push_log, so a garage that stays full doesn't re-ping every
 * run — at most once per ~3-hour block per deck (≈ one alert per fill episode),
 * while still allowing a fresh alert for a separate evening fill.
 *
 * Gated three ways, all graceful no-ops that return 200:
 *   - PARKING_OCCUPANCY_URL unset  → the feed is dormant (the default today;
 *     Frederick's live counts live in the ParkZen-powered Park Frederick app,
 *     which needs a licensed endpoint — see src/lib/integrations/parking-live).
 *   - VAPID not configured         → push can't send.
 *   - no decks full                → nothing to fan out.
 *
 * Auth: same CRON_SECRET bearer as the other cron paths.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import {
  getParkingOccupancy,
  parkingFeedConfigured,
} from "@/lib/integrations/parking-live";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";
import { PARKING_GARAGES } from "@/data/parking-garages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (!parkingFeedConfigured()) {
    return NextResponse.json({ ok: true, skipped: "PARKING_OCCUPANCY_URL not set (dormant)" });
  }
  if (!configurePush()) {
    return NextResponse.json({ ok: true, skipped: "VAPID not configured" });
  }

  const snap = await getParkingOccupancy();
  const nameBySlug = new Map(PARKING_GARAGES.map((g) => [g.slug, g.name]));

  // Coarse fill-window for the dedupe key: date + 3-hour block (UTC). One alert
  // per deck per block prevents minute-by-minute spam while a deck sits full.
  const now = new Date();
  const block = `${now.toISOString().slice(0, 10)}T${Math.floor(now.getUTCHours() / 3)}`;

  // Which matched garages currently have room — so the alert can suggest one.
  const withSpace = snap.decks
    .filter((d) => d.garageSlug && !d.isFull && (d.available ?? 1) > 0)
    .map((d) => nameBySlug.get(d.garageSlug!) ?? d.name);

  const results: Array<{ garage: string; percentFull: number | null; claimed: boolean; sent: number }> = [];
  for (const d of snap.decks) {
    if (!d.isFull || !d.garageSlug) continue;
    const label = nameBySlug.get(d.garageSlug) ?? d.name;
    const detail =
      d.available !== null && d.available <= 0
        ? "is full"
        : d.percentFull !== null
          ? `is ${d.percentFull}% full`
          : "is nearly full";
    const body = withSpace.length
      ? `Try ${withSpace.slice(0, 2).join(" or ")}, still has room.`
      : "Tap for the other downtown garages.";

    const r = await fanoutToTopic("garage-full", `${d.garageSlug}:${block}`, {
      title: `${label} ${detail}`,
      body,
      url: "/parking",
      tag: `parking:${d.garageSlug}`,
    });
    results.push({ garage: d.garageSlug, percentFull: d.percentFull, claimed: r.claimed, sent: r.sent });
  }

  return NextResponse.json({
    ran_at: now.toISOString(),
    decks_checked: snap.decks.length,
    fanouts: results.length,
    detail: results,
  });
}

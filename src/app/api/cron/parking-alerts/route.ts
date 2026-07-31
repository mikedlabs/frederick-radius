/**
 * Garage-full fanout cron — DORMANT until the live feed is wired.
 *
 * Pulls the live downtown-garage occupancy snapshot and pushes a "garage is
 * full" alert to subscribers on the `parking` topic whenever a deck crosses
 * the full threshold (see GARAGE_FULL_THRESHOLD). Dedupe is by deck + a coarse
 * time window via push_log, so a garage that stays full doesn't re-ping every
 * run — at most once per ~3-hour block per deck (≈ one alert per fill episode),
 * while still allowing a fresh alert for a separate evening fill.
 *
 * Gated three ways:
 *   - PARKING_OCCUPANCY_ENABLED != 1 → the feed is dormant (the default today;
 *     Frederick's live counts live in the ParkZen-powered Park Frederick app,
 *     which needs a licensed endpoint — see src/lib/integrations/parking-live).
 *   - VAPID not configured         → push can't send.
 *   - no decks full                → nothing to fan out.
 * A feed that was explicitly enabled but is missing, stale, malformed, or
 * unreachable returns 503. It must not look like a healthy zero-deck pull.
 *
 * Auth: same CRON_SECRET bearer as the other cron paths.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import {
  getParkingOccupancyResult,
  parkingFeedEnabled,
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

  if (!parkingFeedEnabled()) {
    return NextResponse.json({
      ok: true,
      status: "disabled",
      skipped: "PARKING_OCCUPANCY_ENABLED is not 1 (dormant)",
    });
  }
  if (!parkingFeedConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        reason: "missing-url",
        decks_checked: 0,
        fanouts: 0,
        detail: [],
      },
      { status: 503 },
    );
  }
  const occupancy = await getParkingOccupancyResult();
  if (occupancy.status === "unavailable") {
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        reason: occupancy.reason,
        checked_at: occupancy.checkedAt,
        decks_checked: 0,
        fanouts: 0,
        detail: [],
      },
      { status: 503 },
    );
  }
  const snap = occupancy.snapshot;
  // Feed health is checked before this delivery gate. Otherwise an enabled,
  // broken source looks green whenever push happens to be unconfigured.
  if (!configurePush()) {
    return NextResponse.json({ ok: true, skipped: "VAPID not configured" });
  }
  const nameBySlug = new Map(PARKING_GARAGES.map((g) => [g.slug, g.name]));

  // Coarse fill-window for the dedupe key: date + 3-hour block (UTC). One alert
  // per deck per block prevents minute-by-minute spam while a deck sits full.
  const now = new Date();
  const block = `${now.toISOString().slice(0, 10)}T${Math.floor(now.getUTCHours() / 3)}`;

  // Which matched garages currently have room — so the alert can suggest one.
  const withSpace = snap.decks
    .filter(
      (d) =>
        d.garageSlug &&
        !d.isClosed &&
        !d.isFull &&
        (d.available ?? 1) > 0,
    )
    .map((d) => nameBySlug.get(d.garageSlug!) ?? d.name);

  const results: Array<{ garage: string; percentFull: number | null; claimed: boolean; sent: number }> = [];
  for (const d of snap.decks) {
    if (d.isClosed || !d.isFull || !d.garageSlug) continue;
    const label = nameBySlug.get(d.garageSlug) ?? d.name;
    const detail =
      d.available !== null && d.available <= 0
        ? "is full"
        : d.percentFull !== null
          ? `is ${d.percentFull}% full`
          : "is nearly full";
    const suggestions = withSpace.slice(0, 2);
    const body = suggestions.length === 1
      ? `Try ${suggestions[0]}. It still has room.`
      : suggestions.length > 1
        ? `Try ${suggestions.join(" or ")}. Both still have room.`
        : "Check the other downtown garages for space.";

    const r = await fanoutToTopic("parking", `${d.garageSlug}:${block}`, {
      title: `${label} ${detail}`,
      body,
      url: "/parking",
      tag: `parking:${d.garageSlug}`,
    });
    results.push({ garage: d.garageSlug, percentFull: d.percentFull, claimed: r.claimed, sent: r.sent });
  }

  return NextResponse.json({
    ok: true,
    status: "ok",
    ran_at: now.toISOString(),
    source_as_of: snap.asOf,
    decks_checked: snap.decks.length,
    fanouts: results.length,
    detail: results,
  });
}

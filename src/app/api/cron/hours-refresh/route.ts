/**
 * Rolling hours refresh (data brief, Phase 1, section 4.3).
 *
 * Walks the Google-backed catalog on a 7 day cycle: each run handles the
 * slice of slugs whose hash lands on today's cycle day, which works out
 * to roughly 190 Place Details calls per day for the partner and curated
 * set. Field mask scoped to hours and business status only, so every
 * call stays on the cheapest applicable SKU.
 *
 * Results upsert into the place_hours_refresh table. The loader does not
 * read the table at request time (the place pipeline is synchronous);
 * npm run refresh:hours pulls the table into the committed
 * places-hours-refresh.json, matching the repo's existing refresh
 * pattern for business status. The freshness policy reads refreshed_at.
 *
 * PAID and OFF by default, same contract as the business-status cron:
 * no-ops unless HOURS_REFRESH_CRON is "1", requires the Google key and
 * a reachable database, and caps the batch to bound cost.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { PLACES } from "@/data/places";
import { getDb } from "@/lib/db/client";
import { placeHoursRefresh } from "@/lib/db/schema";
import {
  getPlaceDetails,
  googlePlacesConfigured,
} from "@/lib/integrations/google-places";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_CAP = 200;
const CYCLE_DAYS = 7;

/** Stable slug hash so each place lands on the same cycle day. */
function cycleDayOf(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) h = ((h * 33) ^ slug.charCodeAt(i)) | 0;
  return Math.abs(h) % CYCLE_DAYS;
}

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (process.env.HOURS_REFRESH_CRON !== "1") {
    return NextResponse.json({
      enabled: false,
      note: "Set HOURS_REFRESH_CRON=1 to enable. Off by default to avoid Google Places spend.",
    });
  }
  if (!googlePlacesConfigured()) {
    return NextResponse.json(
      { enabled: true, error: "GOOGLE_PLACES_API_KEY not set" },
      { status: 500 },
    );
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { enabled: true, error: "DATABASE_URL not set; the refresh has nowhere to persist" },
      { status: 503 },
    );
  }

  // Today's slice of the cycle. The discovery tail is excluded: scraped
  // rows render "Hours not posted" by policy, so refreshing them would
  // spend quota asserting nothing.
  const today = Math.floor(Date.now() / 86400000) % CYCLE_DAYS;
  const targets = PLACES.filter(
    (p) => p.google_place_id && p.source !== "discovered" && cycleDayOf(p.slug) === today,
  ).slice(0, BATCH_CAP);

  const refreshedAt = new Date();
  let written = 0;
  const failures: string[] = [];

  for (const p of targets) {
    const details = await getPlaceDetails(p.google_place_id as string, "hours");
    if (!details) {
      failures.push(p.slug);
      continue;
    }
    await db
      .insert(placeHoursRefresh)
      .values({
        slug: p.slug,
        placeId: p.google_place_id as string,
        weekdayHours: details.weekday_hours ?? null,
        businessStatus: details.business_status ?? null,
        refreshedAt,
      })
      .onConflictDoUpdate({
        target: placeHoursRefresh.slug,
        set: {
          weekdayHours: details.weekday_hours ?? null,
          businessStatus: details.business_status ?? null,
          refreshedAt,
        },
      });
    written++;
  }

  return NextResponse.json({
    enabled: true,
    cycleDay: today,
    targeted: targets.length,
    written,
    failed: failures.length,
    failures: failures.slice(0, 10),
    note: "Run npm run refresh:hours to pull the table into places-hours-refresh.json.",
  });
}

/**
 * Rolling hours refresh (data brief, Phase 1, section 4.3).
 *
 * Walks the Google-backed catalog on a 7 day cycle: each run handles the
 * slice of slugs whose hash lands on today's cycle day. Every canonical
 * record with a Google place ID participates, including the discovered
 * tail. Field mask scoped to hours and business status only, so every
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
import { placeRefreshIdentities } from "@/lib/loaders/placeRefreshIdentities";
import { getDb } from "@/lib/db/client";
import { placeHoursRefresh } from "@/lib/db/schema";
import {
  getPlaceDetails,
  googlePlacesConfigured,
} from "@/lib/integrations/google-places";
import {
  assessHoursRefreshRun,
  HOURS_REFRESH_CYCLE_DAYS,
  selectHoursRefreshTargets,
} from "@/lib/hours-refresh-targets";
import { isGooglePlaceId } from "@/lib/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Canonical pre-status targets are verified unique by Google ID before
// bucketing. Keep headroom so a deterministic slice can never strand the tail
// forever.
const BATCH_CAP = 400;
const CONCURRENCY = 5;

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

  // Verify the server-only table before making a single paid Google request.
  // Migration 0024 is manual by design; without this probe every Place Details
  // call could succeed, every insert could fail, and the old handler would
  // still return HTTP 200.
  try {
    await db
      .select({
        slug: placeHoursRefresh.slug,
        placeId: placeHoursRefresh.placeId,
        weekdayHours: placeHoursRefresh.weekdayHours,
        businessStatus: placeHoursRefresh.businessStatus,
        refreshedAt: placeHoursRefresh.refreshedAt,
      })
      .from(placeHoursRefresh)
      .limit(1);
  } catch {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        error:
          "Hours storage is unavailable. Apply drizzle/0024_place_hours_refresh.sql in Supabase and verify the server database role before enabling this paid cron.",
      },
      { status: 503 },
    );
  }

  // Today's slice of the cycle. This provider snapshot is deliberately
  // upstream of live status and season: a closed or off-season place remains
  // refreshable, which is how a later reopening is discovered. The cap still
  // provides a hard upper bound on paid calls.
  const today = Math.floor(Date.now() / 86400000) % HOURS_REFRESH_CYCLE_DAYS;
  const places = placeRefreshIdentities();
  const placesWithGoogleId = places.filter((place) =>
    Boolean(place.google_place_id),
  );
  const validGooglePlaces = places.filter((place) =>
    isGooglePlaceId(place.google_place_id),
  );
  const invalidGoogleIds =
    placesWithGoogleId.length - validGooglePlaces.length;
  let eligibleTargets: typeof validGooglePlaces;
  try {
    eligibleTargets = selectHoursRefreshTargets(
      validGooglePlaces,
      today,
      Number.MAX_SAFE_INTEGER,
    );
  } catch (error) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay: today,
        catalog: places.length,
        validGoogleIds: validGooglePlaces.length,
        invalidGoogleIds,
        error:
          error instanceof Error
            ? error.message
            : "Hours-refresh target identity validation failed.",
      },
      { status: 503 },
    );
  }
  const targets = eligibleTargets.slice(0, BATCH_CAP);
  const deferred = eligibleTargets.length - targets.length;

  // A deterministic bucket that exceeds the cap would strand the same tail on
  // every seven-day cycle. Stop before spending and make the capacity problem
  // explicit instead of pretending the partial batch is a rolling refresh.
  if (targets.length === 0 || deferred > 0) {
    const health = assessHoursRefreshRun({
      targeted: targets.length,
      written: 0,
      withHours: 0,
      deferred,
    });
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay: today,
        catalog: places.length,
        validGoogleIds: validGooglePlaces.length,
        invalidGoogleIds,
        eligible: eligibleTargets.length,
        targeted: targets.length,
        deferred,
        error: health.error,
      },
      { status: health.status },
    );
  }

  const refreshedAt = new Date();
  let written = 0;
  let withHours = 0;
  const failures: string[] = [];

  // A five-wide pool keeps a 300-second function from timing out on the full
  // discovered-inclusive slice without creating a burst large enough to be
  // rude to Google or the database.
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (p) => {
        try {
          const details = await getPlaceDetails(p.google_place_id as string, "hours");
          if (!details) return { ok: false, withHours: false };
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
                placeId: p.google_place_id as string,
                weekdayHours: details.weekday_hours ?? null,
                businessStatus: details.business_status ?? null,
                refreshedAt,
              },
            });
          return {
            ok: true,
            withHours: Boolean(details.weekday_hours?.length),
          };
        } catch {
          return { ok: false, withHours: false };
        }
      }),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome.ok) {
        written++;
        if (outcome.withHours) withHours++;
      }
      else failures.push(batch[index].slug);
    });
  }

  const health = assessHoursRefreshRun({
    targeted: targets.length,
    written,
    withHours,
    deferred,
  });
  return NextResponse.json(
    {
      enabled: true,
      healthy: health.healthy,
      cycleDay: today,
      catalog: places.length,
      validGoogleIds: validGooglePlaces.length,
      invalidGoogleIds,
      eligible: eligibleTargets.length,
      targeted: targets.length,
      written,
      withHours,
      failed: failures.length,
      failures: failures.slice(0, 10),
      ...(health.error ? { error: health.error } : {}),
      note: health.healthy
        ? "Run npm run refresh:hours to pull the table into places-hours-refresh.json."
        : "Check the Google Places key and the database write role before the next paid run.",
    },
    { status: health.status },
  );
}

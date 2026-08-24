/**
 * Rolling hours refresh (data brief, Phase 1, section 4.3).
 *
 * Walks the Google-backed catalog on a six-day cycle: each run handles the
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
 * An authenticated operator may add ?cycleDay=0..5 to recover one missed
 * bucket without weakening the paid-call cap or the freshness policy.
 *
 * PAID and OFF by default, same contract as the business-status cron:
 * no-ops unless HOURS_REFRESH_CRON is "1", requires the Google key and
 * a reachable database, and shares one atomic Eastern-day allowance across
 * scheduled runs, retries, and authenticated cycleDay backfills.
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
  resolveHoursRefreshCycleSelection,
  selectHoursRefreshTargets,
} from "@/lib/hours-refresh-targets";
import { isGooglePlaceId } from "@/lib/provenance";
import { monitorCronResponse } from "@/lib/observability/cron-monitor";
import { reserveDailyUsage } from "@/lib/usage-meter";
import { googleHoursRefreshDailyCap } from "@/lib/google-hours-refresh-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Canonical pre-status targets are verified unique by Google ID before
// bucketing. Keep headroom so a deterministic slice can never strand the tail
// forever.
const BATCH_CAP = 400;
const CONCURRENCY = 6;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  return monitorCronResponse(
    "hours-refresh",
    {
      schedule: "0 8 * * *",
      checkinMarginMinutes: 10,
      maxRuntimeMinutes: 6,
    },
    () => runHoursRefresh(request),
  );
}

async function runHoursRefresh(request: Request) {
  if (process.env.HOURS_REFRESH_CRON !== "1") {
    return NextResponse.json({
      enabled: false,
      note: "Set HOURS_REFRESH_CRON=1 to enable. Off by default to avoid Google Places spend.",
    });
  }
  let cycle: ReturnType<typeof resolveHoursRefreshCycleSelection>;
  try {
    cycle = resolveHoursRefreshCycleSelection(request.url);
  } catch (error) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        error:
          error instanceof Error
            ? error.message
            : `cycleDay must be 0-${HOURS_REFRESH_CYCLE_DAYS - 1}`,
      },
      { status: 400 },
    );
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
  const today = cycle.cycleDay;
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
        cycleMode: cycle.mode,
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
  const dailyCap = googleHoursRefreshDailyCap();

  // A deterministic cycle bucket must fit inside the shared daily allowance
  // before we reserve even one call. Otherwise every run would refresh the
  // same prefix, exhaust the allowance, and strand the same tail forever.
  // This preflight also makes a too-low environment override loud and free.
  if (eligibleTargets.length > dailyCap) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay: today,
        cycleMode: cycle.mode,
        catalog: places.length,
        validGoogleIds: validGooglePlaces.length,
        invalidGoogleIds,
        eligible: eligibleTargets.length,
        targeted: 0,
        paidAttempts: 0,
        written: 0,
        withHours: 0,
        budgetExhausted: false,
        dailyCap,
        error:
          `This deterministic hours bucket has ${eligibleTargets.length} targets, ` +
          `but GOOGLE_HOURS_REFRESH_DAILY_CAP resolves to ${dailyCap}. ` +
          "Raise the cap to fit the whole bucket before retrying; no paid calls were made.",
      },
      { status: 503 },
    );
  }

  const targets = eligibleTargets.slice(0, BATCH_CAP);
  const deferred = eligibleTargets.length - targets.length;

  // A deterministic bucket that exceeds the cap would strand the same tail on
  // every six-day cycle. Stop before spending and make the capacity problem
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
        cycleMode: cycle.mode,
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
  let paidAttempts = 0;
  let budgetExhausted = false;
  let usageMeterUnavailable = false;
  const failures: string[] = [];

  // A six-wide pool keeps a 300-second function from timing out on the full
  // discovered-inclusive slice without creating a burst large enough to be
  // rude to Google or the database.
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (p) => {
        // The per-run target cap does not protect against a replay, retry, or
        // authenticated cycleDay backfill. Reserve each provider attempt from
        // one atomic Eastern-day counter before calling Google. Counter
        // uncertainty fails closed so a database incident cannot reopen spend.
        const reservation = await reserveDailyUsage(
          "budget_google_hours_refresh",
          dailyCap,
        );
        if (!reservation) {
          return {
            ok: false,
            withHours: false,
            budget: "unavailable" as const,
          };
        }
        if (!reservation.reserved) {
          return {
            ok: false,
            withHours: false,
            budget: "exhausted" as const,
          };
        }
        try {
          const details = await getPlaceDetails(p.google_place_id as string, "hours");
          if (!details) {
            return {
              ok: false,
              withHours: false,
              budget: "reserved" as const,
            };
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
                placeId: p.google_place_id as string,
                weekdayHours: details.weekday_hours ?? null,
                businessStatus: details.business_status ?? null,
                refreshedAt,
              },
            });
          return {
            ok: true,
            withHours: Boolean(details.weekday_hours?.length),
            budget: "reserved" as const,
          };
        } catch {
          return {
            ok: false,
            withHours: false,
            budget: "reserved" as const,
          };
        }
      }),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome.budget === "unavailable") {
        usageMeterUnavailable = true;
        return;
      }
      if (outcome.budget === "exhausted") {
        budgetExhausted = true;
        return;
      }
      paidAttempts++;
      if (outcome.ok) {
        written++;
        if (outcome.withHours) withHours++;
      }
      else failures.push(batch[index].slug);
    });
    if (usageMeterUnavailable || budgetExhausted) break;
  }

  if (usageMeterUnavailable) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay: today,
        cycleMode: cycle.mode,
        catalog: places.length,
        validGoogleIds: validGooglePlaces.length,
        invalidGoogleIds,
        eligible: eligibleTargets.length,
        targeted: targets.length,
        paidAttempts,
        written,
        withHours,
        budgetExhausted: false,
        dailyCap,
        error:
          "The shared hours-refresh usage counter is unavailable for one or more targets; no Google call ran without an atomic reservation.",
      },
      { status: 503 },
    );
  }

  const health = assessHoursRefreshRun({
    targeted: targets.length,
    written,
    withHours,
    deferred,
  });
  const healthy = !budgetExhausted && health.healthy;
  const status = budgetExhausted ? 503 : health.status;
  return NextResponse.json(
    {
      enabled: true,
      healthy,
      cycleDay: today,
      cycleMode: cycle.mode,
      catalog: places.length,
      validGoogleIds: validGooglePlaces.length,
      invalidGoogleIds,
      eligible: eligibleTargets.length,
      targeted: targets.length,
      paidAttempts,
      written,
      withHours,
      budgetExhausted,
      dailyCap,
      notAttempted: Math.max(0, targets.length - paidAttempts),
      failed: failures.length,
      failures: failures.slice(0, 10),
      ...(budgetExhausted
        ? {
            error:
              `The shared Eastern-day Google hours allowance reached ${dailyCap}; ` +
              "retries and cycleDay replays remain blocked until the next Eastern day.",
          }
        : health.error
          ? { error: health.error }
          : {}),
      note: budgetExhausted
        ? "The daily spend guard held. Wait for the next Eastern day instead of replaying this paid bucket."
        : health.healthy
          ? cycle.mode === "backfill"
            ? "Backfill bucket persisted. Run npm run refresh:hours to materialize it into places-hours-refresh.json."
            : "Run npm run refresh:hours to pull the table into places-hours-refresh.json."
          : "Check the Google Places key and the database write role before the next paid run.",
    },
    { status },
  );
}

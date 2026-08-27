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
 * no-ops unless HOURS_REFRESH_CRON is "1", requires reviewed Google policy
 * approval, the platform runtime switch, a dedicated Places key, and a
 * writable database. One atomic Eastern-day allowance and one global run lease
 * cover scheduled runs, retries, and authenticated cycleDay backfills.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyCronAuth } from "../../ingest/_auth";
import { placeRefreshIdentities } from "@/lib/loaders/placeRefreshIdentities";
import { getDb, getSql } from "@/lib/db/client";
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
import {
  finalizeIdempotentDailyUsage,
  reserveIdempotentDailyUsageBatch,
  reserveUsageIntervalLease,
  startIdempotentDailyUsage,
} from "@/lib/usage-meter";
import { googleHoursRefreshDailyCap } from "@/lib/google-hours-refresh-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Canonical pre-status targets are verified unique by Google ID before
// bucketing. Keep headroom so a deterministic slice can never strand the tail
// forever.
const BATCH_CAP = 400;
const CONCURRENCY = 6;
// The route itself can run for at most five minutes. The lease stores whole
// expiry minutes, so seven minutes guarantees at least six minutes of
// ownership while still allowing a failed run to be retried shortly after.
// One namespace covers every cycleDay because every run spends from the same
// Eastern-day allowance; independent bucket leases could split that allowance
// and leave two deterministic buckets partially refreshed.
const RUN_LEASE_MS = 7 * 60 * 1_000;
const RUN_LEASE_NAMESPACE = "hours_refresh_run" as const;

class HoursStorageProbeRollback extends Error {}

type RawSql = NonNullable<ReturnType<typeof getSql>>;

/**
 * Exercise the exact write capabilities this cron needs before a provider call.
 * The unique sentinel is inserted, updated, and deleted inside one transaction,
 * then an intentional error rolls the whole probe back. This catches a missing
 * table, a read-only database role, and effective RLS denial without leaving a
 * durable row or trusting catalog metadata alone.
 */
async function hoursStorageWriteReady(rawSql: RawSql): Promise<boolean> {
  const probeSlug = `__radius_hours_refresh_probe__:${randomUUID()}`;
  let completed = false;
  try {
    await rawSql.begin(async (tx) => {
      const inserted = await tx<Array<{ ok: number | string }>>`
        insert into public.place_hours_refresh (
          slug,
          place_id,
          weekday_hours,
          business_status,
          refreshed_at
        ) values (
          ${probeSlug},
          'radius-hours-storage-probe',
          null,
          'UNKNOWN',
          now()
        )
        returning 1 as ok
      `;
      const updated = await tx<Array<{ ok: number | string }>>`
        update public.place_hours_refresh
        set refreshed_at = now()
        where slug = ${probeSlug}
        returning 1 as ok
      `;
      const deleted = await tx<Array<{ ok: number | string }>>`
        delete from public.place_hours_refresh
        where slug = ${probeSlug}
        returning 1 as ok
      `;
      if (
        inserted.length !== 1 ||
        updated.length !== 1 ||
        deleted.length !== 1
      ) {
        throw new Error("hours storage write capability is incomplete");
      }
      completed = true;
      throw new HoursStorageProbeRollback();
    });
  } catch (error) {
    return completed && error instanceof HoursStorageProbeRollback;
  }
  return false;
}

async function refreshedTodayIdentities(
  rawSql: RawSql,
): Promise<Set<string> | null> {
  try {
    const rows = await rawSql<Array<{ slug: string; place_id: string }>>`
      select slug, place_id
      from public.place_hours_refresh
      where refreshed_at >= (
        (now() at time zone 'America/New_York')::date
        at time zone 'America/New_York'
      )
        and refreshed_at < (
          ((now() at time zone 'America/New_York')::date + 1)
          at time zone 'America/New_York'
        )
    `;
    return new Set(rows.map((row) => `${row.slug}\u0000${row.place_id}`));
  } catch {
    return null;
  }
}

function refreshIdentity(slug: string, placeId: string): string {
  return `${slug}\u0000${placeId}`;
}

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
      {
        enabled: true,
        error:
          "Google Places runtime is on policy hold or its dedicated credential is missing",
      },
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
  const rawSql = getSql();
  if (!rawSql) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        error:
          "Hours storage cannot be verified because the server database client is unavailable; no paid work was allowed.",
      },
      { status: 503 },
    );
  }

  // Migration 0024 is manual by design. A SELECT-only probe is insufficient:
  // a read-only or RLS-constrained role could pass it, spend the entire Google
  // allowance, and fail every upsert. Exercise INSERT, UPDATE, and DELETE in a
  // rolled-back transaction before taking a run lease or reserving one call.
  if (!(await hoursStorageWriteReady(rawSql))) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        error:
          "Hours storage is not writable. Apply drizzle/0024_place_hours_refresh.sql in Supabase and verify effective INSERT, UPDATE, DELETE, and RLS-bypass capability for the server database role before enabling this paid cron. No lease, reservation, or Google call was allowed.",
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

  const bucketTargets = eligibleTargets.slice(0, BATCH_CAP);
  const deferred = eligibleTargets.length - bucketTargets.length;

  // A deterministic bucket that exceeds the cap would strand the same tail on
  // every six-day cycle. Stop before spending and make the capacity problem
  // explicit instead of pretending the partial batch is a rolling refresh.
  if (bucketTargets.length === 0 || deferred > 0) {
    const health = assessHoursRefreshRun({
      targeted: bucketTargets.length,
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
        targeted: bucketTargets.length,
        deferred,
        error: health.error,
      },
      { status: health.status },
    );
  }

  // A failed invocation may be retried after its lease expires. Read durable
  // progress from the hours table and skip only rows whose accepted provider
  // identity was already persisted during this Eastern day. Identity binding
  // prevents a corrected Place ID from inheriting stale completion state.
  const refreshedToday = await refreshedTodayIdentities(rawSql);
  if (!refreshedToday) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay: today,
        cycleMode: cycle.mode,
        eligible: eligibleTargets.length,
        targeted: 0,
        paidAttempts: 0,
        error:
          "Same-day hours-refresh progress could not be read; no lease, reservation, or Google call was allowed.",
      },
      { status: 503 },
    );
  }
  const targets = bucketTargets.filter(
    (target) =>
      !refreshedToday.has(
        refreshIdentity(target.slug, target.google_place_id as string),
      ),
  );
  const alreadyRefreshed = bucketTargets.length - targets.length;
  if (targets.length === 0) {
    return NextResponse.json({
      enabled: true,
      healthy: true,
      cycleDay: today,
      cycleMode: cycle.mode,
      catalog: places.length,
      validGoogleIds: validGooglePlaces.length,
      invalidGoogleIds,
      eligible: eligibleTargets.length,
      targeted: 0,
      alreadyRefreshed,
      paidAttempts: 0,
      written: 0,
      withHours: 0,
      budgetExhausted: false,
      dailyCap,
      runLease: "not-needed",
      note:
        "Every place in this deterministic bucket was already persisted today; no paid reservation or Google call was repeated.",
    });
  }

  // Own the one shared hours-refresh spend path before reserving a single paid
  // call. Scheduled runs and every cycleDay backfill use this same namespace,
  // so two buckets cannot split the common Eastern-day allowance. Expiry—not
  // process memory—allows a later retry after a crashed invocation.
  const runLease = await reserveUsageIntervalLease(
    RUN_LEASE_NAMESPACE,
    RUN_LEASE_MS,
  );
  if (!runLease) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay: today,
        cycleMode: cycle.mode,
        eligible: eligibleTargets.length,
        targeted: 0,
        alreadyRefreshed,
        paidAttempts: 0,
        runLease: "unavailable",
        error:
          "The hours-refresh run lease is unavailable; no paid reservation or Google call was allowed.",
      },
      { status: 503 },
    );
  }
  if (!runLease.acquired) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay: today,
        cycleMode: cycle.mode,
        eligible: eligibleTargets.length,
        targeted: 0,
        alreadyRefreshed,
        paidAttempts: 0,
        runLease: "held",
        error:
          "Another hours-refresh bucket is already running. Retry after the short ownership lease expires.",
      },
      { status: 409 },
    );
  }

  const refreshedAt = new Date();
  let written = 0;
  let withHours = 0;
  let paidAttempts = 0;
  const failures: string[] = [];
  let claimStateFailures = 0;

  // Reserve the entire unfinished deterministic bucket and one hashed target
  // claim per row in the same transaction. A first run may die after this
  // pre-reservation but before reaching the tail. The durable `ready` claims
  // let a retry continue that untouched tail without incrementing the daily
  // counter again. Once a target becomes `pending`, it is never bought again
  // that Eastern day because the worker may already have reached Google.
  const targetClaimIds = targets.map((target) =>
    refreshIdentity(target.slug, target.google_place_id as string),
  );
  const bucketReservation = await reserveIdempotentDailyUsageBatch(
    "budget_google_hours_refresh",
    dailyCap,
    targetClaimIds,
  );
  if (!bucketReservation) {
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
        alreadyRefreshed,
        paidAttempts: 0,
        written: 0,
        withHours: 0,
        budgetExhausted: false,
        dailyCap,
        runLease: "acquired",
        reservationsAdded: 0,
        reservationsReused: 0,
        notAttempted: targets.length,
        error:
          "The shared hours-refresh usage counter is unavailable; the entire remaining bucket was left untouched and no Google call was allowed.",
      },
      { status: 503 },
    );
  }
  if (!bucketReservation.reserved) {
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
        alreadyRefreshed,
        paidAttempts: 0,
        written: 0,
        withHours: 0,
        budgetExhausted: true,
        dailyCap,
        runLease: "acquired",
        reservationsAdded: 0,
        reservationsReused: 0,
        notAttempted: targets.length,
        error:
          `The shared Eastern-day Google hours allowance cannot fit all ${targets.length} remaining targets under the ${dailyCap}-call cap; ` +
          "the bucket was not partially consumed.",
        note:
          "Wait for the next Eastern day instead of replaying a partial paid bucket.",
      },
      { status: 503 },
    );
  }

  const work = targets
    .map((target, index) => ({
      target,
      claimId: targetClaimIds[index],
      state: bucketReservation.states[index],
    }))
    .filter((entry) => {
      if (entry.state === "ready") return true;
      failures.push(entry.target.slug);
      return false;
    });
  const blockedClaims = targets.length - work.length;
  const reservationsReused = Math.max(
    0,
    work.length - bucketReservation.added,
  );

  // A six-wide pool keeps a 300-second function from timing out on the full
  // discovered-inclusive slice without creating a burst large enough to be
  // rude to Google or the database.
  for (let i = 0; i < work.length; i += CONCURRENCY) {
    const batch = work.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async ({ target: p, claimId }) => {
        const started = await startIdempotentDailyUsage(
          "budget_google_hours_refresh",
          claimId,
        );
        if (!started?.started) {
          return {
            attempted: false,
            persisted: false,
            withHours: false,
            claimFinalized: false,
          };
        }
        try {
          const details = await getPlaceDetails(p.google_place_id as string, "hours");
          if (!details) {
            const finalized = await finalizeIdempotentDailyUsage(
              "budget_google_hours_refresh",
              claimId,
              "failed",
            );
            return {
              attempted: true,
              persisted: false,
              withHours: false,
              claimFinalized: Boolean(finalized?.finalized),
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
          const finalized = await finalizeIdempotentDailyUsage(
            "budget_google_hours_refresh",
            claimId,
            "succeeded",
          );
          return {
            attempted: true,
            persisted: true,
            withHours: Boolean(details.weekday_hours?.length),
            claimFinalized: Boolean(finalized?.finalized),
          };
        } catch {
          const finalized = await finalizeIdempotentDailyUsage(
            "budget_google_hours_refresh",
            claimId,
            "failed",
          );
          return {
            attempted: true,
            persisted: false,
            withHours: false,
            claimFinalized: Boolean(finalized?.finalized),
          };
        }
      }),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome.attempted) paidAttempts++;
      if (outcome.persisted) {
        written++;
        if (outcome.withHours) withHours++;
      }
      else failures.push(batch[index].target.slug);
      if (!outcome.claimFinalized) claimStateFailures++;
    });
  }

  const health = assessHoursRefreshRun({
    targeted: targets.length,
    written,
    withHours,
    deferred,
  });
  const healthy = health.healthy && claimStateFailures === 0;
  const status = healthy ? 200 : 503;
  const error = claimStateFailures > 0
    ? `${claimStateFailures} hours-refresh claim${claimStateFailures === 1 ? "" : "s"} could not reach a durable terminal state.`
    : health.error;
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
      alreadyRefreshed,
      paidAttempts,
      written,
      withHours,
      budgetExhausted: false,
      runLease: "acquired",
      dailyCap,
      reservationsAdded: bucketReservation.added,
      reservationsReused,
      blockedClaims,
      claimStateFailures,
      notAttempted: Math.max(0, targets.length - paidAttempts),
      failed: failures.length,
      failures: failures.slice(0, 10),
      ...(error ? { error } : {}),
      note: healthy
          ? cycle.mode === "backfill"
            ? "Backfill bucket persisted. Run npm run refresh:hours to materialize it into places-hours-refresh.json."
            : "Run npm run refresh:hours to pull the table into places-hours-refresh.json."
          : blockedClaims > 0
            ? "A same-day retry resumed only pre-reserved targets that had not started. Uncertain or failed claims remain closed until the next Eastern day."
            : "Check the Google Places key, claim ledger, and database write role before the next paid run.",
    },
    { status },
  );
}

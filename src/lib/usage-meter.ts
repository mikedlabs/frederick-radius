import { getSql } from "@/lib/db/client";
import { createHash } from "node:crypto";

/**
 * usage-meter — the app's own tally of calls to the PAID upstreams, so
 * /admin/costs can answer "what is incurring cost" from our side instead of
 * waiting for a provider invoice. One row per (Eastern day, upstream) in
 * usage_counters, incremented beside each validated paid fetch attempt.
 * Cache-aware call sites put the meter inside their cache-miss function so a
 * reused result does not increment the tally.
 *
 * Fire-and-forget and fail-soft by contract: metering must never slow or
 * break a product request. No DB configured, table not migrated, or a
 * transient error all silently no-op. Counts are an UPPER BOUND on billable
 * calls because a provider can still reject or fail a request after receiving
 * it, and a few older call sites rely on platform fetch caching that is not
 * observable here. Provider consoles remain the billing source of truth.
 */
export type PaidUpstream =
  | "google_photo"
  | "google_event_geocode"
  | "ask_model_call"
  | "ask_embedding"
  | "radius_search_embedding"
  /** Legacy completion meter retained so historical rows remain readable. */
  | "anthropic_ask"
  | "mapbox_geocode"
  | "mapbox_directions"
  | "mapbox_matrix"
  | "mapbox_isochrone"
  | "mapbox_search_box"
  | "mapbox_static"
  | "google_routes_matrix"
  | "firecrawl_visit_frederick";

export type UsageReservation = {
  reserved: boolean;
  count: number;
};

export type IdempotentUsageReservation = UsageReservation & {
  /** Another worker already reserved this exact operation today. */
  duplicate: boolean;
  /** Durable outcome of the earlier claim. Older claims are `pending`, which
   * is the safe interpretation because their provider outcome was never
   * recorded. Present only when `duplicate` is true. */
  duplicateState?: IdempotentUsageClaimState;
};

export type IdempotentUsageClaimState =
  | "ready"
  | "pending"
  | "succeeded"
  | "failed";

export type IdempotentUsageClaimOutcome = "succeeded" | "failed";

export type IdempotentUsageClaimFinalization = {
  finalized: boolean;
  state: IdempotentUsageClaimState;
};

export type IdempotentUsageClaimStart = {
  started: boolean;
  state: IdempotentUsageClaimState;
};

export type IdempotentUsageBatchReservation = UsageReservation & {
  /** The whole requested set fit under the shared cap. */
  reserved: boolean;
  /** New daily units added during this transaction. Existing ready claims do
   * not add spend again when a crashed batch resumes. */
  added: number;
  /** One durable state per input value, in the same order. */
  states: IdempotentUsageClaimState[];
};

/** Internal guardrail rows share the atomic counter table but are not provider
 * SKUs. These namespaces only prevent public and scheduled routes from
 * spending without a shared daily boundary. */
export type UsageBudgetNamespace =
  | PaidUpstream
  | "budget_google_place_enrich_basic"
  | "budget_google_place_enrich_experience"
  | "budget_google_business_status"
  | "budget_google_hours_refresh";

export type UsageIntervalLease = {
  acquired: boolean;
};

export type UsageIntervalLeaseNamespace =
  | "visit_frederick_refresh"
  | "hours_refresh_run";

const CLAIM_READY = 0;
const CLAIM_PENDING = 1;
const CLAIM_SUCCEEDED = 2;
const CLAIM_FAILED = 3;

function normalizedIdempotencyValue(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 2_048
    ? normalized
    : null;
}

function idempotencyClaimNamespace(
  upstream: UsageBudgetNamespace,
  value: string,
): string {
  const digest = createHash("sha256").update(value).digest("hex");
  return `idempotency:${upstream}:${digest}`;
}

function claimState(value: number | string | null | undefined): IdempotentUsageClaimState | null {
  const count = Number(value);
  switch (count) {
    case CLAIM_READY:
      return "ready";
    case CLAIM_PENDING:
      return "pending";
    case CLAIM_SUCCEEDED:
      return "succeeded";
    case CLAIM_FAILED:
      return "failed";
    default:
      return null;
  }
}

/**
 * Own one sliding refresh interval across concurrent serverless workers.
 *
 * The stable sentinel row stores an expiry minute, not a billable count.
 * PostgreSQL's clock and one conditional UPSERT make acquisition atomic even
 * when deliveries straddle a wall-clock bucket. It is deliberately
 * fail-closed: without the database, a scheduled worker keeps the last
 * durable snapshot rather than racing another fetch.
 */
export async function reserveUsageIntervalLease(
  namespace: UsageIntervalLeaseNamespace,
  intervalMs: number,
): Promise<UsageIntervalLease | null> {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 60_000
  ) {
    return null;
  }
  const leaseKey = `lease:${namespace}`;
  try {
    const sql = getSql();
    if (!sql) return null;
    const rows = await sql<Array<{ count: number | string }>>`
      insert into usage_counters (day, upstream, count)
      values (
        date '1970-01-01',
        ${leaseKey},
        floor(
          extract(
            epoch from (
              now() + (${intervalMs} * interval '1 millisecond')
            )
          ) / 60
        )::integer
      )
      on conflict (day, upstream)
      do update set count = excluded.count
      where usage_counters.count <=
        floor(extract(epoch from now()) / 60)::integer
      returning count
    `;
    return { acquired: rows.length > 0 };
  } catch {
    return null;
  }
}

/**
 * Atomically reserve one or more billable units under a hard daily ceiling.
 *
 * Unlike best-effort metering, this fails closed: a caller must not spend when
 * the database is unavailable, the counter table is missing, or the cap is
 * already exhausted. The INSERT ... ON CONFLICT predicate makes concurrent
 * serverless workers share one real limit instead of racing process memory.
 * The optional increment is for element-priced products such as route
 * matrices; the whole increment is accepted or rejected in one statement.
 */
export async function reserveDailyUsage(
  upstream: UsageBudgetNamespace,
  limit: number,
  increment = 1,
): Promise<UsageReservation | null> {
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    !Number.isSafeInteger(increment) ||
    increment <= 0
  ) return null;
  if (increment > limit) return { reserved: false, count: limit };
  try {
    const sql = getSql();
    if (!sql) return null;
    const rows = await sql<Array<{ count: number | string }>>`
      insert into usage_counters (day, upstream, count)
      values (
        (now() at time zone 'America/New_York')::date,
        ${upstream},
        ${increment}
      )
      on conflict (day, upstream)
      do update set count = usage_counters.count + ${increment}
      where usage_counters.count + ${increment} <= ${limit}
      returning count
    `;
    const count = Number(rows[0]?.count);
    return rows.length > 0 && Number.isSafeInteger(count) && count >= 0
      ? { reserved: true, count }
      : { reserved: false, count: limit };
  } catch {
    return null;
  }
}

/**
 * Atomically reserve one unique paid operation under a shared daily ceiling.
 *
 * The idempotency value is hashed before storage so addresses and source facts
 * never become visible in the usage ledger. One transaction locks this
 * upstream's Eastern-day ledger, rejects a prior claim, then increments the
 * aggregate counter and records the claim together. Duplicate claims fail
 * closed because the first worker may still be waiting on the provider and
 * has not necessarily populated its durable cache yet.
 */
export async function reserveIdempotentDailyUsage(
  upstream: UsageBudgetNamespace,
  limit: number,
  idempotencyValue: string,
): Promise<IdempotentUsageReservation | null> {
  if (!Number.isSafeInteger(limit) || limit < 0) return null;
  if (limit === 0) {
    return { reserved: false, count: 0, duplicate: false };
  }
  const normalized = normalizedIdempotencyValue(idempotencyValue);
  if (!normalized) return null;
  const claimNamespace = idempotencyClaimNamespace(upstream, normalized);
  const lockNamespace = `daily-cap:${upstream}`;

  try {
    const sql = getSql();
    if (!sql) return null;
    return await sql.begin(async (tx) => {
      await tx`
        select pg_advisory_xact_lock(hashtextextended(${lockNamespace}, 0))
      `;
      const [ledger] = await tx<
        Array<{
          claim_state: number | string | null;
          count: number | string;
        }>
      >`
        select
          (
            select count from usage_counters
            where day = (now() at time zone 'America/New_York')::date
              and upstream = ${claimNamespace}
          ) as claim_state,
          coalesce((
            select count from usage_counters
            where day = (now() at time zone 'America/New_York')::date
              and upstream = ${upstream}
          ), 0) as count
      `;
      const currentCount = Number(ledger?.count);
      if (
        !ledger ||
        !Number.isSafeInteger(currentCount) ||
        currentCount < 0
      ) {
        throw new Error("invalid usage ledger");
      }
      if (ledger.claim_state !== null) {
        const duplicateState = claimState(ledger.claim_state);
        if (!duplicateState) throw new Error("invalid idempotency claim state");
        return {
          reserved: false,
          count: currentCount,
          duplicate: true,
          duplicateState,
        };
      }

      const rows = await tx<Array<{ count: number | string }>>`
        insert into usage_counters (day, upstream, count)
        values ((now() at time zone 'America/New_York')::date, ${upstream}, 1)
        on conflict (day, upstream)
        do update set count = usage_counters.count + 1
        where usage_counters.count < ${limit}
        returning count
      `;
      const count = Number(rows[0]?.count);
      if (rows.length === 0) {
        return { reserved: false, count: currentCount, duplicate: false };
      }
      if (!Number.isSafeInteger(count) || count < 1 || count > limit) {
        throw new Error("invalid usage reservation");
      }
      await tx`
        insert into usage_counters (day, upstream, count)
        values (
          (now() at time zone 'America/New_York')::date,
          ${claimNamespace},
          ${CLAIM_PENDING}
        )
      `;
      return { reserved: true, count, duplicate: false };
    });
  } catch {
    return null;
  }
}

/**
 * Record the durable outcome of an idempotent paid attempt.
 *
 * A provider call is always claimed before it starts. If the worker later
 * crashes, the claim remains `pending`; a retry will report that uncertainty
 * instead of buying the same call again. Finalization is idempotent for the
 * same outcome and refuses to overwrite a conflicting terminal state.
 */
export async function finalizeIdempotentDailyUsage(
  upstream: UsageBudgetNamespace,
  idempotencyValue: string,
  outcome: IdempotentUsageClaimOutcome,
): Promise<IdempotentUsageClaimFinalization | null> {
  const normalized = normalizedIdempotencyValue(idempotencyValue);
  if (!normalized) return null;
  const claimNamespace = idempotencyClaimNamespace(upstream, normalized);
  const terminalCount = outcome === "succeeded" ? CLAIM_SUCCEEDED : CLAIM_FAILED;

  try {
    const sql = getSql();
    if (!sql) return null;
    const updated = await sql<Array<{ count: number | string }>>`
      update usage_counters
      set count = ${terminalCount}
      where day = (now() at time zone 'America/New_York')::date
        and upstream = ${claimNamespace}
        and count = ${CLAIM_PENDING}
      returning count
    `;
    if (updated.length > 0) {
      return { finalized: true, state: outcome };
    }
    const [existing] = await sql<Array<{ count: number | string }>>`
      select count
      from usage_counters
      where day = (now() at time zone 'America/New_York')::date
        and upstream = ${claimNamespace}
    `;
    const state = claimState(existing?.count);
    return state ? { finalized: state === outcome, state } : null;
  } catch {
    return null;
  }
}

/**
 * Atomically reserve a complete set of unique daily operations.
 *
 * New items increment the shared cap and receive a `ready` claim in the same
 * transaction. A retry reuses those ready claims without incrementing again,
 * so a worker that times out after reserving a large batch can continue the
 * unstarted tail. `pending` and terminal claims are never re-run that day.
 */
export async function reserveIdempotentDailyUsageBatch(
  upstream: UsageBudgetNamespace,
  limit: number,
  idempotencyValues: readonly string[],
): Promise<IdempotentUsageBatchReservation | null> {
  if (!Number.isSafeInteger(limit) || limit <= 0) return null;
  if (idempotencyValues.length === 0 || idempotencyValues.length > limit) {
    return idempotencyValues.length === 0
      ? { reserved: true, count: 0, added: 0, states: [] }
      : { reserved: false, count: limit, added: 0, states: [] };
  }

  const normalized = idempotencyValues.map(normalizedIdempotencyValue);
  if (normalized.some((value) => value === null)) return null;
  const claimNamespaces = normalized.map((value) =>
    idempotencyClaimNamespace(upstream, value as string),
  );
  if (new Set(claimNamespaces).size !== claimNamespaces.length) return null;
  const requested = claimNamespaces.map((claimNamespace, ordinal) => ({
    ordinal,
    claim_namespace: claimNamespace,
  }));
  const requestedJson = JSON.stringify(requested);
  const lockNamespace = `daily-cap:${upstream}`;

  try {
    const sql = getSql();
    if (!sql) return null;
    return await sql.begin(async (tx) => {
      await tx`
        select pg_advisory_xact_lock(hashtextextended(${lockNamespace}, 0))
      `;
      const rows = await tx<
        Array<{
          ordinal: number | string;
          claim_state: number | string | null;
          aggregate_count: number | string;
        }>
      >`
        with requested as (
          select ordinal, claim_namespace
          from jsonb_to_recordset(${requestedJson}::jsonb)
            as item(ordinal integer, claim_namespace text)
        )
        select
          requested.ordinal,
          claim.count as claim_state,
          coalesce(aggregate.count, 0) as aggregate_count
        from requested
        left join usage_counters claim
          on claim.day = (now() at time zone 'America/New_York')::date
          and claim.upstream = requested.claim_namespace
        left join usage_counters aggregate
          on aggregate.day = (now() at time zone 'America/New_York')::date
          and aggregate.upstream = ${upstream}
        order by requested.ordinal
      `;
      if (rows.length !== requested.length) {
        throw new Error("incomplete idempotency batch ledger");
      }
      const ordered = [...rows].sort(
        (a, b) => Number(a.ordinal) - Number(b.ordinal),
      );
      if (ordered.some((row, index) => Number(row.ordinal) !== index)) {
        throw new Error("invalid idempotency batch ordering");
      }
      const currentCount = Number(ordered[0]?.aggregate_count);
      if (
        !Number.isSafeInteger(currentCount) ||
        currentCount < 0 ||
        ordered.some((row) => Number(row.aggregate_count) !== currentCount)
      ) {
        throw new Error("invalid idempotency batch counter");
      }

      const states = ordered.map((row) =>
        row.claim_state === null ? "ready" : claimState(row.claim_state),
      );
      if (states.some((state) => state === null)) {
        throw new Error("invalid idempotency batch claim state");
      }
      const missing = ordered
        .filter((row) => row.claim_state === null)
        .map((row) => requested[Number(row.ordinal)]);
      if (currentCount + missing.length > limit) {
        return {
          reserved: false,
          count: currentCount,
          added: 0,
          states: states as IdempotentUsageClaimState[],
        };
      }

      let count = currentCount;
      if (missing.length > 0) {
        const aggregateRows = await tx<Array<{ count: number | string }>>`
          insert into usage_counters (day, upstream, count)
          values (
            (now() at time zone 'America/New_York')::date,
            ${upstream},
            ${missing.length}
          )
          on conflict (day, upstream)
          do update set count = usage_counters.count + ${missing.length}
          where usage_counters.count + ${missing.length} <= ${limit}
          returning count
        `;
        count = Number(aggregateRows[0]?.count);
        if (
          aggregateRows.length !== 1 ||
          !Number.isSafeInteger(count) ||
          count < 1 ||
          count > limit
        ) {
          throw new Error("idempotency batch reservation lost its daily cap");
        }

        const missingJson = JSON.stringify(missing);
        const inserted = await tx<Array<{ upstream: string }>>`
          insert into usage_counters (day, upstream, count)
          select
            (now() at time zone 'America/New_York')::date,
            item.claim_namespace,
            ${CLAIM_READY}
          from jsonb_to_recordset(${missingJson}::jsonb)
            as item(ordinal integer, claim_namespace text)
          on conflict (day, upstream) do nothing
          returning upstream
        `;
        if (inserted.length !== missing.length) {
          throw new Error("idempotency batch claims were not stored atomically");
        }
      }

      return {
        reserved: true,
        count,
        added: missing.length,
        states: states as IdempotentUsageClaimState[],
      };
    });
  } catch {
    return null;
  }
}

/** Move one pre-reserved batch claim from `ready` to `pending` before calling
 * the provider. Only one worker can win this transition. */
export async function startIdempotentDailyUsage(
  upstream: UsageBudgetNamespace,
  idempotencyValue: string,
): Promise<IdempotentUsageClaimStart | null> {
  const normalized = normalizedIdempotencyValue(idempotencyValue);
  if (!normalized) return null;
  const claimNamespace = idempotencyClaimNamespace(upstream, normalized);
  try {
    const sql = getSql();
    if (!sql) return null;
    const started = await sql<Array<{ count: number | string }>>`
      update usage_counters
      set count = ${CLAIM_PENDING}
      where day = (now() at time zone 'America/New_York')::date
        and upstream = ${claimNamespace}
        and count = ${CLAIM_READY}
      returning count
    `;
    if (started.length > 0) return { started: true, state: "pending" };
    const [existing] = await sql<Array<{ count: number | string }>>`
      select count
      from usage_counters
      where day = (now() at time zone 'America/New_York')::date
        and upstream = ${claimNamespace}
    `;
    const state = claimState(existing?.count);
    return state ? { started: false, state } : null;
  } catch {
    return null;
  }
}

export function meterUsage(upstream: PaidUpstream, increment = 1): void {
  try {
    // Matrix products are billed by element, so callers may add more than one
    // unit for a single upstream request. Invalid increments fail closed; all
    // existing one-argument callers retain the original +1 behavior.
    if (!Number.isSafeInteger(increment) || increment <= 0) return;
    const sql = getSql();
    if (!sql) return;
    void sql`
      insert into usage_counters (day, upstream, count)
      values ((now() at time zone 'America/New_York')::date, ${upstream}, ${increment})
      on conflict (day, upstream)
      do update set count = usage_counters.count + ${increment}
    `.catch(() => {
      /* table not migrated / transient — metering is best-effort */
    });
  } catch {
    /* never throw into product code */
  }
}

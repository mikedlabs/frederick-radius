/**
 * Small, process-local resilience contract for public event sources.
 *
 * This deliberately is not a database-backed health system. It protects one
 * warm server process from repeatedly calling a source that just failed while
 * the durable Next cache remains the cross-process stale-good layer.
 */
export type EventSourceCircuitPhase = "closed" | "open" | "half-open";

export type EventSourceCircuitSnapshot = {
  phase: EventSourceCircuitPhase;
  failures: number;
  nextProbeAtMs: number | null;
  hasLastGood: boolean;
};

export type EventSourceCircuitOutcome<T> = {
  value: T;
  phase: EventSourceCircuitPhase;
  attempted: boolean;
  degraded: boolean;
  servedStale: boolean;
  nextProbeAtMs: number | null;
};

export type EventSourceCircuitClassification =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled";

type CircuitEntry = {
  phase: EventSourceCircuitPhase;
  failures: number;
  nextProbeAtMs: number | null;
  lastGood?: unknown;
  inFlight?: Promise<EventSourceCircuitOutcome<unknown>>;
};

export type EventSourceCircuitOptions<T> = {
  classify: (value: T) => EventSourceCircuitClassification;
  fallback: () => T;
  /**
   * Caller-owned cancellation must not be published as shared work. When
   * false, the attempt still observes and updates the public circuit (including
   * stale-good fallback), but it neither joins nor becomes `inFlight`.
   */
  shareInFlight?: boolean;
};

export type EventSourceCircuitPolicy = {
  baseCooldownMs?: number;
  maxCooldownMs?: number;
  jitterRatio?: number;
  now?: () => number;
  random?: () => number;
};

const DEFAULT_BASE_COOLDOWN_MS = 30_000;
const DEFAULT_MAX_COOLDOWN_MS = 15 * 60_000;
const DEFAULT_JITTER_RATIO = 0.2;

export class EventSourceCircuitRegistry {
  private readonly entries = new Map<string, CircuitEntry>();
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly jitterRatio: number;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(policy: EventSourceCircuitPolicy = {}) {
    this.baseCooldownMs = Math.max(
      1,
      policy.baseCooldownMs ?? DEFAULT_BASE_COOLDOWN_MS,
    );
    this.maxCooldownMs = Math.max(
      this.baseCooldownMs,
      policy.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS,
    );
    this.jitterRatio = Math.min(
      1,
      Math.max(0, policy.jitterRatio ?? DEFAULT_JITTER_RATIO),
    );
    // Resolve globals at call time so fake clocks/random sources in tests and
    // runtime instrumentation remain observable after the registry is built.
    this.now = policy.now ?? (() => Date.now());
    this.random = policy.random ?? (() => Math.random());
  }

  snapshot(source: string): EventSourceCircuitSnapshot {
    const entry = this.entries.get(source);
    return {
      phase: entry?.phase ?? "closed",
      failures: entry?.failures ?? 0,
      nextProbeAtMs: entry?.nextProbeAtMs ?? null,
      hasLastGood: entry?.lastGood !== undefined,
    };
  }

  reset(): void {
    this.entries.clear();
  }

  async run<T>(
    source: string,
    work: () => Promise<T>,
    options: EventSourceCircuitOptions<T>,
  ): Promise<EventSourceCircuitOutcome<T>> {
    const entry = this.entry(source);
    const now = this.now();
    const shareInFlight = options.shareInFlight !== false;

    if (
      entry.phase === "open"
      && entry.nextProbeAtMs !== null
      && now < entry.nextProbeAtMs
    ) {
      return this.skippedOutcome(entry, options.fallback);
    }

    // A closed cold fill and a half-open recovery probe are both single-flight.
    // Concurrent visitors share the one attempt rather than multiplying load.
    if (shareInFlight && entry.inFlight) {
      return entry.inFlight as Promise<EventSourceCircuitOutcome<T>>;
    }

    const stateBeforeAttempt = {
      phase: entry.phase,
      failures: entry.failures,
      nextProbeAtMs: entry.nextProbeAtMs,
      lastGood: entry.lastGood,
    };

    if (shareInFlight && entry.phase === "open") {
      entry.phase = "half-open";
      entry.nextProbeAtMs = null;
    }

    const attempt = this.attempt(
      entry,
      work,
      options,
      stateBeforeAttempt,
      shareInFlight,
    );
    if (!shareInFlight) return attempt;

    entry.inFlight = attempt as Promise<EventSourceCircuitOutcome<unknown>>;
    try {
      return await attempt;
    } finally {
      if (entry.inFlight === attempt) entry.inFlight = undefined;
    }
  }

  private entry(source: string): CircuitEntry {
    const existing = this.entries.get(source);
    if (existing) return existing;
    const created: CircuitEntry = {
      phase: "closed",
      failures: 0,
      nextProbeAtMs: null,
    };
    this.entries.set(source, created);
    return created;
  }

  private skippedOutcome<T>(
    entry: CircuitEntry,
    fallback: () => T,
  ): EventSourceCircuitOutcome<T> {
    const servedStale = entry.lastGood !== undefined;
    return {
      value: servedStale ? (entry.lastGood as T) : fallback(),
      phase: "open",
      attempted: false,
      degraded: true,
      servedStale,
      nextProbeAtMs: entry.nextProbeAtMs,
    };
  }

  private async attempt<T>(
    entry: CircuitEntry,
    work: () => Promise<T>,
    options: EventSourceCircuitOptions<T>,
    stateBeforeAttempt: Omit<CircuitEntry, "inFlight">,
    restoreStateOnCancellation: boolean,
  ): Promise<EventSourceCircuitOutcome<T>> {
    let value: T;
    try {
      value = await work();
    } catch {
      value = options.fallback();
    }

    const classification = options.classify(value);
    if (classification === "cancelled") {
      // A caller-owned deadline says nothing about provider health. Shared
      // work may have moved an open circuit to half-open, so restore its exact
      // pre-attempt state. Isolated work never made that transition and must
      // be a no-op: restoring its snapshot could erase a concurrent visitor's
      // successful update.
      if (restoreStateOnCancellation) {
        entry.phase = stateBeforeAttempt.phase;
        entry.failures = stateBeforeAttempt.failures;
        entry.nextProbeAtMs = stateBeforeAttempt.nextProbeAtMs;
        entry.lastGood = stateBeforeAttempt.lastGood;
      }
      const servedStale = entry.lastGood !== undefined;
      return {
        value: servedStale ? (entry.lastGood as T) : value,
        phase: entry.phase,
        attempted: true,
        degraded: true,
        servedStale,
        nextProbeAtMs: entry.nextProbeAtMs,
      };
    }

    if (classification === "success") {
      entry.phase = "closed";
      entry.failures = 0;
      entry.nextProbeAtMs = null;
      entry.lastGood = value;
      return {
        value,
        phase: "closed",
        attempted: true,
        degraded: false,
        servedStale: false,
        nextProbeAtMs: null,
      };
    }

    if (classification === "neutral") {
      entry.phase = "closed";
      entry.failures = 0;
      entry.nextProbeAtMs = null;
      entry.lastGood = undefined;
      return {
        value,
        phase: "closed",
        attempted: true,
        degraded: false,
        servedStale: false,
        nextProbeAtMs: null,
      };
    }

    entry.failures += 1;
    entry.phase = "open";
    entry.nextProbeAtMs = this.now() + this.failureCooldown(entry.failures);

    const servedStale = entry.lastGood !== undefined;
    return {
      value: servedStale ? (entry.lastGood as T) : value,
      phase: "open",
      attempted: true,
      degraded: true,
      servedStale,
      nextProbeAtMs: entry.nextProbeAtMs,
    };
  }

  private failureCooldown(failures: number): number {
    const exponential = Math.min(
      this.maxCooldownMs,
      this.baseCooldownMs * 2 ** Math.max(0, failures - 1),
    );
    const jitter =
      1 - this.jitterRatio + this.random() * this.jitterRatio * 2;
    return Math.max(
      1,
      Math.min(this.maxCooldownMs, Math.round(exponential * jitter)),
    );
  }
}

/**
 * Preserve input order while keeping live-provider fanout below a hard cap.
 */
export async function mapEventSourcesWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => worker(),
    ),
  );
  return results;
}

export const publicEventSourceCircuits =
  new EventSourceCircuitRegistry();

import { decoratePlace, publicPlaces } from "@/lib/loaders/places";
import { PROVENANCE_FIELDS, type SourceConfidence } from "@/lib/provenance";
import { hoursFreshnessEnforced, isHoursFresh } from "@/lib/hours-freshness";
import {
  OPEN_NOW_MINIMUM_COVERAGE,
  type HoursAvailabilityPlace,
} from "@/lib/hours-availability";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";

/**
 * Trust report (data brief, Section 8 gates, made measurable).
 *
 * Turns the now-invisible provenance and hours work into numbers the
 * data-health cron can assert on every night:
 *   - provenance coverage: the share of rows carrying all seven fields.
 *     The brief's target is 100 percent; the loader stamps at the
 *     chokepoint, so anything less means a row escaped it.
 *   - confidence distribution: how the catalog splits across the trust
 *     ladder, so a sudden swing (a bad import flooding the scraped tier)
 *     is visible.
 *   - stale or missing open assertions: rows that currently render an
 *     open or closed state whose hours verification is outside the
 *     freshness window. This is the brief's "0" gate and the exact set
 *     freshness window. The loader suppresses those states, so anything in
 *     this bucket is a policy regression.
 *
 * Pure and synchronous: it decorates the static catalog with an injected
 * clock, so it is unit testable and adds no network to the cron.
 */

export type TrustReport = {
  places: number;
  fresh_hours: FreshHoursHealth;
  provenance: {
    covered: number;
    coverage_pct: number;
    missing_sample: string[];
    below_gate: boolean;
  };
  confidence: Record<SourceConfidence, number>;
  open_assertions: {
    asserting: number;
    stale_or_missing: number;
    stale_sample: string[];
    below_gate: boolean;
  };
};

export type FreshHoursHealth = {
  fresh_count: number;
  total_count: number;
  coverage_pct: number;
  target_count: number;
  target_pct: number;
  open_now_eligible: boolean;
  below_gate: boolean;
  checked_at: string;
  source: "current-verified-hours";
};

const ASSERTING_STATES = new Set(["open", "closing-soon", "closed"]);

/**
 * The strict nightly Open Now gate.
 *
 * This intentionally checks the verification timestamp directly instead of
 * using mayAssertOpenState(). The latter has an emergency rollback that can
 * temporarily let stored schedules render; an operational rollback must never
 * make stale inventory look like current coverage on the owner health board.
 */
export function summarizeFreshHoursHealth(
  places: readonly HoursAvailabilityPlace[],
  now: Date = new Date(),
  targetCoverage: number = OPEN_NOW_MINIMUM_COVERAGE,
): FreshHoursHealth {
  const total = places.length;
  const fresh = places.filter(
    (place) =>
      Boolean(place.hours) &&
      Object.keys(place.hours ?? {}).length > 0 &&
      place.hours_verified === true &&
      isHoursFresh(place.hours_updated_at, now) &&
      mayPublishVisitabilityHours(place.slug, place.hours, now),
  ).length;
  const coverage = total > 0 ? fresh / total : 0;
  const targetCount = Math.ceil(total * targetCoverage);
  const eligible = fresh > 0 && coverage >= targetCoverage;

  return {
    fresh_count: fresh,
    total_count: total,
    coverage_pct: Number((coverage * 100).toFixed(1)),
    target_count: targetCount,
    target_pct: Number((targetCoverage * 100).toFixed(1)),
    open_now_eligible: eligible,
    below_gate: !eligible,
    checked_at: now.toISOString(),
    source: "current-verified-hours",
  };
}

export function computePlaceTrustReport(now: Date = new Date()): TrustReport {
  const publicCatalog = publicPlaces();
  const confidence: Record<SourceConfidence, number> = {
    curated: 0,
    partner: 0,
    verified: 0,
    scraped: 0,
  };
  let covered = 0;
  const missingSample: string[] = [];
  let asserting = 0;
  let stale = 0;
  const staleSample: string[] = [];
  const decorated: HoursAvailabilityPlace[] = [];

  for (const raw of publicCatalog) {
    const row = decoratePlace(raw, undefined, now) as unknown as Record<string, unknown>;
    decorated.push(row as unknown as HoursAvailabilityPlace);

    const complete = PROVENANCE_FIELDS.every((f) => f in row && row[f] !== undefined);
    if (complete) covered++;
    else if (missingSample.length < 10) missingSample.push(raw.slug);

    const conf = row.confidence as SourceConfidence | undefined;
    if (conf && conf in confidence) confidence[conf]++;

    const state = (row.open_status as { state?: string } | undefined)?.state;
    if (state && ASSERTING_STATES.has(state)) {
      asserting++;
      // The freshness gate keys off the hours verification date, the same
      // field mayAssertOpenState reads, not the row's overall date.
      if (!isHoursFresh(row.hours_updated_at as string | undefined, now)) {
        stale++;
        if (staleSample.length < 10) staleSample.push(raw.slug);
      }
    }
  }

  const total = publicCatalog.length;
  return {
    places: total,
    fresh_hours: summarizeFreshHoursHealth(decorated, now),
    provenance: {
      covered,
      coverage_pct: total ? Number(((covered / total) * 100).toFixed(2)) : 0,
      missing_sample: missingSample,
      below_gate: covered < total,
    },
    confidence,
    open_assertions: {
      asserting,
      stale_or_missing: stale,
      stale_sample: staleSample,
      // During staged rollout stale timestamps are visible as advisory debt,
      // not a failed production promise. Once strict enforcement is enabled,
      // any stale assertion is a true boundary regression.
      below_gate: hoursFreshnessEnforced() && stale > 0,
    },
  };
}

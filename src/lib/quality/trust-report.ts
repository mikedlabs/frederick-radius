import { PLACES } from "@/data/places";
import { decoratePlace } from "@/lib/loaders/places";
import { PROVENANCE_FIELDS, type SourceConfidence } from "@/lib/provenance";
import { isHoursFresh } from "@/lib/hours-freshness";

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
 *     that would blank when HOURS_FRESHNESS_ENFORCED flips on, so the
 *     number is also the blast radius of that flip.
 *
 * Pure and synchronous: it decorates the static catalog with an injected
 * clock, so it is unit testable and adds no network to the cron.
 */

export type TrustReport = {
  places: number;
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

const ASSERTING_STATES = new Set(["open", "closing-soon", "closed"]);

export function computePlaceTrustReport(now: Date = new Date()): TrustReport {
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

  for (const raw of PLACES) {
    const row = decoratePlace(raw, undefined, now) as unknown as Record<string, unknown>;

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

  const total = PLACES.length;
  return {
    places: total,
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
      // Reported, not yet enforced: the gate trips only once the freshness
      // policy is on. Until then this is an advisory count of the flip's
      // blast radius. See HOURS_FRESHNESS_ENFORCED.
      below_gate: false,
    },
  };
}

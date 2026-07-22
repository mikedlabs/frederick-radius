/**
 * Data-quality gates — a reproducible scorecard over the committed datasets,
 * the standing answer to the July 2026 external audit's top recommendation
 * (DQ-024: "the pipeline lacks enforceable release gates"). Run it anytime:
 *
 *     npm run gates          # human scorecard, exits non-zero if a P0 fails
 *     npm run gates -- --json > gates.json
 *
 * Each gate reads the SAME data the app ships (places-client.json is the public
 * place set; places-enrichment.json carries the raw provider fields), computes
 * a real numerator/denominator, and reports pass/fail against a threshold. It
 * is intentionally static: it covers the place/category defects the audit found
 * in committed data. Event-time/geography gates need the live assembled feed
 * and are listed as "manual" so the scorecard never pretends to cover them.
 *
 * Add a gate by pushing to GATES. Keep each pure and dataset-backed.
 */
import PLACES_RAW from "@/data/places-client.json" with { type: "json" };
import ENRICH_RAW from "@/data/places-enrichment.json" with { type: "json" };
import { PLACES as SOURCE_PLACES } from "@/data/places";
import {
  CATEGORIES,
  categoryRouteOverride,
  isAmenityCategory,
} from "@/data/categories";
import { isInFrederickCountyArea } from "@/lib/geo";
import {
  hasReviewedAllWeek24hVisitability,
  isAllWeekAllDay,
  is24hVisitabilityReviewCurrent,
  REVIEWED_ALL_WEEK_24H_VISITABILITY,
} from "@/lib/hours-visitability";
import { isGooglePlaceId } from "@/lib/provenance";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  isManualPlaceStatusReviewCurrent,
  MANUAL_PLACE_STATUS_OVERRIDES,
} from "@/lib/place-status-overrides";

const PLACES = PLACES_RAW as unknown as PlaceCardData[];
const ENRICH = ENRICH_RAW as Record<string, { google_place_id?: string }>;
type Severity = "critical" | "high" | "medium" | "low";
type Gate = {
  id: string;
  severity: Severity;
  audit: string;
  run: () => { pass: boolean; observed: string; expect: string };
};

/** A blurb that helps someone choose: present, not just the name echoed back,
 *  and not shared verbatim across many rows. */
const blurbCounts = (() => {
  const seen = new Map<string, number>();
  for (const p of PLACES) {
    const b = (p.short_blurb ?? "").trim();
    if (b) seen.set(b, (seen.get(b) ?? 0) + 1);
  }
  return seen;
})();
function isDecisionCopy(p: PlaceCardData): boolean {
  const b = (p.short_blurb ?? "").trim();
  if (!b) return false;
  const name = p.name.trim();
  if (b === name) return false;
  // A name prefix is often grammatical, useful copy ("Baker Park is a
  // 44-acre…"). Reject only the short scraped echo this guard was written for
  // ("Name Patrick St"), not an otherwise substantive description.
  if (b.startsWith(`${name} `)) {
    const remainderWords = b.slice(name.length).trim().split(/\s+/).filter(Boolean);
    if (remainderWords.length < 5) return false;
  }
  if ((blurbCounts.get(b) ?? 0) > 3) return false; // shared boilerplate
  return true;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : n / d);
const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;

const GATES: Gate[] = [
  {
    id: "place_slug_unique",
    severity: "critical",
    audit: "candidate key",
    run: () => {
      const seen = new Set<string>();
      let dupes = 0;
      for (const p of PLACES) {
        if (seen.has(p.slug)) dupes++;
        seen.add(p.slug);
      }
      return { pass: dupes === 0, observed: `${dupes} duplicate slugs`, expect: "0" };
    },
  },
  {
    id: "county_boundary_scope",
    severity: "high",
    audit: "DQ-014",
    run: () => {
      const outside = PLACES.filter((p) => p.geom && !isInFrederickCountyArea(p.geom.lng, p.geom.lat));
      return {
        pass: outside.length === 0,
        observed: `${outside.length} of ${PLACES.length} outside the county polygon (+1.5km buffer)`,
        expect: "0 (or allow-listed nearby)",
      };
    },
  },
  {
    id: "place_hours_coverage",
    severity: "high",
    audit: "DQ-003",
    run: () => {
      const withHours = PLACES.filter((p) => p.hours && Object.keys(p.hours).length > 0).length;
      const r = pct(withHours, PLACES.length);
      return { pass: r >= 0.6, observed: `${fmtPct(r)} have materialized hours`, expect: ">= 60% (target 90% of visit-now)" };
    },
  },
  {
    id: "open_now_24h_all_week",
    severity: "critical",
    audit: "DQ-002",
    run: () => {
      const allWeek247 = PLACES.filter((p) => isAllWeekAllDay(p.hours));
      const publishedSlugs = new Set(allWeek247.map((p) => p.slug));
      const unreviewed = allWeek247.filter(
        (p) => !hasReviewedAllWeek24hVisitability(p.slug),
      );
      const exemptions = Object.entries(REVIEWED_ALL_WEEK_24H_VISITABILITY);
      const stale = exemptions.filter(([, entry]) =>
        !is24hVisitabilityReviewCurrent(entry.review_after),
      );
      const unmatched = exemptions.filter(([slug]) => !publishedSlugs.has(slug));
      return {
        pass: unreviewed.length === 0 && stale.length === 0 && unmatched.length === 0,
        observed: `${unreviewed.length} unreviewed; ${stale.length} stale; ${unmatched.length} missing/changed; ${allWeek247.length} reviewed published`,
        expect: "0 unreviewed, stale, or unmatched all-week 24/7 schedules",
      };
    },
  },
  {
    id: "manual_place_status_review",
    severity: "high",
    audit: "operational status",
    run: () => {
      const entries = Object.entries(MANUAL_PLACE_STATUS_OVERRIDES);
      const stale = entries.filter(([, override]) =>
        !isManualPlaceStatusReviewCurrent(override),
      );
      const sourceSlugs = new Set(SOURCE_PLACES.map((place) => place.slug));
      const unmatched = entries.filter(([slug]) => !sourceSlugs.has(slug));
      return {
        pass: stale.length === 0 && unmatched.length === 0,
        observed: `${stale.length} stale; ${unmatched.length} unmatched of ${entries.length} manual status override${entries.length === 1 ? "" : "s"}`,
        expect: "0 overrides past review_after or missing from source places",
      };
    },
  },
  {
    id: "place_decision_copy",
    severity: "medium",
    audit: "DQ-011",
    run: () => {
      const good = PLACES.filter(isDecisionCopy).length;
      const r = pct(good, PLACES.length);
      return { pass: r >= 0.5, observed: `${fmtPct(r)} have unique, decision-useful blurbs`, expect: ">= 50% (target 90% of editorial)" };
    },
  },
  {
    id: "google_place_id_format",
    severity: "high",
    audit: "DQ-020",
    run: () => {
      let uuids = 0;
      let checked = 0;
      for (const p of PLACES) {
        const gid = ENRICH[p.slug]?.google_place_id;
        if (!gid) continue;
        checked++;
        if (!isGooglePlaceId(gid)) uuids++;
      }
      // Not a P0 fail: the render-time fix (isGooglePlaceId in provenance)
      // already suppresses links for these; this tracks the raw-data debt.
      return {
        pass: uuids === 0,
        observed: `${uuids} of ${checked} google_place_id values are UUID-shaped`,
        expect: "0 (links already suppressed; clean the source data)",
      };
    },
  },
  {
    id: "tags_array_unique",
    severity: "low",
    audit: "DQ-017",
    run: () => {
      let bad = 0;
      for (const p of PLACES) {
        const t = p.tags ?? [];
        if (new Set(t).size !== t.length) bad++;
      }
      return { pass: bad === 0, observed: `${bad} places with duplicate values in tags`, expect: "0" };
    },
  },
  {
    id: "indexed_categories_nonempty",
    severity: "high",
    audit: "DQ-016",
    run: () => {
      // Leaf categories are the browse routes; count places by exact category
      // slug (a lower bound — intent pages match more broadly). Flag zeroes.
      // Amenity categories (redirect to /amenities), utility categories, and the
      // food-truck redirect are NOT directory pages and are out of the sitemap,
      // so they can't be "indexed empty dead ends" — exclude them (DQ-016 fix).
      const leaves = CATEGORIES.filter(
        (c) =>
          !CATEGORIES.some((k) => k.parent === c.slug) &&
          !isAmenityCategory(c.slug) &&
          c.kind !== "utility" &&
          !categoryRouteOverride(c.slug),
      );
      const counts = new Map<string, number>();
      for (const p of PLACES) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      const empty = leaves.filter((c) => (counts.get(c.slug) ?? 0) === 0);
      return {
        pass: empty.length === 0,
        observed: `${empty.length} of ${leaves.length} leaf categories have 0 exact-match places${empty.length ? ` (${empty.slice(0, 8).map((c) => c.slug).join(", ")}${empty.length > 8 ? "…" : ""})` : ""}`,
        expect: "0 indexed empty categories",
      };
    },
  },
];

const MANUAL = [
  "event_default_geocode (DQ-004) — needs the live assembled event feed",
  "event_nonrecurring_duration (DQ-005) — needs the live assembled event feed",
  "event_venue_fk (DQ-006) — needs the live assembled event feed",
  "place_last_verified_fresh (DQ-001) — needs per-field verification events",
];

function main() {
  const asJson = process.argv.includes("--json");
  const failHigh = process.argv.includes("--fail-high");
  const results = GATES.map((g) => ({ ...g, ...g.run() }));
  const failed = results.filter((r) => !r.pass);
  const p0Failed = failed.filter((r) => r.severity === "critical");
  const highOrCriticalFailed = failed.filter(
    (r) => r.severity === "critical" || r.severity === "high",
  );

  if (asJson) {
    const rows = results.map((r) => ({ id: r.id, severity: r.severity, audit: r.audit, pass: r.pass, observed: r.observed, expect: r.expect }));
    console.log(JSON.stringify({ generated_static: true, results: rows, manual: MANUAL }, null, 2));
  } else {
    const pad = (s: string, n: number) => s.padEnd(n);
    console.log(`\nFrederick Radius — data-quality gates (static datasets)\n`);
    console.log(`  ${pad("GATE", 30)} ${pad("SEV", 9)} STATUS  OBSERVED`);
    console.log(`  ${"-".repeat(78)}`);
    for (const r of results) {
      const mark = r.pass ? "PASS" : "FAIL";
      console.log(`  ${pad(r.id, 30)} ${pad(r.severity, 9)} ${pad(mark, 7)} ${r.observed}`);
    }
    console.log(`  ${"-".repeat(78)}`);
    console.log(`  ${results.length - failed.length}/${results.length} pass · ${failed.length} fail · ${p0Failed.length} critical fail\n`);
    console.log(`  Needs live data (run against the assembled feed, not covered here):`);
    for (const m of MANUAL) console.log(`    · ${m}`);
    console.log("");
  }
  // Normal release builds block on critical gates. The nightly data steward
  // opts into --fail-high so review deadlines and coverage regressions create
  // a visible failed run without making the known medium editorial-copy debt
  // prevent ordinary deploys.
  const blocking = failHigh ? highOrCriticalFailed : p0Failed;
  process.exit(blocking.length > 0 ? 1 : 0);
}

main();

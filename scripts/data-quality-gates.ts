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
import DESCRIPTIONS_RAW from "@/data/descriptions.json" with { type: "json" };
import { PLACES as SOURCE_PLACES } from "@/data/places";
import {
  CATEGORIES,
  categoryRouteOverride,
  isAmenityCategory,
} from "@/data/categories";
import { isInFrederickCountyArea } from "@/lib/geo";
import {
  hasReviewRequiredExtendedWindow,
  isAllWeekAllDay,
  is24hVisitabilityReviewCurrent,
  REVIEWED_ALL_WEEK_24H_VISITABILITY,
} from "@/lib/hours-visitability";
import { isGooglePlaceId } from "@/lib/provenance";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { PlaceDescriptionEntry } from "@/lib/loaders/placeDescriptions";
import {
  hasValidManualPlaceStatusEvidence,
  isManualPlaceClosureOverride,
  isManualPlaceOperationalCorrection,
  isManualPlaceStatusReviewCurrent,
  MANUAL_PLACE_STATUS_OVERRIDES,
} from "@/lib/place-status-overrides";
import { isHoursFresh } from "@/lib/hours-freshness";
import { HOURS_REFRESH_CYCLE_DAYS } from "@/lib/hours-refresh-targets";
import { classifyDescription } from "@/lib/copy-quality";
import {
  decisionCopyCounts,
  hasUsefulDecisionCopy,
} from "@/lib/quality/coverage";

const PLACES = PLACES_RAW as unknown as PlaceCardData[];
const ENRICH = ENRICH_RAW as Record<
  string,
  {
    google_place_id?: string;
    has_hours?: boolean;
    weekday_hours?: string[];
    editorial_summary?: string;
  }
>;
const DESCRIPTIONS = DESCRIPTIONS_RAW as Record<string, PlaceDescriptionEntry>;
const SOURCE_BY_SLUG = new Map(
  SOURCE_PLACES.map((place) => [place.slug, place]),
);
type Severity = "critical" | "high" | "medium" | "low";
type Gate = {
  id: string;
  severity: Severity;
  audit: string;
  run: () => { pass: boolean; observed: string; expect: string };
};

/** Share the exact decision-copy rule with the admin coverage report. Keeping
 * this in one module prevents a gate from going green while the product's
 * coverage surface still counts the same sentence as unusable. */
const blurbCounts = decisionCopyCounts(PLACES);
const isDecisionCopy = (place: PlaceCardData) =>
  hasUsefulDecisionCopy(place, blurbCounts);

const DESCRIPTION_SOURCE_KINDS = new Set([
  "business_website",
  "official_source",
  "field_note",
  "radius_editorial",
]);

function isValidIsoDate(value: string | undefined): boolean {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const pct = (n: number, d: number) => (d === 0 ? 0 : n / d);
const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;
const normalizedCopy = (value: string | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

/** Stored schedule coverage is deliberately distinct from published freshness.
 * Strict builds withhold stale schedules from places-client.json, so counting
 * only the client field would make "do we possess hours?" indistinguishable
 * from "may we make an open-now claim?". */
function hasStoredSchedule(place: PlaceCardData): boolean {
  const source = SOURCE_BY_SLUG.get(place.slug);
  const enrichment = ENRICH[place.slug];
  return Boolean(
    (source?.hours && Object.keys(source.hours).length > 0) ||
      (enrichment?.has_hours && enrichment.weekday_hours?.length),
  );
}

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
        observed: `${outside.length} of ${PLACES.length} outside the county polygon and reviewed Mount Airy extent`,
        expect: "0 (or allow-listed nearby)",
      };
    },
  },
  {
    id: "place_hours_coverage",
    severity: "high",
    audit: "DQ-003",
    run: () => {
      const withHours = PLACES.filter(hasStoredSchedule).length;
      const r = pct(withHours, PLACES.length);
      return { pass: r >= 0.6, observed: `${fmtPct(r)} have a stored source schedule`, expect: ">= 60% (target 90% of visit-now)" };
    },
  },
  {
    id: "place_hours_refresh_reach",
    severity: "high",
    audit: "DQ-001/DQ-003 pipeline capacity",
    run: () => {
      const refreshable = PLACES.filter((place) =>
        isGooglePlaceId(place.google_place_id),
      ).length;
      const r = pct(refreshable, PLACES.length);
      return {
        pass: r >= 0.6,
        observed: `${fmtPct(r)} (${refreshable} of ${PLACES.length}) can enter the ${HOURS_REFRESH_CYCLE_DAYS}-day Google refresh cycle`,
        expect: ">= 60% so the refresh pipeline can satisfy the strict hours gate",
      };
    },
  },
  {
    id: "place_hours_freshness",
    severity: "high",
    audit: "DQ-001/DQ-003",
    run: () => {
      const fresh = PLACES.filter(
        (p) =>
          p.hours &&
          Object.keys(p.hours).length > 0 &&
          p.hours_verified &&
          isHoursFresh(p.hours_updated_at),
      ).length;
      const r = pct(fresh, PLACES.length);
      return {
        pass: r >= 0.6,
        observed: `${fmtPct(r)} have hours verified within the 7-day policy window`,
        expect: ">= 60% before strict open-now enforcement (target 90% of visit-now)",
      };
    },
  },
  {
    id: "publishable_card_photo_coverage",
    severity: "critical",
    audit: "visual data coverage",
    run: () => {
      // Count only bytes the shipped card is allowed to render: an owned hero
      // or a Google photo that survived the exact-attribution policy. The raw
      // enrichment still contains thousands of legacy photo resource names,
      // but those are not publishable without their paired source metadata and
      // must never make this gate look green.
      const withPhoto = PLACES.filter(
        (place) => Boolean(place.hero_image || place.google_photo_url),
      ).length;
      const r = pct(withPhoto, PLACES.length);
      return {
        pass: r >= 0.7,
        observed: `${fmtPct(r)} have an owned or attributed card photo`,
        expect: ">= 70% of public places",
      };
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
        (p) =>
          !Object.hasOwn(REVIEWED_ALL_WEEK_24H_VISITABILITY, p.slug),
      );
      const exemptions = Object.entries(REVIEWED_ALL_WEEK_24H_VISITABILITY);
      const stalePublished = allWeek247.filter((place) => {
        const entry =
          REVIEWED_ALL_WEEK_24H_VISITABILITY[
            place.slug as keyof typeof REVIEWED_ALL_WEEK_24H_VISITABILITY
          ];
        return Boolean(
          entry && !is24hVisitabilityReviewCurrent(entry.review_after),
        );
      });
      const reviewedWithheld = exemptions.filter(
        ([slug]) => !publishedSlugs.has(slug),
      );
      return {
        pass: unreviewed.length === 0 && stalePublished.length === 0,
        observed: `${unreviewed.length} unreviewed published; ${stalePublished.length} stale published; ${reviewedWithheld.length} reviewed schedules safely withheld; ${allWeek247.length} published`,
        expect: "0 unreviewed or stale all-week 24/7 schedules published",
      };
    },
  },
  {
    id: "open_now_extended_windows",
    severity: "critical",
    audit: "DQ-002 provider-hours plausibility",
    run: () => {
      const extended = PLACES.filter((p) =>
        hasReviewRequiredExtendedWindow(p.hours),
      );
      const unreviewed = extended.filter(
        (p) =>
          !Object.hasOwn(REVIEWED_ALL_WEEK_24H_VISITABILITY, p.slug),
      );
      const stale = extended.filter((place) => {
        const entry =
          REVIEWED_ALL_WEEK_24H_VISITABILITY[
            place.slug as keyof typeof REVIEWED_ALL_WEEK_24H_VISITABILITY
          ];
        return Boolean(
          entry && !is24hVisitabilityReviewCurrent(entry.review_after),
        );
      });
      return {
        pass: unreviewed.length === 0 && stale.length === 0,
        observed: `${unreviewed.length} unreviewed; ${stale.length} stale-reviewed of ${extended.length} published schedules with a 20+ hour window`,
        expect: "0 unreviewed or stale-reviewed near-all-day windows published",
      };
    },
  },
  {
    id: "manual_place_status_review",
    severity: "high",
    audit: "operational status",
    run: () => {
      const entries = Object.entries(MANUAL_PLACE_STATUS_OVERRIDES);
      const today = new Date().toISOString().slice(0, 10);
      const stale = entries.filter(([, override]) =>
        !isManualPlaceStatusReviewCurrent(override),
      );
      const sourceSlugs = new Set(SOURCE_PLACES.map((place) => place.slug));
      const unmatched = entries.filter(([slug]) => !sourceSlugs.has(slug));
      const invalidEvidence = entries.filter(
        ([, override]) => !hasValidManualPlaceStatusEvidence(override),
      );
      const futureEffective = entries.filter(
        ([, override]) => override.effective_at > today,
      );
      const closures = entries.filter(([, override]) =>
        isManualPlaceClosureOverride(override),
      );
      const operationalCorrections = entries.filter(([, override]) =>
        isManualPlaceOperationalCorrection(override),
      );
      return {
        pass:
          stale.length === 0 &&
          unmatched.length === 0 &&
          invalidEvidence.length === 0 &&
          futureEffective.length === 0,
        observed: `${stale.length} stale; ${unmatched.length} unmatched; ${invalidEvidence.length} invalid evidence records; ${futureEffective.length} future-effective of ${entries.length} manual status overrides (${closures.length} closures; ${operationalCorrections.length} operational corrections)`,
        expect:
          "0 overrides past review_after, missing from source places, lacking valid HTTPS evidence, or effective in the future",
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
      return {
        pass: r >= 0.5,
        observed: `${fmtPct(r)} (${good} of ${PLACES.length}) have unique, decision-useful blurbs`,
        expect: ">= 50% (target 90% of editorial)",
      };
    },
  },
  {
    id: "radius_description_registry",
    severity: "high",
    audit: "editorial provenance",
    run: () => {
      const publicBySlug = new Map(
        PLACES.map((place) => [place.slug, place]),
      );
      const approved = Object.entries(DESCRIPTIONS).filter(([, entry]) => entry.status === "approved");
      const invalid = approved.filter(([slug, entry]) => {
        const place = publicBySlug.get(slug);
        const sourceKindOk = DESCRIPTION_SOURCE_KINDS.has(entry.source?.kind);
        const isRadiusEditorial = entry.source?.kind === "radius_editorial";
        const sourceOk = isRadiusEditorial || (
          isHttpsUrl(entry.source?.url) &&
          isValidIsoDate(entry.source?.fetched_at)
        );
        const contentOk = Boolean(
          place &&
          classifyDescription(place.name, entry.blurb, true) === "reviewed",
        );
        return !place || !sourceKindOk || !sourceOk ||
          !isValidIsoDate(entry.reviewed_at) ||
          !entry.reviewer_note?.trim() ||
          !/[.!?]$/.test(entry.blurb.trim()) ||
          !contentOk;
      });
      return {
        pass: invalid.length === 0,
        observed: `${invalid.length} invalid of ${approved.length} approved descriptions`,
        expect: "0 invalid, unreviewed, undocumented, unsourced, or orphaned approvals",
      };
    },
  },
  {
    id: "radius_owned_copy_coverage",
    severity: "medium",
    audit: "DQ-011 provenance split",
    run: () => {
      const useful = PLACES.filter(isDecisionCopy);
      const explicitlyApproved = useful.filter(
        (place) => place.description_reviewed,
      ).length;
      const legacyRadiusAuthored = useful.filter(
        (place) =>
          place.description_source === "radius_editorial" &&
          !place.description_reviewed,
      ).length;
      const owned = useful.filter((place) =>
        Boolean(place.description_source),
      ).length;
      const r = pct(owned, PLACES.length);
      return {
        pass: r >= 0.5,
        observed:
          `${fmtPct(r)} (${owned} of ${PLACES.length}) have Radius-owned or approved decision copy ` +
          `(${legacyRadiusAuthored} legacy Radius-authored; ${explicitlyApproved} explicitly approved)`,
        expect: ">= 50% (Google runtime context reported separately)",
      };
    },
  },
  {
    id: "provider_copy_provenance",
    severity: "critical",
    audit: "editorial trust boundary",
    run: () => {
      const unprovenanced = PLACES.filter(
        (place) =>
          Boolean(normalizedCopy(place.short_blurb)) &&
          !place.description_source,
      );
      const providerSummaries = new Set(
        Object.values(ENRICH)
          .map((entry) => normalizedCopy(entry.editorial_summary))
          .filter(Boolean),
      );
      const providerMatches = PLACES.filter((place) =>
        providerSummaries.has(normalizedCopy(place.short_blurb)),
      );
      return {
        pass: unprovenanced.length === 0 && providerMatches.length === 0,
        observed:
          `${unprovenanced.length} nonempty blurbs lack provenance; ` +
          `${providerMatches.length} public blurbs duplicate Google editorial summaries`,
        expect:
          "0; permanent copy must be Radius-owned or approved, and provider context must remain attributed",
      };
    },
  },
  {
    id: "google_place_id_format",
    severity: "high",
    audit: "DQ-020",
    run: () => {
      const ids = PLACES.map((place) => place.google_place_id).filter(Boolean);
      const invalid = ids.filter((id) => !isGooglePlaceId(id));
      // Not a P0 fail: the render-time fix (isGooglePlaceId in provenance)
      // and the paid hours cron both suppress these; this tracks source debt.
      return {
        pass: invalid.length === 0,
        observed: `${invalid.length} of ${ids.length} public google_place_id values are invalid`,
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

/**
 * Inspectable place-copy coverage and provenance report.
 *
 * This reads the exact client place artifact the release gates inspect. It
 * never rewrites copy and never treats provider or directory prose as Radius
 * editorial. Use the JSON form for a review backlog or CI artifact:
 *
 *   npm run copy:coverage
 *   npm run copy:coverage -- --json
 */
import PLACES_RAW from "@/data/places-client.json" with { type: "json" };
import DESCRIPTIONS_RAW from "@/data/descriptions.json" with { type: "json" };
import type { PlaceCardData } from "@/lib/loaders/places";
import type { PlaceDescriptionEntry } from "@/lib/loaders/placeDescriptions";
import {
  decisionCopyCounts,
  decisionCopyIssue,
  hasUsefulDecisionCopy,
  type DecisionCopyIssue,
} from "@/lib/quality/coverage";

const places = PLACES_RAW as unknown as PlaceCardData[];
const descriptions = DESCRIPTIONS_RAW as Record<string, PlaceDescriptionEntry>;
const copyCounts = decisionCopyCounts(places);

type Segment = {
  total: number;
  useful: number;
  radius_owned_or_approved: number;
  explicitly_approved: number;
};

function percentage(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1_000) / 10;
}

function segmentBy(
  keyFor: (place: PlaceCardData) => string | undefined,
): Record<string, Segment & { useful_pct: number }> {
  const grouped = new Map<string, Segment>();
  for (const place of places) {
    const key = keyFor(place) || "(none)";
    const segment = grouped.get(key) ?? {
      total: 0,
      useful: 0,
      radius_owned_or_approved: 0,
      explicitly_approved: 0,
    };
    const useful = hasUsefulDecisionCopy(place, copyCounts);
    segment.total += 1;
    if (useful) segment.useful += 1;
    if (useful && place.description_source) {
      segment.radius_owned_or_approved += 1;
    }
    if (useful && place.description_reviewed) {
      segment.explicitly_approved += 1;
    }
    grouped.set(key, segment);
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([key, segment]) => [
        key,
        {
          ...segment,
          useful_pct: percentage(segment.useful, segment.total),
        },
      ]),
  );
}

const failures: Partial<Record<DecisionCopyIssue, number>> = {};
for (const place of places) {
  const issue = decisionCopyIssue(place, copyCounts);
  if (issue) failures[issue] = (failures[issue] ?? 0) + 1;
}

const useful = places.filter((place) =>
  hasUsefulDecisionCopy(place, copyCounts),
);
const explicitlyApproved = useful.filter(
  (place) => place.description_reviewed,
).length;
const legacyRadiusAuthored = useful.filter(
  (place) =>
    place.description_source === "radius_editorial" &&
    !place.description_reviewed,
).length;
const radiusOwnedOrApproved = useful.filter(
  (place) => place.description_source,
).length;

const registryStatuses = Object.values(descriptions).reduce<
  Record<PlaceDescriptionEntry["status"], number>
>(
  (counts, entry) => {
    counts[entry.status] += 1;
    return counts;
  },
  { candidate: 0, approved: 0, rejected: 0 },
);

const report = {
  generated_from_committed_data: true,
  totals: {
    public_places: places.length,
    decision_useful: useful.length,
    decision_useful_pct: percentage(useful.length, places.length),
    missing_or_unusable: places.length - useful.length,
  },
  provenance: {
    radius_owned_or_approved: radiusOwnedOrApproved,
    radius_owned_or_approved_pct: percentage(
      radiusOwnedOrApproved,
      places.length,
    ),
    legacy_radius_authored: legacyRadiusAuthored,
    explicitly_approved: explicitlyApproved,
    useful_without_radius_description_provenance:
      useful.length - radiusOwnedOrApproved,
    description_registry: {
      total: Object.keys(descriptions).length,
      ...registryStatuses,
    },
  },
  failure_reasons: failures,
  by_place_source: segmentBy((place) => place.source),
  by_description_source: segmentBy((place) => place.description_source),
  by_municipality: segmentBy((place) => place.municipality),
  by_category: segmentBy((place) => place.category),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `copy coverage: ${report.totals.decision_useful} of ${report.totals.public_places} ` +
      `(${report.totals.decision_useful_pct}%) have decision-useful blurbs.`,
  );
  console.log(
    `provenance: ${radiusOwnedOrApproved} owned or approved ` +
      `(${legacyRadiusAuthored} legacy Radius-authored; ${explicitlyApproved} explicitly approved); ` +
      `${report.provenance.useful_without_radius_description_provenance} useful blurbs have no Radius description provenance.`,
  );
  console.log(
    `registry: ${registryStatuses.approved} approved, ${registryStatuses.candidate} candidate, ` +
      `${registryStatuses.rejected} rejected.`,
  );
  console.log(`failure reasons: ${JSON.stringify(failures)}`);
}

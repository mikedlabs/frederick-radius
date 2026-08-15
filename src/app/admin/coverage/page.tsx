import type { Metadata } from "next";
import Link from "next/link";
import { clientPlaces } from "@/lib/loaders/places-client";
import { PLACES as SOURCE_PLACES } from "@/data/places";
import DESCRIPTIONS_RAW from "@/data/descriptions.json" with { type: "json" };
import HOURS_REFRESH_RAW from "@/data/places-hours-refresh.json" with { type: "json" };
import PLACE_ENRICHMENT_RAW from "@/data/places-enrichment.json";
import PHOTO_SUPPRESS_RAW from "@/data/photo-suppress.json" with { type: "json" };
import PLACE_OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import { CATEGORIES } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import {
  COVERAGE_TARGETS,
  coveragePriorities,
  summarizeCoverage,
  summarizeCoverageByCategory,
  summarizeCoverageByTown,
  type CoverageDimension,
  type CoveragePriority,
} from "@/lib/quality/coverage";
import { isHoursFresh } from "@/lib/hours-freshness";
import {
  prioritizePlaceDataGaps,
  type PlaceDataGapEvidence,
  type PlaceDataGapReason,
} from "@/lib/quality/place-data-priority";
import {
  AdminShell,
  Section,
  SectionLabel,
  StatStrip,
  StatCards,
  HairlineList,
  StatusPill,
  StatusDot,
  Callout,
  AllClear,
  type Tone,
} from "@/components/admin/kit";

/**
 * /admin/coverage is a compact, live readout of the public place dataset.
 * It measures the fields that determine whether a result is trustworthy and
 * useful, then turns the misses into a short operating queue.
 */

export const metadata: Metadata = {
  title: "Coverage & freshness · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const REVIEW_COUNT = 20;

const GAP_REASON_LABELS: Record<PlaceDataGapReason, string> = {
  approve_source_backed_copy: "Review the source-backed candidate",
  collect_first_party_copy: "Find first-party description evidence",
  replace_rejected_copy: "Find new first-party description evidence",
  investigate_copy_publication: "Repair the approved-copy publication path",
  refresh_hours: "Refresh the provider schedule",
  collect_official_hours: "Record reviewed official hours",
  repair_hours_identity: "Repair the hours identity match",
  provider_has_no_schedule: "The provider returned no schedule",
  review_hours_format: "Review an unreadable provider schedule",
  verify_public_visitability: "Verify public visitability with a first-party source",
  review_manual_hours_override: "Recheck the source-backed manual hours correction",
  investigate_hours_publication: "Repair the hours publication path",
  respect_photo_suppression: "A shared or wrong photo is intentionally withheld",
  respect_manual_photo_clear: "A reviewed photo correction is intentionally active",
  resolve_photo_identity: "Resolve a provider identity or add an owned image",
  repair_photo_identity: "Repair the photo identity match",
  refresh_photo_metadata: "Fetch narrow photo metadata within a reviewed cap",
  backfill_photo_attribution: "Backfill exact photo attribution within a reviewed cap",
  investigate_photo_publication: "Repair the photo publication path",
};

const DIMENSIONS: Record<
  CoverageDimension,
  {
    label: string;
    short: string;
    priorityTitle: string;
    priorityDetail: string;
    href?: string;
  }
> = {
  hours: {
    label: "fresh hours",
    short: "Hours",
    priorityTitle: "Refresh place hours",
    priorityDetail: "Recheck the oldest source schedules first. A schedule counts here only while it is inside the seven-day verification window.",
  },
  photo: {
    label: "useful photos",
    short: "Photos",
    priorityTitle: "Restore attributed place photos",
    priorityDetail: "Run the capped photo-attribution workflow so the client can publish each image with its required source metadata.",
  },
  copy: {
    label: "useful copy",
    short: "Copy",
    priorityTitle: "Approve useful place descriptions",
    priorityDetail: "Work through first-party candidates and replace repeated directory text with specific, sourced sentences.",
    href: "/admin/copy-review",
  },
  action: {
    label: "direct actions",
    short: "Actions",
    priorityTitle: "Add direct ways to act",
    priorityDetail: "Store a business website, phone number, menu, order link, or reservation link instead of relying on search fallbacks.",
  },
};

function metricTone(
  dimension: CoverageDimension,
  pct: number,
): Tone {
  if (pct >= COVERAGE_TARGETS[dimension]) return "positive";
  return pct === 0 ? "danger" : "warning";
}

function PriorityRow({
  priority,
  index,
}: {
  priority: CoveragePriority;
  index: number;
}) {
  const copy = DIMENSIONS[priority.dimension];
  return (
    <li
      className="bg-[var(--app-bg-elevated)] px-3 py-3"
      style={
        index > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-3 shrink-0 place-items-center">
          <StatusDot tone={priority.pct === 0 ? "danger" : "warning"} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {copy.href ? (
              <Link
                href={copy.href}
                className="text-[14px] font-semibold leading-tight hover:underline"
                style={{ color: "var(--app-ink)" }}
              >
                {copy.priorityTitle}
              </Link>
            ) : (
              <p
                className="text-[14px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {copy.priorityTitle}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[11px] tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {priority.pct.toFixed(1)}%
              </span>
              <StatusPill tone={priority.pct === 0 ? "danger" : "warning"}>
                {priority.needed} needed
              </StatusPill>
            </div>
          </div>
          <p
            className="mt-1 text-[11.5px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            {priority.current} of {priority.total} places meet this measure.{" "}
            {copy.priorityDetail}
          </p>
        </div>
      </div>
    </li>
  );
}

export default function CoverageAdmin() {
  const places = clientPlaces();
  const total = places.length;
  const summary = summarizeCoverage(places);
  const priorities = coveragePriorities(summary);
  const enrichment = PLACE_ENRICHMENT_RAW as Record<
    string,
    {
      google_place_id?: string;
      has_hours?: boolean;
      weekday_hours?: string[];
      photo_names?: string[];
      photo_attributions?: GooglePhotoAttribution[];
    }
  >;
  const photoClearedSlugs = new Set(
    Object.entries(
      (PLACE_OVERRIDES_RAW as {
        patch?: Record<string, { clearPhoto?: boolean }>;
      }).patch ?? {},
    ).flatMap(([slug, patch]) => (patch.clearPhoto ? [slug] : [])),
  );
  const manualHoursSlugs = new Set(
    Object.entries(
      (PLACE_OVERRIDES_RAW as {
        patch?: Record<string, { hours?: unknown }>;
      }).patch ?? {},
    ).flatMap(([slug, patch]) => (patch.hours ? [slug] : [])),
  );
  const placeDataQueue = prioritizePlaceDataGaps(places, {
    limit: 20,
    evidence: {
      descriptions:
        DESCRIPTIONS_RAW as unknown as NonNullable<
          PlaceDataGapEvidence["descriptions"]
        >,
      hoursRefresh:
        HOURS_REFRESH_RAW as unknown as NonNullable<
          PlaceDataGapEvidence["hoursRefresh"]
        >,
      photoEnrichment: enrichment,
      photoSuppressedSlugs: new Set(PHOTO_SUPPRESS_RAW.slugs),
      photoClearedSlugs,
      manualHoursSlugs,
    },
  });
  const publishedSlugs = new Set(places.map((place) => place.slug));
  const sourceBySlug = new Map(
    SOURCE_PLACES.map((place) => [place.slug, place]),
  );
  const storedHours = [...publishedSlugs].filter((slug) => {
    const source = sourceBySlug.get(slug);
    const entry = enrichment[slug];
    return Boolean(
      (source?.hours && Object.keys(source.hours).length > 0) ||
        (entry?.has_hours && entry.weekday_hours?.length),
    );
  }).length;

  const coverage = summarizeCoverageByTown(places, MUNICIPALITIES)
    .sort((a, b) => {
      const aRatio =
        a.percentages[a.weakest] / COVERAGE_TARGETS[a.weakest];
      const bRatio =
        b.percentages[b.weakest] / COVERAGE_TARGETS[b.weakest];
      return aRatio - bRatio || a.percentages.copy - b.percentages.copy || a.total - b.total;
    });
  const categoryCoverage = summarizeCoverageByCategory(places, CATEGORIES)
    .sort((a, b) => {
      const aRatio =
        a.percentages[a.weakest] / COVERAGE_TARGETS[a.weakest];
      const bRatio =
        b.percentages[b.weakest] / COVERAGE_TARGETS[b.weakest];
      return aRatio - bRatio || b.total - a.total || a.name.localeCompare(b.name);
    });
  const belowTargetCount = coverage.filter((town) => town.belowTarget).length;
  const smallCatalogs = coverage.filter((town) => town.total < REVIEW_COUNT);
  const freshHours = places.filter(
    (place) =>
      place.hours_verified &&
      place.hours &&
      Object.keys(place.hours).length > 0 &&
      isHoursFresh(place.hours_updated_at),
  ).length;
  const freshHoursPct = total === 0 ? 0 : (freshHours / total) * 100;

  const verifyDays = new Map<string, number>();
  for (const place of places) {
    const day = (place.last_verified_at ?? "").slice(0, 10) || "none";
    verifyDays.set(day, (verifyDays.get(day) ?? 0) + 1);
  }
  const distinctDays = verifyDays.size;
  const topDay = [...verifyDays.entries()].sort((a, b) => b[1] - a[1])[0];
  const verificationDatesAreBatched = distinctDays <= 2;
  const freshnessBroken = freshHoursPct < COVERAGE_TARGETS.hours;
  const freshTone: Tone = freshnessBroken ? "danger" : "positive";

  const attrProbes: Array<{
    label: string;
    match: (tag: string) => boolean;
  }> = [
    { label: "outdoor / patio", match: (tag) => tag.includes("outdoor") || tag.includes("patio") },
    { label: "dog-friendly", match: (tag) => tag.includes("dog") },
    { label: "family / kids", match: (tag) => tag.includes("family") || tag.includes("kid") },
    { label: "date-night", match: (tag) => tag.includes("date") },
    { label: "accessible", match: (tag) => tag.includes("access") || tag.includes("wheelchair") },
    { label: "reservations", match: (tag) => tag.includes("reserv") },
    { label: "wifi", match: (tag) => tag.includes("wifi") },
    { label: "live music", match: (tag) => tag.includes("live-music") || tag.includes("music") },
  ];
  const attrCounts = attrProbes.map((probe) => ({
    label: probe.label,
    count: places.filter((place) =>
      (place.tags ?? []).some((tag) => probe.match((tag ?? "").toLowerCase())),
    ).length,
  }));

  return (
    <AdminShell
      eyebrow="The state of the data"
      title="Coverage & freshness"
      intro={`${total} public places are measured against the fields that power discovery, Ask, and the next useful action.`}
    >
      <div className="mt-6">
        <SectionLabel>The vitals</SectionLabel>
        <StatStrip
          items={[
            { value: total, label: "public places" },
            {
              value: `${freshHoursPct.toFixed(1)}%`,
              label: "fresh hours",
              tone: freshTone,
            },
            {
              value: `${summary.percentages.photo.toFixed(1)}%`,
              label: "useful photos",
              tone: metricTone("photo", summary.percentages.photo),
            },
            {
              value: `${summary.percentages.copy.toFixed(1)}%`,
              label: "useful copy",
              tone: metricTone("copy", summary.percentages.copy),
            },
          ]}
        />
      </div>

      <div className="mt-8">
        <Callout
          tone={freshTone}
          title={
            <span className="inline-flex items-center gap-2">
              <StatusDot tone={freshTone} />
              Open-now readiness
            </span>
          }
        >
          {freshnessBroken ? (
            <>
              Only {freshHours} of {total} places have hours verified inside
              the seven-day policy window. {storedHours} places retain a
              stored schedule, but stale schedules are withheld from
              &ldquo;open now&rdquo; answers until they are refreshed.
              {verificationDatesAreBatched && topDay
                ? ` ${topDay[1]} places also share the ${topDay[0]} general verification date, so that field still behaves like a batch-import stamp.`
                : ""}
            </>
          ) : (
            <>
              {freshHours} of {total} places have hours verified inside the
              seven-day policy window. Stale schedules remain withheld until
              the next source refresh.
            </>
          )}
        </Callout>
      </div>

      <Section
        title="Dataset readiness"
        description="These four measures determine whether Radius can place a result, explain it, show it, and help someone act on it."
      >
        <div className="mt-3">
          <StatCards
            cols={4}
            items={(Object.keys(DIMENSIONS) as CoverageDimension[]).map(
              (dimension) => ({
                value: `${summary.percentages[dimension].toFixed(1)}%`,
                label: DIMENSIONS[dimension].label,
                tone: metricTone(
                  dimension,
                  summary.percentages[dimension],
                ),
              }),
            )}
          />
        </div>
      </Section>

      <Section
        title="What to fix next"
        aside={
          <StatusPill tone={priorities.length > 0 ? "warning" : "positive"}>
            {priorities.length} below target
          </StatusPill>
        }
        description="The queue includes only measured gaps. Targets are working quality floors, and the number on each row is the minimum record count needed to reach one."
      >
        {priorities.length === 0 && smallCatalogs.length === 0 ? (
          <AllClear>Every measured field is at or above its working target.</AllClear>
        ) : (
          <div className="mt-3">
            <HairlineList>
              {priorities.map((priority, index) => (
                <PriorityRow
                  key={priority.dimension}
                  priority={priority}
                  index={index}
                />
              ))}
              {smallCatalogs.map((town, offset) => (
                <li
                  key={`catalog-${town.slug}`}
                  className="bg-[var(--app-bg-elevated)] px-3 py-3"
                  style={
                    priorities.length + offset > 0
                      ? { borderTop: "1px solid var(--app-border)" }
                      : undefined
                  }
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-3 shrink-0 place-items-center">
                      <StatusDot tone="warning" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className="text-[14px] font-semibold leading-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          Review {town.name}&apos;s catalog coverage
                        </p>
                        <StatusPill tone="warning">Review</StatusPill>
                      </div>
                      <p
                        className="mt-1 text-[11.5px] leading-relaxed"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {town.total} public place{town.total === 1 ? "" : "s"}{" "}
                        are assigned to this town. Confirm that the catalog is
                        complete; do not add records only to satisfy the
                        reference count.
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      <Section
        title="Priority place queue"
        aside={
          <StatusPill tone={placeDataQueue.length > 0 ? "warning" : "positive"}>
            {placeDataQueue.length} shown
          </StatusPill>
        }
        description="This queue starts with records most likely to lead discovery: recommendation-eligible destinations, local favorites, stronger curation, and stronger rating evidence. It is a catalog-ranking proxy, not measured traffic."
      >
        <div className="mt-3">
          <Callout tone="cool" title="Publication boundaries">
            Copy needs a first-party source and editorial approval. Hours stay
            unknown until a current schedule passes the visitability checks. A
            photo needs owned rights or exact source attribution. A missing
            field is never filled by inference.
          </Callout>
        </div>
        {placeDataQueue.length === 0 ? (
          <AllClear>No public place is missing copy, current hours, or a publishable photo.</AllClear>
        ) : (
          <div className="mt-3">
            <HairlineList>
              {placeDataQueue.map(({ place, gaps, reasons, priorityLabel }, index) => (
                <li
                  key={place.slug}
                  className="bg-[var(--app-bg-elevated)] px-3 py-3"
                  style={
                    index > 0
                      ? { borderTop: "1px solid var(--app-border)" }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/places/${place.slug}`}
                        className="text-[14px] font-semibold leading-tight hover:underline"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {place.name}
                      </Link>
                      <p
                        className="mt-1 text-[11px] leading-relaxed"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {priorityLabel} · {place.category} · {place.source}
                      </p>
                    </div>
                    <div className="flex max-w-[48%] flex-wrap justify-end gap-1.5">
                      {gaps.map((gap) => (
                        <StatusPill key={gap} tone="warning">
                          {DIMENSIONS[gap].short}
                        </StatusPill>
                      ))}
                    </div>
                  </div>
                  <p
                    className="mt-1.5 text-[11px] leading-relaxed"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {gaps
                      .map(
                        (gap) =>
                          `${DIMENSIONS[gap].short}: ${GAP_REASON_LABELS[reasons[gap]!]}`,
                      )
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      <Section
        title="Coverage by town"
        aside={
          <StatusPill tone={belowTargetCount > 0 ? "warning" : "positive"}>
            {belowTargetCount} below target
          </StatusPill>
        }
        description="Each row uses the same catalog-wide definitions. The targets expose weak fields; they do not assume that every town should have the same number of businesses."
      >
        <div className="mt-3">
          <HairlineList>
            {coverage.map((town, index) => (
              <li
                key={town.slug}
                className="bg-[var(--app-bg-elevated)] px-3 py-3"
                style={
                  index > 0
                    ? { borderTop: "1px solid var(--app-border)" }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="text-[14px] font-semibold leading-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {town.name}
                    </p>
                    <p
                      className="mt-0.5 text-[11.5px]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {town.total} public place{town.total === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusPill tone={town.belowTarget ? "warning" : "positive"}>
                    {town.belowTarget
                      ? `${DIMENSIONS[town.weakest].short} is weakest`
                      : "Within targets"}
                  </StatusPill>
                </div>

                <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                  {(Object.keys(DIMENSIONS) as CoverageDimension[]).map(
                    (dimension) => (
                      <div
                        key={dimension}
                        className="rounded-[var(--app-radius-sm)] px-1.5 py-1.5 text-center"
                        style={{ background: "var(--app-bg-sunken)" }}
                      >
                        <p
                          className="font-mono text-[12px] font-semibold tabular-nums"
                          style={{
                            color: metricTone(
                              dimension,
                              town.percentages[dimension],
                            ) === "positive"
                              ? "var(--app-ink-2)"
                              : town.percentages[dimension] === 0
                                ? "var(--app-danger)"
                                : "var(--app-warning-press)",
                          }}
                        >
                          {town.percentages[dimension].toFixed(0)}%
                        </p>
                        <p
                          className="mt-0.5 text-[9px] uppercase tracking-[0.06em]"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {DIMENSIONS[dimension].short}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </li>
            ))}
          </HairlineList>
        </div>
      </Section>

      <Section
        title="Ask qualifier coverage"
        description="Ask and the structured search qualifiers already consume these tags. Sparse tagging limits how often Radius can prove claims such as patio seating, accessibility, or live music."
      >
        <details
          className="mt-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <summary
            className="tap-44 cursor-pointer px-3 py-2.5 text-[13px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            Show qualifier counts
          </summary>
          <div
            className="border-t p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <StatCards
              cols={4}
              items={attrCounts.map((attribute) => ({
                value: attribute.count,
                label: attribute.label,
                tone:
                  attribute.count === 0
                    ? "danger"
                    : attribute.count < 30
                      ? "warning"
                      : "neutral",
              }))}
            />
          </div>
        </details>
      </Section>

      <Section
        title="Coverage by category"
        description="This matrix exposes categories that have plenty of listings but weak hours, imagery, useful descriptions, or direct actions. It uses the same normalized public records as discovery and Ask."
      >
        <details
          className="mt-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <summary
            className="tap-44 cursor-pointer px-3 py-2.5 text-[13px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            Show {categoryCoverage.length} active categories
          </summary>
          <div
            className="border-t"
            style={{ borderColor: "var(--app-border)" }}
          >
            <HairlineList>
              {categoryCoverage.map((category, index) => (
                <li
                  key={category.slug}
                  className="bg-[var(--app-bg-elevated)] px-3 py-3"
                  style={
                    index > 0
                      ? { borderTop: "1px solid var(--app-border)" }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-[13px] font-semibold"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {category.name}
                      </p>
                      <p
                        className="text-[10.5px]"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {category.total} public place
                        {category.total === 1 ? "" : "s"}
                      </p>
                    </div>
                    <StatusPill
                      tone={category.belowTarget ? "warning" : "positive"}
                    >
                      {category.belowTarget
                        ? `${DIMENSIONS[category.weakest].short} is weakest`
                        : "Within targets"}
                    </StatusPill>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {(Object.keys(DIMENSIONS) as CoverageDimension[]).map(
                      (dimension) => (
                        <div
                          key={dimension}
                          className="rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)] px-1.5 py-1.5 text-center"
                        >
                          <p
                            className="font-mono text-[11px] font-semibold tabular-nums"
                            style={{
                              color:
                                metricTone(
                                  dimension,
                                  category.percentages[dimension],
                                ) === "positive"
                                  ? "var(--app-ink-2)"
                                  : category.percentages[dimension] === 0
                                    ? "var(--app-danger)"
                                    : "var(--app-warning-press)",
                            }}
                          >
                            {category.percentages[dimension].toFixed(0)}%
                          </p>
                          <p
                            className="mt-0.5 text-[9px] uppercase tracking-[0.06em]"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {DIMENSIONS[dimension].short}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </li>
              ))}
            </HairlineList>
          </div>
        </details>
      </Section>

      <p
        className="mt-8 text-[11px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        These measures are calculated from the public client dataset on each
        request. Fresh hours count only when a published schedule is inside the
        seven-day verification window. The source inventory currently retains{" "}
        {storedHours} schedules for rolling review. A photo counts only
        when the client may publish it. Useful copy must be a specific, complete
        sentence that is not repeated directory boilerplate. A direct action
        counts only when a stored website, phone number, menu, order link, or
        reservation link exists.
      </p>
    </AdminShell>
  );
}

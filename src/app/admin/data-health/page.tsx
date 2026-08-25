import type { Metadata } from "next";
import { Suspense } from "react";
import { Copy, PenLine } from "lucide-react";
import { PLACES } from "@/data/places";
import {
  getNeedsReviewPlaces,
  getHiddenFromDiscovery,
  hoursRefreshForAcceptedIdentity,
} from "@/lib/loaders/places";
import { computePlaceTrustReport } from "@/lib/quality/trust-report";
import { getNeedsReviewEvents } from "@/lib/loaders/events";
import SCORES_RAW from "@/data/copy-scores.json" with { type: "json" };
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };
import PLACES_CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import HOURS_REFRESH_RAW from "@/data/places-hours-refresh.json" with { type: "json" };
import SOURCE_REGISTRY_RAW from "@/data/source-registry.generated.json" with { type: "json" };
import { consumeFeedMetrics } from "@/lib/integrations/event-schema";
import {
  getAnomalies,
  getSnapshots,
} from "@/lib/integrations/feed-snapshot";
import { getDriftStats, getDrift } from "@/lib/drift-review";
import { feedStatuses, feedAttentionCount } from "@/lib/integrations/feed-registry";
import { curatedFreshnessAnomalies } from "@/lib/quality/curated-freshness";
import {
  summarizeHoursRefreshArtifact,
  withheldHoursReviewQueue,
} from "@/lib/quality/operator-coverage";
import { isGooglePlaceId } from "@/lib/provenance";
import { googleMapsPlatformRuntimeEnabled } from "@/lib/google-maps-policy";
import {
  sourceLedgerNeedsAction,
  type SourceManifestEntry,
} from "@/lib/quality/source-ledger";
import {
  buildSourceCoverageReport,
  sourceCoverageObservationsFromLedger,
  sourceSurfaceDeclarationsFromFeeds,
} from "@/lib/quality/source-coverage";
import { loadDataHealthPageRuntime } from "@/lib/loaders/dataHealthPage";
import {
  FeedSnapshotStorage,
  SourceHealthLedger,
} from "@/components/admin/SourceHealthLedger";
import { SourceCoverageControlPlane } from "@/components/admin/SourceCoverageControlPlane";
import {
  AdminShell,
  Section,
  SectionLabel,
  StatCards,
  HairlineList,
  HairlineRow,
  StatusPill,
  StatusDot,
  Tag,
  EmptyState,
  AllClear,
  Callout,
  Disclosure,
  Table,
  THead,
  Th,
  TBody,
  Tr,
  Td,
  toneTint,
  toneInkOnTint,
} from "@/components/admin/kit";

export const metadata: Metadata = {
  title: "Data health · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const SCORES = SCORES_RAW as { computed_at: string; counts: Record<string, number> };
const DEDUP = DEDUP_RAW as Record<string, { canonical: string }>;
const SOURCE_REGISTRY = SOURCE_REGISTRY_RAW as SourceManifestEntry[];

/** The shell paints immediately; the board streams in behind Suspense. This
 *  page's loads are the heaviest on the admin surface (a live iCal fetch plus
 *  snapshot hydration from Postgres), so without the split the owner stared
 *  at a blank shell for the whole wait. */
export default function DataHealth() {
  return (
    <AdminShell
      eyebrow="Phase 1 data quality"
      title="Data health"
      intro={
        <>
          Copy scores computed {new Date(SCORES.computed_at).toLocaleString()}. The nightly
          cron at /api/cron/data-health recomputes and reports these numbers.
        </>
      }
    >
      <Suspense fallback={<BoardSkeleton />}>
        <Board />
      </Suspense>
    </AdminShell>
  );
}

function BoardSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-6" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 rounded-[var(--app-radius-lg)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
      ))}
    </div>
  );
}

/** Whole days since the last vetting sweep; null when none is recorded. */
function sweepAgeDays(lastSweepAt: string | null | undefined): number | null {
  if (!lastSweepAt) return null;
  const ms = Date.parse(lastSweepAt);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function FeedSetupBadge({
  state,
}: {
  state: "ready" | "off" | "policy_hold" | "setup_needed" | "needs_attention";
}) {
  const label = {
    ready: "Ready",
    off: "Off by choice",
    policy_hold: "Policy hold",
    setup_needed: "Not set up",
    needs_attention: "Needs attention",
  }[state];
  const tone = state === "ready" ? "positive" : state === "needs_attention" ? "warning" : "muted";
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: toneTint(tone, 14), color: toneInkOnTint(tone) }}
    >
      {label}
    </span>
  );
}

async function Board() {
  const folded = Object.entries(DEDUP).filter(([s, v]) => v.canonical !== s).length;
  const clusters = new Set(Object.values(DEDUP).map((v) => v.canonical)).size;
  // The operator board is diagnostic UI, not a cron. Its live probe and every
  // optional database read are independently deadline-bound so degraded
  // telemetry becomes an explicit unavailable state, never a 300s request.
  const {
    driftDecisions,
    unparseable,
    ingestRuns,
    sourceLedger,
    snapshotStorage,
    unavailable,
  } = await loadDataHealthPageRuntime();
  const feedMetrics = consumeFeedMetrics();
  const anomalies = getAnomalies();
  const curatedAnomalies = curatedFreshnessAnomalies();
  const operationalAnomalies = [...anomalies, ...curatedAnomalies];
  const hoursSnapshotAnomaly = curatedAnomalies.find(
    (anomaly) => anomaly.source === "places-hours-refresh.json",
  );
  const snapshots = getSnapshots();
  const drift = getDriftStats(getDrift(), driftDecisions);
  const googleRuntimeEnabled = googleMapsPlatformRuntimeEnabled();
  const googlePlacesCredentialReady = Boolean(
    process.env.GOOGLE_PLACES_API_KEY?.trim(),
  );
  const googlePlaceMaintenanceReady =
    googleRuntimeEnabled && googlePlacesCredentialReady;
  // Placement validation — coordinates flagged needs_review because
  // they are missing or fall outside the county bbox. The public
  // surfaces never render these, so this view is the only place an
  // editor sees them.
  const reviewPlaces = getNeedsReviewPlaces();
  // Places hidden from discovery only because Google says closed, or because
  // they carry no Google rating/photo/summary. Surfaced so an editor can rescue
  // the false positives. "Notable" = consumer categories a field guide should
  // carry even without Google data (vs obscure retail, which is fine to hide).
  const hidden = getHiddenFromDiscovery();
  const NOTABLE_HIDDEN = new Set([
    "restaurant", "brewery", "coffee", "bar", "market", "park", "civic",
    "gallery", "museum", "book-store", "antiques", "lodging", "trail",
  ]);
  const hiddenClosed = hidden.filter((h) => h.reason === "closed");
  const hiddenThin = hidden.filter((h) => h.reason === "thin");
  const hiddenNotable = hidden.filter((h) => NOTABLE_HIDDEN.has(h.category));
  const reviewEvents = getNeedsReviewEvents();

  // Live-feed connectivity — the at-a-glance "is it collecting data?"
  // board. This is configuration state, not an uptime claim: keyless feeds
  // need no credential but can still be unavailable upstream. Runtime
  // availability and content drift live in the tripwire/snapshot sections.
  const feeds = feedStatuses();
  const feedAttention = feedAttentionCount();
  const feedSetupNeeded = feeds.keyed.filter((feed) => feed.configurationState === "setup_needed").length;
  const feedPolicyHolds = feeds.keyed.filter((feed) => feed.configurationState === "policy_hold").length;
  const feedsOff = feeds.keyed.filter((feed) => feed.configurationState === "off").length;

  const sourceCoverage = buildSourceCoverageReport(
    SOURCE_REGISTRY,
    sourceCoverageObservationsFromLedger(sourceLedger),
    sourceSurfaceDeclarationsFromFeeds([
      ...feeds.keyed,
      ...feeds.keyless,
    ]),
  );

  const unparseableTotal = unparseable.reduce((a, r) => a + r.count, 0);
  const sourceLedgerProblems = sourceLedger.filter(sourceLedgerNeedsAction);

  // Trust layer (Phase 1): provenance coverage, the confidence ladder, and
  // the stale open-assertion count that the freshness flip would blank.
  const trust = computePlaceTrustReport();
  const conf = trust.confidence;
  const clientPlaces = PLACES_CLIENT_RAW as Array<{
    slug: string;
    name: string;
    category?: string;
    municipality?: string;
    source?: string;
    google_photo_url?: string;
    google_rating?: number;
    hours?: unknown;
    hours_verified?: boolean;
    google_place_id?: string;
  }>;
  const historicalHoursRows = HOURS_REFRESH_RAW as Record<
    string,
    { place_id?: string } | undefined
  >;
  const historicalGoogleHoursSlugs = new Set(
    clientPlaces
      .filter((place) =>
        Boolean(
          hoursRefreshForAcceptedIdentity(
            historicalHoursRows[place.slug],
            place.google_place_id,
          ),
        ),
      )
      .map((place) => place.slug),
  );
  const googleDiscoveredRows = clientPlaces.filter(
    (place) => place.source === "discovered",
  ).length;
  const googleDisplayRows = clientPlaces.filter(
    (place) =>
      typeof place.google_photo_url === "string" ||
      typeof place.google_rating === "number",
  ).length;
  const historicalGoogleContentRows = clientPlaces.filter(
    (place) =>
      place.source === "discovered" ||
      typeof place.google_photo_url === "string" ||
      typeof place.google_rating === "number" ||
      historicalGoogleHoursSlugs.has(place.slug),
  ).length;
  const googleBackedSlugs = new Set(
    clientPlaces
      .filter((place) => isGooglePlaceId(place.google_place_id))
      .map((place) => place.slug),
  );
  const hoursArtifact = summarizeHoursRefreshArtifact(
    HOURS_REFRESH_RAW as Record<string, unknown>,
    googleBackedSlugs,
  );
  const hoursCycle = hoursArtifact.cycle;
  const hoursReviewQueue = withheldHoursReviewQueue(
    HOURS_REFRESH_RAW as Record<string, unknown>,
    clientPlaces,
  );

  // THE ONE NUMBER — the nightly cron collapses every gate (catalog gates +
  // the end-to-end tripwires: photo rot, transit zero-routes, empty event
  // assembly, degraded ask) into one "N/M green" ingest_runs row under
  // source "tripwires". Read it back here so the answer to "is the app
  // quietly broken?" leads the board.
  const tripwire = ingestRuns.find((r) => r.source === "tripwires");

  const rows: Array<[string, string, string]> = [
    ["Provenance coverage", `${trust.provenance.coverage_pct}%`, "target 100%, every row carries the seven fields"],
    ["Confidence ladder", `${conf.curated} / ${conf.partner} / ${conf.verified} / ${conf.scraped}`, "curated / partner / verified / scraped"],
    ["Open assertions", String(trust.open_assertions.asserting), `${trust.open_assertions.stale_or_missing} stale, the freshness flip's blast radius`],
    ["Places (raw)", String(PLACES.length), ""],
    ["Duplicate clusters", String(clusters), `${folded} records fold`],
    [
      "Current fresh hours",
      `${trust.fresh_hours.fresh_count} / ${trust.fresh_hours.total_count} (${trust.fresh_hours.coverage_pct}%)`,
      `target ${trust.fresh_hours.target_count} (${trust.fresh_hours.target_pct}%); Open Now ${trust.fresh_hours.open_now_eligible ? "eligible" : "unavailable"}`,
    ],
    [
      "Hours refresh cycle",
      `${hoursCycle.completedDays} / ${hoursCycle.days} buckets`,
      `${hoursCycle.state}; ${hoursArtifact.freshRefreshRows} of ${hoursArtifact.expectedGoogleBackedPlaces} Google-backed places refreshed within policy`,
    ],
    ["Scraped copy", `${SCORES.counts.scraped}`, `${((SCORES.counts.scraped / PLACES.length) * 100).toFixed(1)}% of records`],
    [
      "Known historical Google content (lower bound)",
      `${historicalGoogleContentRows} / ${clientPlaces.length}`,
      `${googleDiscoveredRows} Google-discovered rows; ${googleDisplayRows} rows with Google rating/photo fields; this row-level count does not yet inventory every derived artifact`,
    ],
    ["Clean copy", `${SCORES.counts.auto_clean}`, "auto_clean, not yet editor-reviewed"],
    ["RADIUS_DEDUPE", process.env.RADIUS_DEDUPE !== "0" ? "on" : "off", "default on; set 0 only for rollback"],
    ["HOURS_GATE", process.env.HOURS_GATE !== "0" ? "on" : "off", "default on"],
    ["RADIUS_EVENTS_BY_TOWN", process.env.RADIUS_EVENTS_BY_TOWN === "1" ? "on" : "off", "default off = today's production"],
  ];

  // ── The action digest: every red and amber condition on this board,
  // gathered into one list so the operator diagnoses at the top instead
  // of scanning ten sections. Rows exist only when something is wrong.
  const badRuns = ingestRuns.filter(
    (r) => r.source !== "tripwires" && (r.status === "error" || r.recordsFailed > 0 || r.stale),
  );
  const flaggedCoords = reviewPlaces.length + reviewEvents.length;
  const sweepDays = sweepAgeDays(drift.last_sweep_at);
  const actions: { label: string; fix: string }[] = [];
  if (tripwire && tripwire.status !== "ok") {
    actions.push({
      label: `${tripwire.recordsFailed} of ${tripwire.recordsIn} tripwire gates are red`,
      fix: "The Tripwires section names them; each maps to a failure class that degrades politely.",
    });
  }
  if (tripwire?.stale) {
    actions.push({
      label: "The tripwire run is stale",
      fix: "The data-health cron itself may have stopped firing. Check /api/cron/data-health.",
    });
  }
  if (feedAttention > 0) {
    actions.push({
      label: `${feedAttention} enabled feed${feedAttention === 1 ? " has" : "s have"} incomplete setup`,
      fix: "See Feed setup. These are the only configuration rows where an attempted activation cannot run.",
    });
  }
  if (badRuns.length > 0) {
    actions.push({
      label: `${badRuns.length} ingest source${badRuns.length === 1 ? " is" : "s are"} red or stale`,
      fix: "See Ingest runs. A dead cron means that source's events go quietly stale.",
    });
  }
  // FIRST, before any judgement built on those reads. When a telemetry read
  // does not answer, its fallback is an empty list, and every check below
  // reads an empty list as "nothing wrong". That is how this board came to
  // print an explicit all-clear over three stale and seven attention-needing
  // sources it had never actually read. Name the blind spot at the top, and
  // rank it above the findings, because a finding computed from an unread
  // table is not a finding.
  if (unavailable.length > 0) {
    actions.push({
      label: `${unavailable.length} health read${unavailable.length === 1 ? "" : "s"} did not answer: ${unavailable.join(", ")}`,
      fix: "Everything below is computed from what DID load, so treat any green in those sections as unknown rather than clear. Reload first; if it persists, check the production database connection.",
    });
  }
  if (sourceLedgerProblems.length > 0) {
    actions.push({
      label: `${sourceLedgerProblems.length} source ledger entr${sourceLedgerProblems.length === 1 ? "y needs" : "ies need"} attention`,
      fix: "See Source health ledger. It separates configuration, the latest attempt, publication, and freshness.",
    });
  }
  if (!snapshotStorage) {
    actions.push({
      label: "Snapshot storage telemetry is unavailable",
      fix: "Check the production database connection and the bounded feed-snapshot telemetry query before treating storage as healthy.",
    });
  } else if (snapshotStorage.duplicateCandidates > 0) {
    actions.push({
      label: `${snapshotStorage.duplicateCountCapped ? "At least " : ""}${snapshotStorage.duplicateCandidates.toLocaleString()} completed-day snapshots can be compacted`,
      fix: "Review Snapshot storage, then use the dry-run-first bounded maintenance command. It preserves one row per source and UTC day.",
    });
  }
  if (anomalies.length > 0) {
    actions.push({
      label: `${anomalies.length} feed anomal${anomalies.length === 1 ? "y" : "ies"} flagged`,
      fix: "Compare the flagged sources against the Distribution snapshot before trusting the batch.",
    });
  }
  if (trust.fresh_hours.below_gate) {
    actions.push({
      label: `Only ${trust.fresh_hours.fresh_count} of ${trust.fresh_hours.total_count} public places have current verified hours`,
      fix: hoursSnapshotAnomaly?.detail ??
        `Open Now stays unavailable until ${trust.fresh_hours.target_count} places (${trust.fresh_hours.target_pct}%) have fresh schedules.`,
    });
  } else if (hoursSnapshotAnomaly) {
    actions.push({
      label: "The committed hours snapshot is empty or stale",
      fix: hoursSnapshotAnomaly.detail,
    });
  }
  if (hoursCycle.state === "stalled") {
    actions.push({
      label: `The hours refresh cycle is stalled at ${hoursCycle.completedDays} of ${hoursCycle.days} buckets`,
      fix: `Missing cycle days: ${hoursCycle.missingDays.join(", ") || "none"}. Underfilled cycle days: ${hoursCycle.underfilledDays.join(", ") || "none"}. Check the Vercel hours-refresh runs before the next data-steward pull.`,
    });
  }
  if (hoursReviewQueue.length > 0) {
    actions.push({
      label: `${hoursReviewQueue.length} current provider schedule${hoursReviewQueue.length === 1 ? " is" : "s are"} safely withheld`,
      fix: "Review Hours waiting for evidence. Confirm public visitability against a first-party source before allowing a near-all-day claim into Open Now.",
    });
  }
  if (flaggedCoords > 0) {
    actions.push({
      label: `${flaggedCoords} coordinate${flaggedCoords === 1 ? "" : "s"} flagged for review`,
      fix: "Fix the source rows in src/data/places.ts or src/data/events.ts; they clear next build.",
    });
  }
  if (hiddenNotable.length > 0) {
    actions.push({
      label: `${hiddenNotable.length} notable place${hiddenNotable.length === 1 ? "" : "s"} hidden from discovery`,
      fix: "Rescue false positives with a places-overrides patch: clearGoogle, hero_image, or short_blurb.",
    });
  }
  if (drift.undecided > 0) {
    actions.push({
      label: `${drift.undecided} drift change${drift.undecided === 1 ? "" : "s"} undecided`,
      fix: "Decide them at /admin/drift-review so the catalog stays honest.",
    });
  }
  if (sweepDays !== null && sweepDays >= 14) {
    actions.push({
      label: `The vetting sweep is ${sweepDays} days old`,
      fix: googlePlaceMaintenanceReady
        ? "Google runtime is explicitly authorized. Run npm run vet with its bounded live confirmation to refresh the drift diff."
        : googleRuntimeEnabled
          ? "Google runtime authorization is recorded, but the dedicated Places credential is missing. Do not run vet until GOOGLE_PLACES_API_KEY is restored; use independent sources meanwhile."
          : "Google runtime is on policy hold. Do not re-pull it from this alert; review first-party, owner, Overture, OSM, and official sources while the historical-content migration is open.",
    });
  }
  if (unparseableTotal > 0) {
    actions.push({
      label: `${unparseableTotal.toLocaleString()} location${unparseableTotal === 1 ? "" : "s"} could not be geocoded`,
      fix: "They ship on feed-default centroids until a parser rule or an upstream address fix lands.",
    });
  }

  return (
    <>
      <Section
        title="What needs action"
        aside={
          actions.length > 0 ? (
            <StatusPill tone="warning">{actions.length}</StatusPill>
          ) : (
            <StatusPill tone="positive">all green</StatusPill>
          )
        }
        description="Every red and amber condition on this board, in one list. Each row says where to look and what fixes it."
      >
        {actions.length === 0 ? (
          <AllClear>Every check on this board is green.</AllClear>
        ) : (
          <div className="mt-3">
            <HairlineList>
              {actions.map((a, i) => (
                <HairlineRow key={a.label} index={i} dot="warning" title={a.label} subtitle={a.fix} />
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      <SourceCoverageControlPlane report={sourceCoverage} />
      <SourceHealthLedger rows={sourceLedger} />
      <FeedSnapshotStorage telemetry={snapshotStorage} />

      {/* ── Tripwires — the one number. Written nightly by the data-health
          cron; red means a politely-degrading failure class (photo rot,
          transit zero-routes, dead event assembly, degraded ask) or a
          catalog gate tripped. ──────────────────────────────────────── */}
      <Section
        title="Tripwires"
        aside={
          tripwire ? (
            <StatusPill tone={tripwire.status === "ok" && !tripwire.stale ? "positive" : "warning"}>
              {`${tripwire.recordsUpserted}/${tripwire.recordsIn} green`}
            </StatusPill>
          ) : undefined
        }
        description="Nightly end-to-end checks against the failure classes that degrade politely: sampled place photos, transit route count, today's event assembly, and a canary ask, alongside the catalog gates (hours coverage, provenance, coordinates, feeds, freshness, database)."
      >
        {!tripwire ? (
          <EmptyState>
            No tripwire run recorded yet. The first row lands with the next nightly
            data-health cron (or no database in this environment).
          </EmptyState>
        ) : tripwire.status === "ok" && !tripwire.stale ? (
          <EmptyState tone="positive">
            All {tripwire.recordsIn} gates green · checked{" "}
            {tripwire.startedAt ? new Date(tripwire.startedAt).toLocaleString() : "recently"}.
          </EmptyState>
        ) : (
          <div className="mt-3 space-y-2">
            {tripwire.status !== "ok" && (
              <Callout tone="warning" title="Red gates">
                {tripwire.error ?? `${tripwire.recordsFailed} of ${tripwire.recordsIn} gates red.`}
              </Callout>
            )}
            {tripwire.stale && (
              <Callout tone="warning" title="Run is stale">
                Last tripwire run{" "}
                {tripwire.startedAt ? new Date(tripwire.startedAt).toLocaleString() : "unknown"}. The
                data-health cron itself may have stopped firing.
              </Callout>
            )}
          </div>
        )}
      </Section>

      {/* Configuration is not health. Off and policy-held sources are safe;
          only an incomplete activation belongs in the action queue. */}
      <Section
        title="Feed setup"
        aside={
          <StatusPill tone={feedAttention === 0 ? "positive" : "warning"}>
            {feedAttention === 0
              ? "No broken activations"
              : `${feedAttention} activation${feedAttention === 1 ? "" : "s"} need attention`}
          </StatusPill>
        }
        description={`Configuration only: ${feedPolicyHolds} held by policy, ${feedsOff} intentionally off, and ${feedSetupNeeded} not set up. Those are not runtime failures. Collection and publication evidence appear in the source ledger.`}
      >
        <div className="mt-3">
          <HairlineList>
            {feeds.keyed.map((f, i) => (
              <HairlineRow
                key={f.name}
                index={i}
                dot={f.configurationState === "ready" ? "positive" : f.configurationState === "needs_attention" ? "warning" : "neutral"}
                title={f.name}
                subtitle={`${f.powers} ${f.configurationNote}`}
                badge={<FeedSetupBadge state={f.configurationState} />}
              />
            ))}
          </HairlineList>
        </div>

        <Disclosure summary={`${feeds.keyless.length} public feeds need no deployment credential`}>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {feeds.keyless.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-[12px]">
                <StatusDot tone="neutral" />
                <span className="font-medium" style={{ color: "var(--app-ink-2)" }}>{f.name}</span>
                <span className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>· {f.powers}</span>
              </div>
            ))}
          </div>
        </Disclosure>
      </Section>

      {/* ── Catalog integrity + pipeline switches — the ledger of counts
          the nightly cron computes, notes and all. ──────────────────── */}
      <section className="mt-8">
        <SectionLabel>Catalog &amp; pipeline</SectionLabel>
        <Table>
          <TBody>
            {rows.map(([k, v, note]) => (
              <Tr key={k}>
                <Td>{k}</Td>
                <Td mono semibold>{v}</Td>
                <Td tone="muted">{note}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <Disclosure
          summary={`Hours cycle detail · ${hoursCycle.completedDays}/${hoursCycle.days} buckets · ${hoursCycle.state}`}
        >
          <Table>
            <THead>
              <Th align="right">Cycle day</Th>
              <Th align="right">Expected</Th>
              <Th align="right">Refreshed</Th>
              <Th align="right">Schedules</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {hoursCycle.buckets.map((bucket) => (
                <Tr key={bucket.cycleDay}>
                  <Td align="right" mono>{bucket.cycleDay}</Td>
                  <Td align="right" mono>{bucket.expected}</Td>
                  <Td align="right" mono>{bucket.refreshed}</Td>
                  <Td align="right" mono>{bucket.withSchedule}</Td>
                  <Td
                    semibold
                    tone={bucket.complete ? "positive" : "warning"}
                  >
                    {bucket.complete
                      ? "Minimum met"
                      : bucket.refreshed > 0
                        ? "Underfilled"
                        : "Waiting"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Disclosure>
      </section>

      <Section
        title="Hours waiting for evidence"
        aside={
          <StatusPill tone={hoursReviewQueue.length > 0 ? "warning" : "positive"}>
            {hoursReviewQueue.length > 0 ? hoursReviewQueue.length : "clear"}
          </StatusPill>
        }
        description="Fresh provider schedules that Radius deliberately keeps out of Open Now because they contain an all-week 24-hour claim or a 20-plus-hour window. This is the human review queue between the paid feed and the public answer."
      >
        {hoursReviewQueue.length === 0 ? (
          <AllClear>No fresh provider schedule is waiting for visitability evidence.</AllClear>
        ) : (
          <Disclosure open summary={`Review ${Math.min(50, hoursReviewQueue.length)} highest-risk schedules`}>
            <Table>
              <THead>
                <Th>Place</Th>
                <Th>Reason</Th>
                <Th>Provider schedule</Th>
                <Th>Checked</Th>
              </THead>
              <TBody>
                {hoursReviewQueue.slice(0, 50).map((candidate) => (
                  <Tr key={candidate.slug}>
                    <Td>
                      <span className="block font-semibold">{candidate.name}</span>
                      <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                        {candidate.slug}
                      </span>
                      <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                        {[candidate.category, candidate.municipality].filter(Boolean).join(" · ")}
                      </span>
                    </Td>
                    <Td semibold tone="warning">
                      {candidate.reason === "all-week-24h" ? "24/7 claim" : "20+ hour window"}
                      {candidate.review === "expired" ? " · review expired" : " · needs source"}
                    </Td>
                    <Td tone="muted">{candidate.weekdayHours.join(" · ")}</Td>
                    <Td tone="muted">
                      {candidate.refreshedAt
                        ? new Date(candidate.refreshedAt).toLocaleString()
                        : "unknown"}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {hoursReviewQueue.length > 50 && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {hoursReviewQueue.length - 50} more schedules remain withheld. Export the full queue before reviewing in batches.
              </p>
            )}
          </Disclosure>
        )}
      </Section>

      <Section
        title="Placement (needs review)"
        description={
          <>
            Coordinates that are missing, malformed, or outside the real
            Frederick County outline and its documented straddle allowance.
            They stay out of public results, but the rejected source row remains
            here with its address and reason so an editor can correct or
            deliberately remove it.
          </>
        }
      >
        <div className="mt-3">
          <StatCards
            cols={2}
            items={[
              { value: reviewPlaces.length.toLocaleString(), label: "Places flagged", tone: reviewPlaces.length > 0 ? "warning" : "positive" },
              { value: reviewEvents.length.toLocaleString(), label: "Events flagged", tone: reviewEvents.length > 0 ? "warning" : "positive" },
            ]}
          />
        </div>
        {(reviewPlaces.length > 0 || reviewEvents.length > 0) && (
          <Disclosure summary={`Show up to ${Math.min(100, reviewPlaces.length + reviewEvents.length)} rows`}>
            <HairlineList>
              {reviewPlaces.slice(0, 100).map((p, i) => (
                <HairlineRow
                  key={`p:${p.slug}`}
                  index={i}
                  title={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Tag tone="muted">place</Tag>
                      <span style={{ color: "var(--app-ink)" }}>{p.name}</span>
                      <span className="font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                        {p.slug}
                      </span>
                    </span>
                  }
                  meta={[
                    p.rejection_reason.replace(/-/g, " "),
                    p.source,
                    p.address || "no address",
                    `declared ${p.municipality || "no municipality"}`,
                    p.geom
                      ? `${p.geom.lng.toFixed(4)}, ${p.geom.lat.toFixed(4)}`
                      : "no coordinate",
                  ].join(" · ")}
                />
              ))}
              {reviewEvents
                .slice(0, Math.max(0, 100 - reviewPlaces.length))
                .map((e, i) => (
                  <HairlineRow
                    key={`e:${e.slug}`}
                    index={reviewPlaces.slice(0, 100).length + i}
                    title={
                      <span className="inline-flex items-center gap-1.5">
                        <Tag tone="cool">event</Tag>
                        <span className="font-mono text-[12px]">{e.slug}</span>
                      </span>
                    }
                    meta={e.geom ? `${e.geom.lng.toFixed(4)}, ${e.geom.lat.toFixed(4)}` : "no geom"}
                  />
                ))}
            </HairlineList>
          </Disclosure>
        )}
      </Section>

      <Section
        title="Hidden from discovery"
        description={
          <>
            Places that clear relevance, coordinates, and season but never reach a
            user because Google reports them closed ({hiddenClosed.length}), or
            because they carry no Google rating, photo, or summary ({hiddenThin.length}).
            The intentional B2B long-tail is not counted here. Rescue a false
            positive with a places-overrides patch: <span className="font-mono">clearGoogle</span> for
            a wrong closure, or a <span className="font-mono">hero_image</span> / <span className="font-mono">short_blurb</span> to
            clear the thin-data gate.
          </>
        }
      >
        <div className="mt-3">
          <StatCards
            cols={2}
            items={[
              { value: hidden.length.toLocaleString(), label: "Total hidden" },
              { value: hiddenNotable.length.toLocaleString(), label: "Notable · field guide", tone: hiddenNotable.length > 0 ? "warning" : "positive" },
            ]}
          />
        </div>
        {hiddenNotable.length > 0 && (
          <Disclosure open summary={`Review the ${Math.min(40, hiddenNotable.length)} notable places most likely to be false positives`}>
            <HairlineList>
              {hiddenNotable.slice(0, 40).map((h, i) => (
                <HairlineRow
                  key={h.slug}
                  index={i}
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      <Tag tone={h.reason === "closed" ? "warning" : "muted"}>{h.reason}</Tag>
                      <span style={{ color: "var(--app-ink)" }}>{h.name}</span>
                      {/* slug for the overrides patch (hidden places have no live page) */}
                      <span className="font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>{h.slug}</span>
                    </span>
                  }
                  meta={`${h.category} · ${h.municipality} · ${h.source}`}
                />
              ))}
            </HairlineList>
          </Disclosure>
        )}
      </Section>

      <Section
        title="Place drift (last vetting sweep)"
        description={
          <>
            The last provider sweep compared business status, hours, website,
            phone, rating, and address against stored enrichment. New details,
            hours, status, and search refreshes stay blocked while the
            maintenance policy hold is active. Existing attributed photo
            delivery is a separate path. Use independent sources for current
            review, and inspect recorded changes at{" "}
            <code>/admin/drift-review</code>.
          </>
        }
      >
        <div className="mt-3">
          <StatCards
            cols={4}
            items={[
              { value: drift.drift_rows.toLocaleString(), label: "Drift rows", tone: "warning" },
              { value: drift.total_changes.toLocaleString(), label: "Changes", tone: "neutral" },
              { value: drift.accepted.toLocaleString(), label: "Accepted", tone: "positive" },
              { value: drift.undecided.toLocaleString(), label: "Pending", tone: "cool" },
            ]}
          />
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {drift.last_sweep_at
            ? `Last swept ${new Date(drift.last_sweep_at).toLocaleString()}.`
            : "No sweep recorded yet."}
        </p>
      </Section>

      <Section
        title="Operational anomaly flags"
        description="Current feed drift and committed snapshot freshness appear together here. A quiet upstream failure or an expired materialized file is named before it can look like a quiet day."
      >
        {operationalAnomalies.length === 0 ? (
          <EmptyState tone="positive">No anomalies on the last fetch.</EmptyState>
        ) : (
          <div className="mt-3 space-y-2">
            {operationalAnomalies.map((a, i) => (
              <Callout
                key={`${a.source}-${a.kind}-${i}`}
                tone="warning"
                title={
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span>{a.source}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                      {a.kind.replace(/_/g, " ")}
                    </span>
                  </span>
                }
              >
                {a.detail}
              </Callout>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Distribution snapshot"
        description="The shape of each feed's most recent batch. What anomalies are computed against."
      >
        {snapshots.length === 0 ? (
          <EmptyState>No snapshot recorded in this process yet.</EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Source</Th>
              <Th align="right">Count</Th>
              <Th align="right">Free</Th>
              <Th align="right">Empty desc</Th>
              <Th>Top venue</Th>
              <Th>Top category</Th>
            </THead>
            <TBody>
              {snapshots.map(({ source, current }) => (
                <Tr key={source}>
                  <Td semibold>{source}</Td>
                  <Td align="right" mono>{current.count}</Td>
                  <Td align="right" mono>{(current.free_ratio * 100).toFixed(0)}%</Td>
                  <Td align="right" mono>{(current.empty_desc_ratio * 100).toFixed(0)}%</Td>
                  <Td tone="muted">
                    {current.top_venue
                      ? `${current.top_venue.name} · ${(current.top_venue.share * 100).toFixed(0)}%`
                      : "–"}
                  </Td>
                  <Td tone="muted">
                    {current.top_category
                      ? `${current.top_category.name} · ${(current.top_category.share * 100).toFixed(0)}%`
                      : "–"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section
        title="Feed validation (last fetch)"
        description="Schema-checked at the integration boundary. Rows that fail the contract are dropped and the reason is recorded here, so an upstream feed change is visible before it lands on a card."
      >
        {feedMetrics.length === 0 ? (
          <EmptyState>No feed fetched in this process yet.</EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Source</Th>
              <Th align="right">Passed</Th>
              <Th align="right">Dropped</Th>
              <Th>Top reasons</Th>
            </THead>
            <TBody>
              {feedMetrics.map((m) => (
                <Tr key={m.source}>
                  <Td semibold>{m.source}</Td>
                  <Td align="right" mono tone={m.passed > 0 ? "positive" : "muted"}>{m.passed}</Td>
                  <Td align="right" mono semibold tone={m.dropped > 0 ? "warning" : "muted"}>{m.dropped}</Td>
                  <Td tone="muted">
                    {m.reasons.length === 0 ? (
                      <span style={{ color: "var(--app-positive)" }}>–</span>
                    ) : (
                      <ul className="space-y-0.5 text-[12px]">
                        {m.reasons.map((r) => (
                          <li key={r.key}>
                            <span className="tabular-nums" style={{ color: "var(--app-ink-2)" }}>{r.count}×</span>{" "}
                            {r.key}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section
        title="Ingest runs (last per source)"
        description={
          <>
            The most recent run of each cron-driven ingest (<code>ingest_runs</code>).
            A red status or a stale timestamp means the source&apos;s cron has
            failed or stopped firing, so its events go quietly stale.
          </>
        }
      >
        {ingestRuns.length === 0 ? (
          <EmptyState>No ingest runs recorded (or no database in this environment).</EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th>Last run</Th>
              <Th align="right">In</Th>
              <Th align="right">Upserted</Th>
              <Th align="right">Failed</Th>
            </THead>
            <TBody>
              {ingestRuns.map((r) => {
                const bad =
                  r.status !== "ok" ||
                  r.recordsFailed > 0 ||
                  r.stale;
                return (
                  <Tr key={r.source}>
                    <Td semibold>{r.source}</Td>
                    <Td semibold tone={bad ? "warning" : "positive"}>{r.status ?? "–"}</Td>
                    <Td tone={r.stale ? "warning" : "muted"}>{r.startedAt ? new Date(r.startedAt).toLocaleString() : "–"}</Td>
                    <Td align="right" mono>{r.recordsIn}</Td>
                    <Td align="right" mono>{r.recordsUpserted}</Td>
                    <Td align="right" mono semibold tone={r.recordsFailed > 0 ? "warning" : "muted"}>{r.recordsFailed}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>

      <Section
        title="Unparseable locations (geocode queue)"
        description={
          <>
            Locations the ingest pipeline could not parse or geocode, logged to{" "}
            <code>unparseable_locations</code> per source. The event still ships
            in discovery. Surfaces may place it at the municipality level, but
            Radius must not claim a precise venue or distance until the address
            is fixed upstream or a parser rule is added.
          </>
        }
      >
        {unparseable.length === 0 ? (
          <EmptyState tone="positive">None queued (or no database in this environment).</EmptyState>
        ) : (
          <>
            <p className="mt-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              <span className="font-semibold tabular-nums" style={{ color: "var(--app-warning-press)" }}>
                {unparseableTotal.toLocaleString()}
              </span>{" "}
              across {unparseable.length} source{unparseable.length === 1 ? "" : "s"}.
            </p>
            <Table>
              <THead>
                <Th>Source</Th>
                <Th align="right">Count</Th>
                <Th>Most recent sample</Th>
              </THead>
              <TBody>
                {unparseable.map((r) => (
                  <Tr key={r.source}>
                    <Td semibold>{r.source}</Td>
                    <Td align="right" mono semibold tone="warning">{r.count.toLocaleString()}</Td>
                    <Td tone="muted">{r.sample ?? "–"}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Section>

      <section className="mt-8">
        <SectionLabel>More review tools</SectionLabel>
        <HairlineList>
          <HairlineRow index={0} href="/admin/dedup-review" icon={Copy} title="Dedup review" />
          <HairlineRow index={1} href="/admin/copy-review" icon={PenLine} title="Copy review" />
        </HairlineList>
      </section>
    </>
  );
}

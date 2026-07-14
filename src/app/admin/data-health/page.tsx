import type { Metadata } from "next";
import { Copy, PenLine } from "lucide-react";
import { PLACES } from "@/data/places";
import { rankPlaces, hoursCoverage, getNeedsReviewPlaces, getHiddenFromDiscovery } from "@/lib/loaders/places";
import { computePlaceTrustReport } from "@/lib/quality/trust-report";
import { getNeedsReviewEvents } from "@/lib/loaders/events";
import { FREDERICK_COUNTY_BBOX } from "@/lib/geo";
import SCORES_RAW from "@/data/copy-scores.json" with { type: "json" };
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { consumeFeedMetrics } from "@/lib/integrations/event-schema";
import {
  getAnomalies,
  getSnapshots,
  hydrateSnapshots,
} from "@/lib/integrations/feed-snapshot";
import { getDriftStats, getDrift, getDecisions as getDriftDecisions } from "@/lib/drift-review";
import { feedStatuses, darkFeedCount } from "@/lib/integrations/feed-registry";
import { getUnparseableLocationSummary, getRecentIngestRuns } from "@/lib/quality/db-health";
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
  Callout,
  Disclosure,
  Table,
  THead,
  Th,
  TBody,
  Tr,
  Td,
  toneTint,
} from "@/components/admin/kit";

export const metadata: Metadata = {
  title: "Data health · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const SCORES = SCORES_RAW as { computed_at: string; counts: Record<string, number> };
const DEDUP = DEDUP_RAW as Record<string, { canonical: string }>;

export default async function DataHealth() {
  const all = rankPlaces({});
  const coverage = hoursCoverage(all);
  const folded = Object.entries(DEDUP).filter(([s, v]) => v.canonical !== s).length;
  const clusters = new Set(Object.values(DEDUP).map((v) => v.canonical)).size;
  // Hydrate the in-memory rolling buffer from Postgres BEFORE the
  // live fetch so anomaly comparisons see snapshot history across
  // deploys + cold starts, not just this worker's lifetime. Then
  // the live fetch records the current snapshot (in-memory + DB).
  // No-op when DATABASE_URL is unset (the buffer is the source of
  // truth in dev).
  await hydrateSnapshots();
  await getLiveEvents(60).catch(() => null);
  const feedMetrics = consumeFeedMetrics();
  const anomalies = getAnomalies();
  const snapshots = getSnapshots();
  const drift = getDriftStats(getDrift(), await getDriftDecisions());
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
  // board. Keyless feeds are live wherever the network allows; keyed
  // feeds are dark until their env var is set in the deployment.
  const feeds = feedStatuses();
  const dark = darkFeedCount();

  // Geocode-failure queue (obs-3). The ingest pipeline logs every location
  // it could not parse/geocode to `unparseable_locations`, but nothing read
  // it — failures accumulated invisibly. Fail-soft to [] without a DB.
  const unparseable = await getUnparseableLocationSummary();
  const unparseableTotal = unparseable.reduce((a, r) => a + r.count, 0);

  // Ingest-run telemetry (obs-2): the most recent run per cron-driven source,
  // so a silent partial-failure ingest is visible. Staleness is computed in the
  // loader (keeps this server render pure). Fail-soft to [] without a DB.
  const ingestRuns = await getRecentIngestRuns();

  // Trust layer (Phase 1): provenance coverage, the confidence ladder, and
  // the stale open-assertion count that the freshness flip would blank.
  const trust = computePlaceTrustReport();
  const conf = trust.confidence;

  const rows: Array<[string, string, string]> = [
    ["Provenance coverage", `${trust.provenance.coverage_pct}%`, "target 100%, every row carries the seven fields"],
    ["Confidence ladder", `${conf.curated} / ${conf.partner} / ${conf.verified} / ${conf.scraped}`, "curated / partner / verified / scraped"],
    ["Open assertions", String(trust.open_assertions.asserting), `${trust.open_assertions.stale_or_missing} stale, the freshness flip's blast radius`],
    ["Places (raw)", String(PLACES.length), ""],
    ["Duplicate clusters", String(clusters), `${folded} records fold`],
    ["Hours coverage", `${(coverage * 100).toFixed(1)}%`, "target 60%, gate hides Open-now below it"],
    ["Scraped copy", `${SCORES.counts.scraped}`, `${((SCORES.counts.scraped / PLACES.length) * 100).toFixed(1)}% of records`],
    ["Clean copy", `${SCORES.counts.auto_clean}`, "auto_clean, not yet editor-reviewed"],
    ["RADIUS_DEDUPE", process.env.RADIUS_DEDUPE === "1" ? "on" : "off", "default off = today's production"],
    ["HOURS_GATE", process.env.HOURS_GATE === "1" ? "on" : "off", "default off"],
    ["RADIUS_EVENTS_BY_TOWN", process.env.RADIUS_EVENTS_BY_TOWN === "1" ? "on" : "off", "default off = today's production"],
  ];

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
      {/* ── Live feed connectivity — the "is it collecting data?" board.
          Keyed feeds go green when their env var is set in the
          deployment, amber ("needs key") until then; keyless feeds are
          live wherever outbound network is allowed. ──────────────────── */}
      <Section
        title="Live feed connectivity"
        aside={
          <StatusPill tone={dark === 0 ? "positive" : "warning"}>
            {dark === 0 ? "All keyed feeds live" : `${dark} keyed feed${dark === 1 ? "" : "s"} dark`}
          </StatusPill>
        }
        description={
          dark === 0
            ? "Every keyed feed has its API key configured."
            : "Dark feeds fail soft to empty, nothing breaks, but those layers stay blank until the key is set in the Vercel project env."
        }
      >
        <div className="mt-3">
          <HairlineList>
            {feeds.keyed.map((f, i) => (
              <HairlineRow
                key={f.name}
                index={i}
                dot={f.configured ? "positive" : "warning"}
                title={f.name}
                subtitle={f.powers}
                badge={
                  f.configured ? (
                    <span className="shrink-0 text-[11px] font-semibold" style={{ color: "var(--app-positive)" }}>Live</span>
                  ) : (
                    <code
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ background: toneTint("warning", 14), color: "var(--app-warning-press)" }}
                    >
                      set {f.env}
                    </code>
                  )
                }
              />
            ))}
          </HairlineList>
        </div>

        <Disclosure summary={`${feeds.keyless.length} keyless feeds (live without a key)`}>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {feeds.keyless.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-[12px]">
                <StatusDot tone="positive" />
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
      </section>

      <Section
        title="Placement (needs review)"
        description={
          <>
            Coordinates that fall outside the Frederick County bbox
            (lat&nbsp;{FREDERICK_COUNTY_BBOX.south}–{FREDERICK_COUNTY_BBOX.north},
            lng&nbsp;{FREDERICK_COUNTY_BBOX.west}–{FREDERICK_COUNTY_BBOX.east})
            or are missing entirely. These are dropped from every public
            surface so a mispositioned marker can never reach a user.
            Fix the source row in <code>src/data/places.ts</code> or{" "}
            <code>src/data/events.ts</code> and the row clears next build.
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
          <Disclosure summary={`Show the first ${Math.min(20, reviewPlaces.length + reviewEvents.length)} rows`}>
            <HairlineList>
              {reviewPlaces.slice(0, 20).map((p, i) => (
                <HairlineRow
                  key={`p:${p.slug}`}
                  index={i}
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      <Tag tone="muted">place</Tag>
                      <span className="font-mono text-[12px]">{p.slug}</span>
                    </span>
                  }
                  meta={p.geom ? `${p.geom.lng.toFixed(4)}, ${p.geom.lat.toFixed(4)}` : "no geom"}
                />
              ))}
              {reviewEvents.slice(0, 20).map((e, i) => (
                <HairlineRow
                  key={`e:${e.slug}`}
                  index={reviewPlaces.slice(0, 20).length + i}
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
            Periodic Google re-pull diffs business_status / hours / website /
            phone / rating / address against the stored enrichment so the
            editor can keep the catalog honest. Run <code>npm run vet</code>
            to refresh; review changes at <code>/admin/drift-review</code>.
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
        title="Anomaly flags (current vs prior fetch)"
        description="Rolling per-source comparison. Flags fire when the distribution shifts in a way that usually means an upstream regression: row counts crash, the Free share swings wildly, a single venue claims the whole batch, or descriptions go missing."
      >
        {anomalies.length === 0 ? (
          <EmptyState tone="positive">No anomalies on the last fetch.</EmptyState>
        ) : (
          <div className="mt-3 space-y-2">
            {anomalies.map((a, i) => (
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
                const bad = r.status === "error" || r.recordsFailed > 0 || r.stale;
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
            (never dropped), but it lands on a feed-default centroid until the
            address is fixed upstream or a parser rule is added.
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
    </AdminShell>
  );
}

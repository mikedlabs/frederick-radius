import type { Metadata } from "next";
import Link from "next/link";
import { PLACES } from "@/data/places";
import { rankPlaces, hoursCoverage, getNeedsReviewPlaces } from "@/lib/loaders/places";
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
import { getDriftStats } from "@/lib/drift-review";
import { feedStatuses, darkFeedCount } from "@/lib/integrations/feed-registry";
import { getUnparseableLocationSummary } from "@/lib/quality/db-health";

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
  const drift = getDriftStats();
  // Placement validation — coordinates flagged needs_review because
  // they are missing or fall outside the county bbox. The public
  // surfaces never render these, so this view is the only place an
  // editor sees them.
  const reviewPlaces = getNeedsReviewPlaces();
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
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>← Admin</Link>
      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Phase 1 data quality
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Data health
        </h1>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          Copy scores computed {new Date(SCORES.computed_at).toLocaleString()}. The nightly
          cron at /api/cron/data-health recomputes and reports these numbers.
        </p>
      </header>

      {/* ── Live feed connectivity — the "is it collecting data?" board.
          Keyed feeds go green when their env var is set in the
          deployment, amber ("needs key") until then; keyless feeds are
          live wherever outbound network is allowed. ──────────────────── */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Live feed connectivity
          </h2>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums"
            style={{
              background: dark === 0
                ? "color-mix(in srgb, var(--app-positive) 14%, var(--app-bg-elevated))"
                : "color-mix(in srgb, var(--app-warning) 16%, var(--app-bg-elevated))",
              color: dark === 0 ? "var(--app-positive)" : "var(--app-warning)",
            }}
          >
            {dark === 0 ? "All keyed feeds live" : `${dark} keyed feed${dark === 1 ? "" : "s"} dark`}
          </span>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          {dark === 0
            ? "Every keyed feed has its API key configured."
            : "Dark feeds fail soft to empty, nothing breaks, but those layers stay blank until the key is set in the Vercel project env."}
        </p>

        <div className="mt-3 space-y-2">
          {feeds.keyed.map((f) => (
            <div
              key={f.name}
              className="flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: f.configured ? "var(--app-positive)" : "var(--app-warning)" }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{f.name}</span>
                  <span className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>{f.powers}</span>
                </div>
              </div>
              {f.configured ? (
                <span className="shrink-0 text-[11px] font-semibold" style={{ color: "var(--app-positive)" }}>Live</span>
              ) : (
                <code className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--app-warning) 14%, transparent)", color: "var(--app-warning)" }}>
                  set {f.env}
                </code>
              )}
            </div>
          ))}
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>
            {feeds.keyless.length} keyless feeds (live without a key)
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {feeds.keyless.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-[12px]">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--app-positive)" }} />
                <span className="font-medium" style={{ color: "var(--app-ink-2)" }}>{f.name}</span>
                <span className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>· {f.powers}</span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <table className="mt-6 w-full text-sm">
        <tbody>
          {rows.map(([k, v, note]) => (
            <tr key={k} className="border-b" style={{ borderColor: "var(--app-border)" }}>
              <td className="py-2 pr-3" style={{ color: "var(--app-ink-2)" }}>{k}</td>
              <td className="py-2 pr-3 font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>{v}</td>
              <td className="py-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-8">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Placement (needs review)
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Coordinates that fall outside the Frederick County bbox
          (lat&nbsp;{FREDERICK_COUNTY_BBOX.south}–{FREDERICK_COUNTY_BBOX.north},
          lng&nbsp;{FREDERICK_COUNTY_BBOX.west}–{FREDERICK_COUNTY_BBOX.east})
          or are missing entirely. These are dropped from every public
          surface so a mispositioned marker can never reach a user.
          Fix the source row in <code>src/data/places.ts</code> or{" "}
          <code>src/data/events.ts</code> and the row clears next build.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div
            className="tactile rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] p-3 text-center"
          >
            <div
              className="font-serif text-[22px] font-semibold leading-none tracking-tight tabular-nums"
              style={{ color: reviewPlaces.length > 0 ? "var(--app-warning)" : "var(--app-positive)" }}
            >
              {reviewPlaces.length.toLocaleString()}
            </div>
            <div
              className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Places flagged
            </div>
          </div>
          <div
            className="tactile rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] p-3 text-center"
          >
            <div
              className="font-serif text-[22px] font-semibold leading-none tracking-tight tabular-nums"
              style={{ color: reviewEvents.length > 0 ? "var(--app-warning)" : "var(--app-positive)" }}
            >
              {reviewEvents.length.toLocaleString()}
            </div>
            <div
              className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Events flagged
            </div>
          </div>
        </div>
        {(reviewPlaces.length > 0 || reviewEvents.length > 0) && (
          <details className="mt-3">
            <summary
              className="cursor-pointer text-[12px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              Show the first {Math.min(20, reviewPlaces.length + reviewEvents.length)} rows
            </summary>
            <ul className="mt-2 space-y-1 text-[11px]" style={{ color: "var(--app-ink-2)" }}>
              {reviewPlaces.slice(0, 20).map((p) => (
                <li
                  key={`p:${p.slug}`}
                  className="flex justify-between border-b py-1"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                      place
                    </span>{" "}
                    {p.slug}
                  </span>
                  <span className="tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    {p.geom
                      ? `${p.geom.lng.toFixed(4)}, ${p.geom.lat.toFixed(4)}`
                      : "no geom"}
                  </span>
                </li>
              ))}
              {reviewEvents.slice(0, 20).map((e) => (
                <li
                  key={`e:${e.slug}`}
                  className="flex justify-between border-b py-1"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                      event
                    </span>{" "}
                    {e.slug}
                  </span>
                  <span className="tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    {e.geom
                      ? `${e.geom.lng.toFixed(4)}, ${e.geom.lat.toFixed(4)}`
                      : "no geom"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Place drift (last vetting sweep)
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Periodic Google re-pull diffs business_status / hours / website /
          phone / rating / address against the stored enrichment so the
          editor can keep the catalog honest. Run <code>npm run vet</code>
          to refresh; review changes at <code>/admin/drift-review</code>.
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            { label: "Drift rows", value: drift.drift_rows, color: "var(--app-warning)" },
            { label: "Changes", value: drift.total_changes, color: "var(--app-ink-2)" },
            { label: "Accepted", value: drift.accepted, color: "var(--app-positive)" },
            { label: "Pending", value: drift.undecided, color: "var(--app-cool)" },
          ].map((s) => (
            <div
              key={s.label}
              className="tactile rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] p-3 text-center"
            >
              <div
                className="font-serif text-[22px] font-semibold leading-none tracking-tight tabular-nums"
                style={{ color: s.color }}
              >
                {s.value.toLocaleString()}
              </div>
              <div
                className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {drift.last_sweep_at
            ? `Last swept ${new Date(drift.last_sweep_at).toLocaleString()}.`
            : "No sweep recorded yet."}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Anomaly flags (current vs prior fetch)
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Rolling per-source comparison. Flags fire when the distribution
          shifts in a way that usually means an upstream regression: row
          counts crash, the Free share swings wildly, a single venue
          claims the whole batch, or descriptions go missing.
        </p>
        {anomalies.length === 0 ? (
          <p
            className="mt-3 rounded-[var(--app-radius-md)] px-3 py-2 text-[12px]"
            style={{
              background: "color-mix(in srgb, var(--app-positive) 10%, var(--app-bg-elevated))",
              color: "var(--app-positive)",
            }}
          >
            No anomalies on the last fetch.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {anomalies.map((a, i) => (
              <li
                key={`${a.source}-${a.kind}-${i}`}
                className="rounded-[var(--app-radius-md)] border-l-4 px-3 py-2 text-[12px]"
                style={{
                  borderColor: "var(--app-warning)",
                  background: "color-mix(in srgb, var(--app-warning) 8%, var(--app-bg-elevated))",
                  color: "var(--app-ink-2)",
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold" style={{ color: "var(--app-warning)" }}>
                    {a.source}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                    {a.kind.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-0.5" style={{ color: "var(--app-ink-2)" }}>
                  {a.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Distribution snapshot
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          The shape of each feed&apos;s most recent batch. What
          anomalies are computed against.
        </p>
        {snapshots.length === 0 ? (
          <p className="mt-3 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            No snapshot recorded in this process yet.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr style={{ color: "var(--app-ink-3)" }}>
                <th className="py-1 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Source</th>
                <th className="py-1 pr-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Count</th>
                <th className="py-1 pr-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Free</th>
                <th className="py-1 pr-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Empty desc</th>
                <th className="py-1 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Top venue</th>
                <th className="py-1 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Top category</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map(({ source, current }) => (
                <tr key={source} className="border-b align-top" style={{ borderColor: "var(--app-border)" }}>
                  <td className="py-2 pr-3 font-semibold" style={{ color: "var(--app-ink)" }}>
                    {source}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                    {current.count}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                    {(current.free_ratio * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                    {(current.empty_desc_ratio * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 pr-3 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {current.top_venue
                      ? `${current.top_venue.name} · ${(current.top_venue.share * 100).toFixed(0)}%`
                      : "–"}
                  </td>
                  <td className="py-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {current.top_category
                      ? `${current.top_category.name} · ${(current.top_category.share * 100).toFixed(0)}%`
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Feed validation (last fetch)
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Schema-checked at the integration boundary. Rows that fail the
          contract are dropped and the reason is recorded here, so an
          upstream feed change is visible before it lands on a card.
        </p>
        {feedMetrics.length === 0 ? (
          <p className="mt-3 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            No feed fetched in this process yet.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr style={{ color: "var(--app-ink-3)" }}>
                <th className="py-1 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Source</th>
                <th className="py-1 pr-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Passed</th>
                <th className="py-1 pr-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Dropped</th>
                <th className="py-1 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Top reasons</th>
              </tr>
            </thead>
            <tbody>
              {feedMetrics.map((m) => (
                <tr key={m.source} className="border-b align-top" style={{ borderColor: "var(--app-border)" }}>
                  <td className="py-2 pr-3 font-semibold" style={{ color: "var(--app-ink)" }}>{m.source}</td>
                  <td
                    className="py-2 pr-3 text-right tabular-nums"
                    style={{ color: m.passed > 0 ? "var(--app-positive)" : "var(--app-ink-3)" }}
                  >
                    {m.passed}
                  </td>
                  <td
                    className="py-2 pr-3 text-right tabular-nums font-semibold"
                    style={{ color: m.dropped > 0 ? "var(--app-warning)" : "var(--app-ink-3)" }}
                  >
                    {m.dropped}
                  </td>
                  <td className="py-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {m.reasons.length === 0 ? (
                      <span style={{ color: "var(--app-positive)" }}>–</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {m.reasons.map((r) => (
                          <li key={r.key}>
                            <span className="tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                              {r.count}×
                            </span>{" "}
                            {r.key}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Unparseable locations (geocode queue)
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Locations the ingest pipeline could not parse or geocode, logged to{" "}
          <code>unparseable_locations</code> per source. The event still ships
          (never dropped), but it lands on a feed-default centroid until the
          address is fixed upstream or a parser rule is added.
        </p>
        {unparseable.length === 0 ? (
          <p
            className="mt-3 rounded-[var(--app-radius-md)] px-3 py-2 text-[12px]"
            style={{
              background: "color-mix(in srgb, var(--app-positive) 10%, var(--app-bg-elevated))",
              color: "var(--app-positive)",
            }}
          >
            None queued (or no database in this environment).
          </p>
        ) : (
          <>
            <p className="mt-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              <span className="font-semibold tabular-nums" style={{ color: "var(--app-warning)" }}>
                {unparseableTotal.toLocaleString()}
              </span>{" "}
              across {unparseable.length} source{unparseable.length === 1 ? "" : "s"}.
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr style={{ color: "var(--app-ink-3)" }}>
                  <th className="py-1 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Source</th>
                  <th className="py-1 pr-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Count</th>
                  <th className="py-1 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Most recent sample</th>
                </tr>
              </thead>
              <tbody>
                {unparseable.map((r) => (
                  <tr key={r.source} className="border-b align-top" style={{ borderColor: "var(--app-border)" }}>
                    <td className="py-2 pr-3 font-semibold" style={{ color: "var(--app-ink)" }}>{r.source}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold" style={{ color: "var(--app-warning)" }}>
                      {r.count.toLocaleString()}
                    </td>
                    <td className="py-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {r.sample ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <nav className="mt-6 flex gap-4 text-xs">
        <Link href="/admin/dedup-review" style={{ color: "var(--app-cool)" }}>Dedup review →</Link>
        <Link href="/admin/copy-review" style={{ color: "var(--app-cool)" }}>Copy review →</Link>
      </nav>
    </div>
  );
}

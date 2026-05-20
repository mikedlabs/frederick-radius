import type { Metadata } from "next";
import Link from "next/link";
import { PLACES } from "@/data/places";
import { rankPlaces, hoursCoverage } from "@/lib/loaders/places";
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

  const rows: Array<[string, string, string]> = [
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

      <nav className="mt-6 flex gap-4 text-xs">
        <Link href="/admin/dedup-review" style={{ color: "var(--app-cool)" }}>Dedup review →</Link>
        <Link href="/admin/copy-review" style={{ color: "var(--app-cool)" }}>Copy review →</Link>
      </nav>
    </div>
  );
}

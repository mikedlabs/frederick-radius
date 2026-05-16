import type { Metadata } from "next";
import Link from "next/link";
import { PLACES } from "@/data/places";
import { rankPlaces, hoursCoverage } from "@/lib/loaders/places";
import SCORES_RAW from "@/data/copy-scores.json" with { type: "json" };
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };

export const metadata: Metadata = {
  title: "Data health · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const SCORES = SCORES_RAW as { computed_at: string; counts: Record<string, number> };
const DEDUP = DEDUP_RAW as Record<string, { canonical: string }>;

export default function DataHealth() {
  const all = rankPlaces({});
  const coverage = hoursCoverage(all);
  const folded = Object.entries(DEDUP).filter(([s, v]) => v.canonical !== s).length;
  const clusters = new Set(Object.values(DEDUP).map((v) => v.canonical)).size;

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

      <nav className="mt-6 flex gap-4 text-xs">
        <Link href="/admin/dedup-review" style={{ color: "var(--app-cool)" }}>Dedup review →</Link>
        <Link href="/admin/copy-review" style={{ color: "var(--app-cool)" }}>Copy review →</Link>
      </nav>
    </div>
  );
}

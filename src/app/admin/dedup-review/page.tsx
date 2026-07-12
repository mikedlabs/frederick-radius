import type { Metadata } from "next";
import Link from "next/link";
import { PLACES } from "@/data/places";
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };

export const metadata: Metadata = {
  title: "Dedup review · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Entry = { canonical: string; merged?: { website?: string; phone?: string } };
const DEDUP = DEDUP_RAW as Record<string, Entry>;
const BY_SLUG = Object.fromEntries(PLACES.map((p) => [p.slug, p]));

export default function DedupReview() {
  // Reconstruct clusters: canonical -> members.
  const clusters = new Map<string, string[]>();
  for (const [slug, e] of Object.entries(DEDUP)) {
    const arr = clusters.get(e.canonical) ?? [];
    arr.push(slug);
    clusters.set(e.canonical, arr);
  }
  const rows = [...clusters.entries()]
    .map(([canonical, members]) => ({ canonical, members: [...new Set(members)] }))
    .filter((c) => c.members.length > 1)
    .sort((a, b) => b.members.length - a.members.length);

  const folded = rows.reduce((n, c) => n + c.members.length - 1, 0);

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>← Admin</Link>
      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Phase 1 data quality
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Deduplication review
        </h1>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          {rows.length} clusters, {folded} records fold into a curated canonical. The render
          layer applies this only when RADIUS_DEDUPE is on.
        </p>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          To override a pair, add it to src/data/dedup-decisions.json as
          {' '}<code>{'{"reject":["slugA|slugB"],"merge":["slugA|slugB"]}'}</code>{' '}
          then run <code>npm run dedup</code> and commit. Serverless storage is read-only,
          so decisions live in committed data, like every other place record.
        </p>
      </header>

      <ul className="mt-6 space-y-3">
        {rows.map((c) => (
          <li
            key={c.canonical}
            className="rounded-[var(--app-radius-md)] border p-3"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          >
            <ul className="space-y-1">
              {c.members
                .sort((a, b) => (a === c.canonical ? -1 : b === c.canonical ? 1 : 0))
                .map((s) => {
                  const p = BY_SLUG[s];
                  const isCanon = s === c.canonical;
                  return (
                    <li key={s} className="flex items-center justify-between gap-3 text-sm">
                      <span style={{ color: isCanon ? "var(--app-ink)" : "var(--app-ink-3)" }}>
                        {isCanon ? "★ " : "→ "}
                        {p?.name ?? s}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                        {p?.source ?? "?"} · {s}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

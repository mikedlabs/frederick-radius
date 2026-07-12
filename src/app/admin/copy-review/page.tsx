import type { Metadata } from "next";
import Link from "next/link";
import { PLACES } from "@/data/places";
import SCORES_RAW from "@/data/copy-scores.json" with { type: "json" };

export const metadata: Metadata = {
  title: "Copy review · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Scores = { computed_at: string; counts: Record<string, number>; bySlug: Record<string, string> };
const SCORES = SCORES_RAW as Scores;
const BY_SLUG = Object.fromEntries(PLACES.map((p) => [p.slug, p]));

export default function CopyReview() {
  const total = PLACES.length;
  const scraped = Object.entries(SCORES.bySlug)
    .filter(([, q]) => q === "scraped")
    .map(([slug]) => BY_SLUG[slug])
    .filter(Boolean)
    .slice(0, 200);

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>← Admin</Link>
      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Phase 1 data quality
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Copy review
        </h1>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          {SCORES.counts.scraped} of {total} descriptions are scraped by the STYLE.md detector.
          {SCORES.counts.auto_clean} read as prose. Showing the first 200 scraped, worst surface first.
        </p>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          Rewrite against STYLE.md. Put approved copy in src/data/copy-overrides.json keyed by slug,
          then commit. Scores recompute on <code>npm run copy:scores</code>. Computed{' '}
          {new Date(SCORES.computed_at).toLocaleString()}.
        </p>
      </header>

      {scraped.length === 0 ? (
        <p
          className="mt-6 rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          No scraped descriptions to rewrite. Every listing reads as prose.
        </p>
      ) : (
      <ul className="mt-6 space-y-2">
        {scraped.map((p) => (
          <li
            key={p.slug}
            className="rounded-[var(--app-radius-md)] border p-3"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: "var(--app-ink)" }}>{p.name}</span>
              <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{p.source} · {p.slug}</span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--app-ink-3)" }}>
              {(p.description ?? p.short_blurb ?? "").slice(0, 240) || "(no description)"}
            </p>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

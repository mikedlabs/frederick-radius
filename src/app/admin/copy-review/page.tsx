import type { Metadata } from "next";
import { PLACES } from "@/data/places";
import SCORES_RAW from "@/data/copy-scores.json" with { type: "json" };
import { AdminShell, StatStrip, SectionLabel, HairlineList, Callout, AllClear } from "@/components/admin/kit";

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
    <AdminShell
      eyebrow="Phase 1 data quality"
      title="Copy review"
      intro="Listings whose descriptions read like scraped data, not prose. Showing the first 200 flagged, worst surface first."
    >
      {/* ── The answer up front: how many listings read as scraped vs prose. ── */}
      <div className="mt-6">
        <StatStrip
          items={[
            { value: SCORES.counts.scraped, label: "flagged scraped", tone: SCORES.counts.scraped > 0 ? "warning" : "positive" },
            { value: SCORES.counts.auto_clean, label: "read as prose", tone: "positive" },
            { value: total, label: "listings total", tone: "neutral" },
          ]}
        />
      </div>

      {/* ── How to clear them (the rewrite loop). ── */}
      <div className="mt-4">
        <Callout tone="cool" title="How to clear these">
          Rewrite against STYLE.md, then put approved copy in <code>src/data/copy-overrides.json</code> keyed by
          slug and commit. Scores recompute on <code>npm run copy:scores</code>. Computed{" "}
          {new Date(SCORES.computed_at).toLocaleString()}.
        </Callout>
      </div>

      {/* ── The worklist: hairlines, not cards, so the copy can breathe. ── */}
      <section className="mt-7">
        {scraped.length === 0 ? (
          <AllClear>No scraped descriptions to rewrite. Every listing reads as prose.</AllClear>
        ) : (
          <>
            <SectionLabel
              aside={
                <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                  {scraped.length} shown
                </span>
              }
            >
              Flagged listings
            </SectionLabel>
            <HairlineList>
              {scraped.map((p, i) => (
                <li
                  key={p.slug}
                  className="bg-[var(--app-bg-elevated)] px-3 py-2.5"
                  style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                      {p.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      {p.source} · {p.slug}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                    {(p.description ?? p.short_blurb ?? "").slice(0, 240) || "(no description)"}
                  </p>
                </li>
              ))}
            </HairlineList>
          </>
        )}
      </section>
    </AdminShell>
  );
}

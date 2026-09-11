import type { Metadata } from "next";
import { PLACES } from "@/data/places";
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };
import { AdminShell, Section, StatStrip, HairlineList, EmptyState } from "@/components/admin/kit";

export const metadata: Metadata = {
  title: "Dedup review · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Entry = { canonical: string; merged?: { website?: string; phone?: string } };
const DEDUP = DEDUP_RAW as Record<string, Entry>;
const BY_SLUG = Object.fromEntries(PLACES.map((p) => [p.slug, p]));

// Inline code chip for the override snippets — tokenized, no raw hex.
const CODE_CLASS = "rounded-[var(--app-radius-sm)] px-1 py-0.5 font-mono text-[11px]";
const CODE_STYLE = {
  background: "color-mix(in srgb, var(--app-ink) 7%, transparent)",
  color: "var(--app-ink-2)",
} as const;

/**
 * ClusterMember — one row inside a fold group. Kept local (not a plain
 * HairlineRow) because a canonical vs duplicate needs an ink/muted title
 * distinction and a leading ★ / → marker that HairlineRow does not express.
 * Reskinned to the kit's hairline-list look (elevated rows, hairline
 * separators, tinted leading badge, mono meta).
 */
function ClusterMember({
  first,
  isCanon,
  name,
  meta,
}: {
  first: boolean;
  isCanon: boolean;
  name: string;
  meta: string;
}) {
  return (
    <li style={first ? undefined : { borderTop: "1px solid var(--app-border)" }}>
      <div className={`flex items-center gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5 ${isCanon ? "" : "pl-8"}`}>
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] leading-none"
          style={
            isCanon
              ? { background: "color-mix(in srgb, var(--app-brand) 12%, transparent)", color: "var(--app-brand)" }
              : { color: "var(--app-ink-3)" }
          }
        >
          {isCanon ? "★" : "→"}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[14px] leading-tight"
          style={{ color: isCanon ? "var(--app-ink)" : "var(--app-ink-3)", fontWeight: isCanon ? 500 : 400 }}
        >
          {name}
        </span>
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {meta}
        </span>
      </div>
    </li>
  );
}

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

  // Flatten members (canonical pinned to the top of each cluster) for one
  // continuous hairline list, so clusters read as nested groups, not cards.
  const flat = rows.flatMap((c) =>
    [...c.members]
      .sort((a, b) => (a === c.canonical ? -1 : b === c.canonical ? 1 : 0))
      .map((s) => ({ s, isCanon: s === c.canonical })),
  );

  return (
    <AdminShell
      eyebrow="Phase 1 data quality"
      title="Deduplication review"
      intro="The render layer applies this only when RADIUS_DEDUPE is on."
    >
      <div className="mt-6">
        <StatStrip
          items={[
            { value: rows.length, label: "clusters" },
            { value: folded, label: "records fold in", tone: "cool" },
          ]}
        />
      </div>

      <Section title="Clusters" description="Each set folds duplicate records into a curated canonical, marked ★.">
        {rows.length === 0 ? (
          <EmptyState tone="positive">No duplicate clusters to review. Every place stands on its own.</EmptyState>
        ) : (
          <div className="mt-3">
            <HairlineList>
              {flat.map((m, idx) => (
                <ClusterMember
                  key={m.s}
                  first={idx === 0}
                  isCanon={m.isCanon}
                  name={BY_SLUG[m.s]?.name ?? m.s}
                  meta={`${BY_SLUG[m.s]?.source ?? "?"} · ${m.s}`}
                />
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      <Section
        title="Overriding a pair"
        description={
          <>
            To override a pair, add it to src/data/dedup-decisions.json as{" "}
            <code className={CODE_CLASS} style={CODE_STYLE}>{'{"reject":["slugA|slugB"],"merge":["slugA|slugB"]}'}</code>{" "}
            then run <code className={CODE_CLASS} style={CODE_STYLE}>npm run dedup</code> and commit. Serverless storage
            is read-only, so decisions live in committed data, like every other place record.
          </>
        }
      />
    </AdminShell>
  );
}

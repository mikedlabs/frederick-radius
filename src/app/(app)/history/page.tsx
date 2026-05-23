import type { Metadata } from "next";
import { Landmark, Calendar, Sparkles, Users, ExternalLink } from "lucide-react";
import { HISTORY, historyTopics, type HistoryEntry } from "@/data/history";
import PageBloom from "@/components/ui/PageBloom";
import DecorativeDivider from "@/components/ui/DecorativeDivider";
import HistoryTimeline from "@/components/history/HistoryTimeline";
import { eraForYear } from "@/lib/history-era";

export const metadata: Metadata = {
  title: "History",
  description:
    "Frederick County in moments and facts. Barbara Fritchie, Monocacy, the 1864 Ransom, Camp David, the Clustered Spires, Mt St Mary's, the C&O Canal.",
};

const KIND_META: Record<HistoryEntry["kind"], { label: string; icon: typeof Landmark; color: string }> = {
  moment: { label: "Moment", icon: Calendar, color: "#C4451C" },
  person: { label: "Person", icon: Users, color: "#7E2C6F" },
  fact: { label: "Did you know", icon: Sparkles, color: "#2A5D8F" },
};

function formatYear(e: HistoryEntry): string | null {
  if (e.date_label) return e.date_label;
  if (e.year) return e.year.toString();
  return null;
}

/**
 * /history. Frederick County in moments and facts.
 *
 * Layered editorial page: a hero with one rotating "did you know"
 * fact, then a topic-filter row, then the entries grouped by kind
 * (moments / people / facts). Connects residents to the place and
 * gives visitors texture beyond "things to eat".
 *
 * Pure server. Data lives in src/data/history.ts. One curated TS
 * file, no CMS, no live feed. Every entry has a real source where
 * authoritative reference exists; nothing is fabricated.
 */
export default async function HistoryPage() {
  const topics = historyTopics();
  const momentCount = HISTORY.filter((h) => h.kind === "moment").length;
  const personCount = HISTORY.filter((h) => h.kind === "person").length;
  const factCount = HISTORY.filter((h) => h.kind === "fact").length;

  // Hero "did you know" – rotates daily so a return visitor sees a
  // different fact each morning. Deterministic per day; never random
  // (async server component, request-scoped, no hydration mismatch).
  const facts = HISTORY.filter((h) => h.kind === "fact");
  // eslint-disable-next-line react-hooks/purity
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const heroFact = facts[((dayIdx % facts.length) + facts.length) % facts.length];

  // Sort moments newest-first (most recent on top) so the page reads
  // from "this happened here recently" back to founding.
  const moments = HISTORY.filter((h) => h.kind === "moment").sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0),
  );
  const people = HISTORY.filter((h) => h.kind === "person").sort(
    (a, b) => (a.year ?? 0) - (b.year ?? 0),
  );
  const rest = HISTORY.filter((h) => h.kind === "fact" && h.slug !== heroFact.slug);

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Frederick County · since 1748
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          A place with stories.
        </h1>
        <p className="text-[14px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          The county is older than the country. Cannonballs from a foundry
          here armed the Continental Army; a 95-year-old flag-waver in town
          ended up in a Whittier poem; a battle south of the city saved
          Washington. These are the moments and the small details. The
          stuff a docent might tell you walking past the marker.
        </p>
        <p
          className="text-[11px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>{momentCount}</span> moments ·{" "}
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>{personCount}</span> people ·{" "}
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>{factCount}</span> facts
        </p>
      </header>

      {/* The timeline ribbon — instant visual identity. Tells the
          visitor "this is a museum, not an essay" before they read a
          word, and gives every tick a deep-link to the entry below. */}
      <HistoryTimeline />

      {/* Hero: today's "did you know" fact. */}
      <section
        aria-label="Today's fact"
        className="tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-5"
        style={{ "--section-accent": KIND_META.fact.color } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: `color-mix(in srgb, ${KIND_META.fact.color} 18%, transparent)`,
              color: KIND_META.fact.color,
            }}
          >
            <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Today&apos;s Fact
          </span>
        </div>
        <h2
          className="mt-3 font-serif text-[24px] font-semibold leading-snug tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {heroFact.title}
        </h2>
        <p
          className="mt-2 text-[14px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          {heroFact.body}
        </p>
        {heroFact.place && (
          <p className="mt-3 text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            {heroFact.place}
          </p>
        )}
      </section>

      {/* Topic filter. Non-interactive on first ship; informational chips
          so users see the topic shape of the page. A real filter is the
          next step once a search/topic state exists. */}
      <section aria-label="Topics" className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {topics.slice(0, 12).map((t) => (
          <span
            key={t.tag}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: "var(--app-bg-elevated)",
              color: "var(--app-ink-2)",
              border: "1px solid var(--app-border)",
            }}
          >
            #{t.tag}
            <span
              className="rounded-full px-1 text-[9px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {t.count}
            </span>
          </span>
        ))}
      </section>

      <DecorativeDivider variant="asterism" />

      {/* Big moments. Dated events, newest first. */}
      <section aria-label="Big moments" className="space-y-3">
        <header className="flex items-end justify-between gap-3">
          <h2
            className="inline-flex items-center gap-2 font-serif text-[22px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            <span
              aria-hidden
              className="inline-block h-4 w-1 rounded-full"
              style={{ background: KIND_META.moment.color }}
            />
            Moments
          </h2>
          <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            {moments.length} dated events
          </p>
        </header>
        <ol className="space-y-3">
          {moments.map((m, idx) => (
            <HistoryArticle key={m.slug} entry={m} idx={idx} />
          ))}
        </ol>
      </section>

      <DecorativeDivider variant="wave" />

      {/* People */}
      <section aria-label="People" className="space-y-3">
        <header className="flex items-end justify-between gap-3">
          <h2
            className="inline-flex items-center gap-2 font-serif text-[22px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            <span
              aria-hidden
              className="inline-block h-4 w-1 rounded-full"
              style={{ background: KIND_META.person.color }}
            />
            Frederick people
          </h2>
        </header>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <HistoryArticle key={p.slug} entry={p} idx={0} compact />
          ))}
        </ul>
      </section>

      <DecorativeDivider variant="sun" />

      {/* The rest of the facts (excluding today's hero) */}
      <section aria-label="More facts" className="space-y-3">
        <header className="flex items-end justify-between gap-3">
          <h2
            className="inline-flex items-center gap-2 font-serif text-[22px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            <span
              aria-hidden
              className="inline-block h-4 w-1 rounded-full"
              style={{ background: KIND_META.fact.color }}
            />
            More facts
          </h2>
        </header>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rest.map((f) => (
            <HistoryArticle key={f.slug} entry={f} idx={0} compact />
          ))}
        </ul>
      </section>

      <footer
        className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Sources: National Park Service · Library of Congress · Maryland
        Historical Trust · Frederick County Public Libraries. Got a story
        we should add?{" "}
        <a className="underline" style={{ color: "var(--app-cool)" }} href="mailto:hello@frederickradius.com">
          Tell us
        </a>
        .
      </footer>
    </div>
  );
}

function HistoryArticle({
  entry,
  idx,
  compact = false,
}: {
  entry: HistoryEntry;
  idx: number;
  compact?: boolean;
}) {
  const meta = KIND_META[entry.kind];
  const Icon = meta.icon;
  const yearLabel = formatYear(entry);
  const isOdd = idx % 2 === 1;
  // Era for dated entries drives a left-edge color stripe so the long
  // moments list reads as banded by period — Founding sepia, Civil
  // War brick red, Industrial gold, Modern blue, Contemporary green.
  // Undated facts keep the kind color only.
  const era = typeof entry.year === "number" ? eraForYear(entry.year) : null;
  const stripeColor = era?.color ?? meta.color;
  return (
    <li id={`h-${entry.slug}`} className="scroll-mt-24">
      <article
        className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4 pl-5"
        style={{ "--section-accent": meta.color } as React.CSSProperties}
      >
        {/* Era stripe — a thin left edge in the era's color. For
            undated entries this falls back to the kind color so all
            cards visually feel like they belong to the same family. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: stripeColor }}
        />
        {/* Soft accent corner bloom so the card has a hint of color
            tied to the entry kind. Opacity is low so type stays legible. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(80% 100% at ${isOdd ? "100%" : "0%"} 0%, color-mix(in srgb, ${meta.color} 14%, transparent), transparent 60%)`,
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
              style={{
                background: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
                color: meta.color,
              }}
            >
              <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              {meta.label}
            </span>
            {yearLabel && (
              <span
                className="text-[10px] font-semibold tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {yearLabel}
              </span>
            )}
            {era && (
              <span
                className="text-[9px] font-bold uppercase tracking-[0.1em]"
                style={{ color: `color-mix(in srgb, ${era.color} 70%, var(--app-ink-2))` }}
              >
                · {era.label}
              </span>
            )}
          </div>
          <h3
            className={`mt-2 font-serif font-semibold leading-tight tracking-tight ${
              compact ? "text-[17px]" : "text-[19px]"
            }`}
            style={{ color: "var(--app-ink)" }}
          >
            {entry.title}
          </h3>
          <p
            className="mt-1.5 text-[13.5px] leading-relaxed text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            {entry.body}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {entry.place && (
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                <Landmark className="h-3 w-3" strokeWidth={2} aria-hidden />
                {entry.place}
              </span>
            )}
            {entry.source_url && (
              <a
                href={entry.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                {entry.source_label ?? "Source"}
                <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
              </a>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

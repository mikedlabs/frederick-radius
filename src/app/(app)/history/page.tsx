import type { Metadata } from "next";
import Image from "next/image";
import { Landmark, Calendar, Sparkles, Users, ExternalLink } from "lucide-react";
import { HISTORY, historyTopics, type HistoryEntry } from "@/data/history";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import DecorativeDivider from "@/components/ui/DecorativeDivider";
import HistoryTimeline from "@/components/history/HistoryTimeline";
import { eraForYear } from "@/lib/history-era";

export const metadata: Metadata = {
  title: "History",
  description:
    "Frederick County in moments and facts. Barbara Fritchie, Monocacy, the 1864 Ransom, Camp David, the Clustered Spires, Mt St Mary's, the C&O Canal.",
};

const KIND_META: Record<HistoryEntry["kind"], { label: string; icon: typeof Landmark; color: string }> = {
  moment: { label: "Moment", icon: Calendar, color: "#A8462C" },
  person: { label: "Person", icon: Users, color: "#7E2C6F" },
  fact: { label: "Did you know", icon: Sparkles, color: "#2F5470" },
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

      {/* Cinematic hero — replaces the plain text header. A real
          aerial photograph of Frederick County (rotated daily by
          SeasonalPhoto) carries identity before the eye reaches a
          word. The serif "A place with stories." overlay sits on
          top of a soft dark gradient at the bottom so it stays
          readable on any rotation pick. */}
      <header className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-[var(--app-radius-lg)]">
        <div className="relative h-56 w-full sm:h-64" aria-hidden>
          <SeasonalPhoto
            season="auto"
            alt=""
            priority
            sizes="(max-width: 768px) 100vw, 640px"
            className="absolute inset-0"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 55%, transparent 90%)",
            }}
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
          <p className="eyebrow" style={{ color: "rgba(255,255,255,0.9)" }}>Frederick County · since 1748</p>
          <h1 className="font-serif text-[34px] font-semibold leading-[1.02] tracking-tight text-white sm:text-[40px]">
            A place with stories.
          </h1>
          <p
            className="text-[11px] tabular-nums text-white/85"
          >
            <span className="font-semibold text-white">{momentCount}</span> moments ·{" "}
            <span className="font-semibold text-white">{personCount}</span> people ·{" "}
            <span className="font-semibold text-white">{factCount}</span> facts
          </p>
        </div>
      </header>
      <p
        className="text-[14px] leading-relaxed text-pretty"
        style={{ color: "var(--app-ink-2)" }}
      >
        The county is older than the country. Cannonballs from a foundry
        here armed the Continental Army; a 95-year-old flag-waver in town
        ended up in a Whittier poem; a battle south of the city saved
        Washington. These are the moments and the small details. The
        stuff a docent might tell you walking past the marker.
      </p>

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
              className="rounded-full px-1 text-[10px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {t.count}
            </span>
          </span>
        ))}
      </section>

      <DecorativeDivider variant="asterism" />

      {/* Big moments. Dated events, newest first — now a horizontal
          scrolling carousel so the page reads as a museum exhibit,
          not a wall of text. Each card carries the era's accent
          color stripe and the entry photo when one exists. Vertical
          space drops dramatically; the visual rhythm of swiping
          through dated cards mirrors flipping through a timeline. */}
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
            {moments.length} dated events · swipe →
          </p>
        </header>
        <div className="-mx-4 px-4">
          <ol
            className="reveal-up shelf-rail gap-3 pb-1"
          >
            {moments.map((m, idx) => (
              <li key={m.slug} className="w-[280px] shrink-0 snap-start sm:w-[320px]">
                <HistoryMomentCard entry={m} idx={idx} />
              </li>
            ))}
          </ol>
        </div>
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

/**
 * HistoryMomentCard — the carousel card for the "Moments" section.
 *
 * Visual-first card meant to read at-a-glance in the horizontal
 * shelf rail. When the entry has a photo, the photo fills the top
 * half of the card with the era color as a top accent stripe; when
 * it doesn't, the era color carries the whole top via a soft
 * gradient. Year, title, and one-line body sit below the imagery
 * so the eye lands on the photo first, then the headline.
 */
function HistoryMomentCard({ entry, idx }: { entry: HistoryEntry; idx: number }) {
  const meta = KIND_META[entry.kind];
  const yearLabel = formatYear(entry);
  const era = typeof entry.year === "number" ? eraForYear(entry.year) : null;
  const stripeColor = era?.color ?? meta.color;
  return (
    <article
      id={`h-${entry.slug}`}
      className="tactile scroll-mt-24 overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
      style={{ "--section-accent": meta.color } as React.CSSProperties}
    >
      {/* Photo OR era gradient — the top half of the card. Photo when
          we have one (entry.image), else the era's tonal gradient so
          the card still reads as a moment from that period without
          inventing imagery. */}
      <div className="relative h-32 w-full overflow-hidden">
        {entry.image ? (
          <Image
            src={entry.image.src}
            alt={entry.image.alt ?? ""}
            fill
            sizes="(max-width: 768px) 280px, 320px"
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            style={{ objectFit: "cover" }}
            priority={idx < 2}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${stripeColor} 0%, color-mix(in srgb, ${stripeColor} 40%, var(--app-bg-sunken)) 100%)`,
            }}
          />
        )}
        {/* Era pill — top-left overlay so a glance at the card tells
            you which period it lives in. */}
        {era && (
          <span
            className="absolute left-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] backdrop-blur"
            style={{
              background: "rgba(0,0,0,0.45)",
              color: "white",
              boxShadow: `inset 0 0 0 1px ${stripeColor}`,
            }}
          >
            {era.label}
          </span>
        )}
        {/* Year — top-right corner overlay, big and tabular so it
            reads as the card's identity. */}
        {yearLabel && (
          <span
            className="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur"
          >
            {yearLabel}
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-3.5">
        <h3
          className="font-serif text-[17px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {entry.title}
        </h3>
        <p
          className="text-[12.5px] leading-relaxed text-pretty"
          style={{
            color: "var(--app-ink-2)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {entry.body}
        </p>
        {(entry.place || entry.source_url) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
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
        )}
      </div>
    </article>
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
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
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
                className="text-[10px] font-bold uppercase tracking-[0.1em]"
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

import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import PlaceCard from "@/components/place/PlaceCard";
import { getFindPicks, findBucket, isFindFilter, type FindFilter } from "@/lib/find-picks";

export const metadata: Metadata = {
  title: "Find somewhere good",
  description:
    "The places locals send people to — open now, near downtown Frederick, ranked by what's worth the walk.",
};

// 10-minute revalidate matches the find-picks cache bucket.
export const revalidate = 600;

/**
 * /find — "Find somewhere good."
 *
 * The find-system's primary job, built for the primary user: a visitor
 * standing somewhere asking "I'm hungry — where would a local send me?"
 * Not the 1,700-place firehose; the short, trustworthy short-list a
 * friend would give, ranked by the blended visitor recipe (ratings +
 * local-favorite curation + closest/open + moment-fit — see
 * getCuratedPicks / find-picks.ts).
 *
 * Composition, top to bottom:
 *   1. EDITORIAL HEADER — location anchor + the moment + the promise
 *      ("the places locals send people to").
 *   2. CRAVING CHIPS — All / Dinner / Drinks / Coffee / Sweet, as
 *      shareable URL links (?for=…), server-rendered, no client state.
 *   3. THE LEAD — the top pick as a photo-led feature card.
 *   4. WORTH THE WALK — the rest as a scannable list, each carrying
 *      its trust chips (Local favorite · rating · walk time).
 *   5. HONESTY FOOTER — how the list is ranked.
 *
 * Fully server-rendered; PlaceCard (client) opens the place sheet via
 * the provider in the app layout. The craving filter lives in the URL
 * so a pick is shareable and back/forward works.
 */

const CHIPS: { key: FindFilter; label: string; emoji: string }[] = [
  { key: "all", label: "All", emoji: "🍴" },
  { key: "dinner", label: "Dinner", emoji: "🍽" },
  { key: "drinks", label: "Drinks", emoji: "🍸" },
  { key: "coffee", label: "Coffee", emoji: "☕" },
  { key: "sweet", label: "Sweet", emoji: "🍦" },
];

/** Eastern weekday + clock for the moment line. */
function momentLabel(now: Date): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(now);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return `${weekday} · ${clock}`;
}

export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.for === "string" ? sp.for : undefined;
  const filter: FindFilter = isFindFilter(raw) ? raw : "all";

  const now = new Date();
  const picks = await getFindPicks(filter, findBucket(now));
  const [lead, ...rest] = picks;

  const chipHref = (key: FindFilter) => (key === "all" ? "/find" : `/find?for=${key}`);

  return (
    <div className="relative mx-auto max-w-md space-y-6 py-6">
      <PageBloom variant="warm-cool" />

      {/* ── 1. Editorial header ─────────────────────────────── */}
      <header className="space-y-2.5">
        <p
          className="mono text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--app-brand)" }}
        >
          {momentLabel(now)}
        </p>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.04] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Somewhere good,
          <br />
          right now.
        </h1>
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Hand-picked from{" "}
          <b style={{ color: "var(--app-ink)" }}>the places locals send people to</b> — open
          now near downtown, ranked by what&rsquo;s worth the walk.
        </p>
      </header>

      {/* ── 2. Craving chips (shareable URL filters) ─────────── */}
      <nav aria-label="Filter by craving" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex gap-2">
          {CHIPS.map((c) => {
            const active = c.key === filter;
            return (
              <li key={c.key} className="shrink-0">
                <Link
                  href={chipHref(c.key)}
                  aria-current={active ? "true" : undefined}
                  className="tactile inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
                  style={
                    active
                      ? { background: "var(--app-ink)", color: "var(--app-paper)", borderColor: "var(--app-ink)" }
                      : { background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", borderColor: "var(--app-border)" }
                  }
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {picks.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border px-4 py-8 text-center text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)", background: "var(--app-bg-elevated)" }}
        >
          Nothing open for that right now. Try another craving above.
        </p>
      ) : (
        <>
          {/* ── 3. The lead pick ──────────────────────────────── */}
          {lead && (
            <section className="space-y-2.5">
              <PlateHeader plate="The pick" title="Start here" />
              <div className="relative">
                <PlaceCard place={lead} variant="feature" />
                {lead.local_favorite && <LeadFavoriteBadge />}
              </div>
            </section>
          )}

          {/* ── 4. Worth the walk ─────────────────────────────── */}
          {rest.length > 0 && (
            <section className="space-y-2.5">
              <PlateHeader plate={`${rest.length} more`} title="Worth the walk" />
              <ul className="space-y-2.5">
                {rest.map((p) => (
                  <li key={p.slug}>
                    <PlaceCard place={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── 5. Honesty footer ─────────────────────────────── */}
          <p className="px-2 text-center text-[11px] italic leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Ranked by a blend of local-favorite curation, ratings,
            <br />
            distance &amp; what fits {momentFitWord(now)}.
          </p>
        </>
      )}
    </div>
  );
}

/** Editorial "Plate" section header — eyebrow label + serif title +
 *  the hairline-with-tick that the rest of the app's section heads use. */
function PlateHeader({ plate, title }: { plate: string; title: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="mono text-[9.5px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-3)" }}>
        {plate}
      </span>
      <h2 className="whitespace-nowrap font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
        {title}
      </h2>
      <span className="relative top-[-2px] h-px flex-1" style={{ background: "var(--app-ink-3)", opacity: 0.35 }} />
    </div>
  );
}

/** The "Local favorite" star badge that rides the lead pick's photo —
 *  the trust signal a stranger reads before anything else. */
function LeadFavoriteBadge() {
  return (
    <span
      className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
      style={{ background: "rgba(252,248,239,0.95)", color: "var(--app-brand)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 2px 8px -1px rgba(0,0,0,0.3)" }}
    >
      <Star className="h-3 w-3" strokeWidth={0} fill="var(--app-warning)" aria-hidden />
      Local favorite
    </span>
  );
}

/** Daypart word for the honesty line — keeps the ranking explanation
 *  honest about the moment-fit term. */
function momentFitWord(now: Date): string {
  const hour =
    parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(now),
      10,
    ) % 24;
  if (hour < 10) return "a morning out";
  if (hour < 16) return "the afternoon";
  return "an evening out";
}

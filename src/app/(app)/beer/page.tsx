import type { Metadata } from "next";
import Link from "next/link";
import { BREWERIES, BEER_HISTORY, deckBeers, ALL_BEERS, FAMILY_BY_KEY } from "@/data/beers";
import BeerSwipeDeck from "@/components/beer/BeerSwipeDeck";
import PageBloom from "@/components/ui/PageBloom";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Find your beer: Frederick County breweries",
  description:
    "Swipe Frederick County beers to find the styles you like, then the breweries that pour them. Every open brewery, their flagship beers, styles, and ratings, plus a bit of local beer history.",
  alternates: { canonical: "/beer" },
};

const prettyTown = (slug: string) =>
  slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function BeerPage() {
  const deck = deckBeers();
  const beerCount = ALL_BEERS.length;

  return (
    <div className="relative space-y-10">
      <PageBloom variant="warm-cool" />

      {/* Hero */}
      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Frederick County beer
        </p>
        <h1 className="font-serif text-[32px] font-semibold leading-[1.02] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Find your beer
        </h1>
        <p className="max-w-[34rem] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Swipe through {beerCount} beers from {BREWERIES.length} local breweries. Like what looks good, and we
          will point you to the taprooms that pour your kind of beer.
        </p>
      </header>

      {/* The swipe deck */}
      <section aria-label="Beer taste finder">
        <BeerSwipeDeck deck={deck} />
      </section>

      {/* History */}
      <section aria-labelledby="beer-history" className="space-y-4">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>A little history</p>
          <h2 id="beer-history" className="font-serif text-[22px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Beer in Frederick, then and now
          </h2>
        </div>
        <p className="max-w-[42rem] text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {BEER_HISTORY.summary}
        </p>
        <ol className="relative space-y-4 border-l-2 pl-5" style={{ borderColor: "var(--app-border)" }}>
          {BEER_HISTORY.milestones.map((m) => (
            <li key={m.year} className="relative">
              <span aria-hidden className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2" style={{ background: "var(--app-bg)", borderColor: "var(--app-brand)" }} />
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
                {m.year}
              </p>
              <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{m.title}</p>
              <p className="text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{m.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Directory */}
      <section aria-labelledby="beer-directory" className="space-y-4">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>The directory</p>
          <h2 id="beer-directory" className="font-serif text-[22px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Every brewery, and what they are known for
          </h2>
        </div>
        <ul className="space-y-3">
          {BREWERIES.map((b) => (
            <li key={b.slug} className="rounded-[var(--app-radius-lg)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/places/${b.slug}`} className="font-serif text-[18px] font-semibold tracking-tight hover:underline" style={{ color: "var(--app-ink)" }}>
                  {b.name}
                </Link>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                  {prettyTown(b.town)}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{b.focus}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {b.beers.map((be) => {
                  const fam = FAMILY_BY_KEY[be.family];
                  const pill = (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }}>
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: fam.base }} />
                      {be.name}
                      {be.abv != null && <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{be.abv.toFixed(1)}%</span>}
                    </span>
                  );
                  return (
                    <li key={be.name}>
                      {be.untappd ? (
                        <a href={be.untappd} target="_blank" rel="noopener noreferrer" className="tap-44">{pill}</a>
                      ) : (
                        pill
                      )}
                    </li>
                  );
                })}
              </ul>
              {b.untappd && (
                <a href={b.untappd} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>
                  What is on tap now, on Untappd →
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        Beers shown are each brewery&rsquo;s flagship and signature pours, with Untappd ratings. Taps rotate, so
        check each brewery&rsquo;s Untappd for what is pouring right now. Ratings are from Untappd. Gathered July 2026.
      </footer>
    </div>
  );
}

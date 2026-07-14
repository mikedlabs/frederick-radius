import type { Metadata } from "next";
import { BREWERIES, BEER_HISTORY, ALL_BEERS } from "@/data/beers";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import BeerFinder from "@/components/beer/BeerFinder";
import MyTaps from "@/components/beer/MyTaps";
import PageBloom from "@/components/ui/PageBloom";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Frederick County beer: find breweries and beers",
  description:
    "Every open Frederick County brewery and their flagship beers. Search, sort A-Z, filter by style, town, and open-now, or browse the map. Save the ones you like.",
  alternates: { canonical: "/beer" },
};

export default function BeerPage() {
  const breweryCards: PlaceCardData[] = BREWERIES.map((b) => clientPlaceBySlug(b.slug)).filter(
    (p): p is PlaceCardData => Boolean(p),
  );

  return (
    <div className="relative space-y-8">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Frederick County beer
        </p>
        <h1 className="font-serif text-[32px] font-semibold leading-[1.02] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Every beer, every brewery
        </h1>
        <p className="max-w-[34rem] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {ALL_BEERS.length} beers from {BREWERIES.length} local breweries. Search it, sort it, filter by style or
          town, see who is open now, or open the map. Save the ones you like to My taps.
        </p>
      </header>

      <BeerFinder breweryCards={breweryCards} />

      {/* My taps — saved beers (self-hides when empty) */}
      <MyTaps />

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
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>{m.year}</p>
              <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{m.title}</p>
              <p className="text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{m.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        Beers shown are each brewery&rsquo;s flagship and signature pours, with Untappd ratings. Taps rotate, so
        check each brewery&rsquo;s Untappd for what is pouring right now. Gathered July 2026.
      </footer>
    </div>
  );
}

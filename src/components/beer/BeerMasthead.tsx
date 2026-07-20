import { BREWERIES, ALL_BEERS } from "@/data/beers";

/**
 * BeerMasthead — the compact head of /beer, replacing the tall BeerHero so the
 * flavor field is visible almost above the fold. Three lines: a mono kicker, a
 * Fraunces title, and one plain status line assembled from our own counts. No
 * photo, no CTA buttons — the chart directly below is the call to action.
 */
export default function BeerMasthead() {
  const breweries = BREWERIES.length;
  const beers = ALL_BEERS.length;
  return (
    <header className="-mx-4 bg-[#f5eee2] px-4 pb-5 pt-7 text-[#281e14] sm:-mx-6 sm:px-6">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#85501f]">
        Frederick County beer
      </p>
      <h1 className="mt-1.5 font-serif text-[clamp(1.9rem,8vw,2.4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
        Beer in Frederick County.
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-black/64">
        {`${breweries} breweries, ${beers} signature beers. Every pour below is a tile in its own color; filter by style or strength, or tap one for the beer.`}
      </p>
    </header>
  );
}

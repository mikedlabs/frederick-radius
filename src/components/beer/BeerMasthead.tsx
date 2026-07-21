import { BREWERIES, ALL_BEERS } from "@/data/beers";
import BeerColorRibbon from "@/components/beer/BeerColorRibbon";

/**
 * BeerMasthead — the compact head of /beer. A mono kicker, a Fraunces title,
 * one plain count line, and the color ribbon: the whole 174-pour catalog as a
 * single pale-to-dark spectrum, so the page is SEEN as beer-by-color before a
 * word is read (owner ask). The subhead stays short on purpose — the "filter
 * or tap a pour" instruction lives on the tool right below, not twice.
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
        {`${breweries} breweries and ${beers} signature beers around the county.`}
      </p>
      <BeerColorRibbon className="mt-4 rounded-full" height={14} />
    </header>
  );
}

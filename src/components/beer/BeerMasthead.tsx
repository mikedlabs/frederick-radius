import { BREWERIES, ALL_BEERS } from "@/data/beers";

/**
 * BeerMasthead — the compact head of /beer. A Public Sans kicker, a Libre Caslon title,
 * one plain count line, and the color ribbon: the whole 174-pour catalog as a
 * single pale-to-dark spectrum, so the page is SEEN as beer-by-color before a
 * word is read (owner ask). The subhead stays short on purpose — the "filter
 * or tap a pour" instruction lives on the tool right below, not twice.
 */
export default function BeerMasthead() {
  const breweries = BREWERIES.length;
  const beers = ALL_BEERS.length;
  return (
    <header className="-mx-4 bg-[var(--app-bg)] px-4 pb-5 pt-7 text-[var(--app-ink)] sm:-mx-6 sm:px-6">
      <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-brand-press)]">
        Frederick County
      </p>
      <h1 className="mt-1.5 font-sans text-[clamp(2rem,8vw,2.7rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
        Beer in Frederick County
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--app-ink-3)]">
        {`${breweries} breweries and ${beers} signature beers around the county.`}
      </p>
    </header>
  );
}

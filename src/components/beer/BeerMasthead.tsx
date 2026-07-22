import { BREWERIES, ALL_BEERS } from "@/data/beers";
import BeerColorRibbon from "./BeerColorRibbon";

/**
 * BeerMasthead — the compact head of /beer. A Public Sans kicker, a Libre Caslon title,
 * one plain count line, and the actual catalog color spectrum. The header
 * gives Beer a physical cue without turning the page into a themed dashboard.
 */
export default function BeerMasthead() {
  const breweries = BREWERIES.length;
  const beers = ALL_BEERS.length;
  return (
    <header className="-mx-4 border-y bg-[var(--app-bg)] text-[var(--app-ink)] sm:-mx-6" style={{ borderColor: "var(--app-border)" }}>
      <BeerColorRibbon height={10} />
      <div className="px-4 pb-5 pt-5 sm:px-6">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-brand-press)]">
          Frederick County
        </p>
        <h1 className="mt-1.5 font-sans text-[clamp(2rem,8vw,2.7rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
          Beer in Frederick County
        </h1>
        <p className="mt-2 max-w-xl text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
          {`${breweries} breweries and ${beers} signature beers, from pale lagers to dark stouts.`}
        </p>
      </div>
    </header>
  );
}

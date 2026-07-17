import Link from "next/link";
import { ArrowRight, CarFront, MapPin } from "lucide-react";
import { BreweryLogo } from "./BreweryLogo";
import {
  BREWERY_BY_SLUG,
  type Beer as BeerRecord,
  type Brewery,
} from "@/data/beers";

type GuideStopDefinition = { brewerySlug: string; beerName: string };
type BeerDayDefinition = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  stops: GuideStopDefinition[];
};
type ResolvedStop = { brewery: Brewery; beer: BeerRecord };

const BEER_DAYS: BeerDayDefinition[] = [
  {
    slug: "downtown-contrast",
    eyebrow: "Downtown Frederick",
    title: "Two rooms. Two directions.",
    description: "Pair a hop-forward IPA at Olde Mother with a crisp kölsch at Brewer's Alley. The point is contrast, not collecting stops.",
    stops: [
      { brewerySlug: "olde-mother-brewing-frederick", beerName: "Impressionist" },
      { brewerySlug: "brewers-alley-frederick", beerName: "Kolsch" },
    ],
  },
  {
    slug: "farmhouse-afternoon",
    eyebrow: "Mount Airy",
    title: "Let the farm be the plan.",
    description: "Two lower-strength signatures from Mount Airy farm breweries, with enough time left to enjoy where you are.",
    stops: [
      { brewerySlug: "milkhouse-brewery-mt-airy", beerName: "Goldie's Best Bitter" },
      { brewerySlug: "freys-farm-mount-airy", beerName: "Farmer Armor" },
    ],
  },
  {
    slug: "one-stop-brunswick",
    eyebrow: "Brunswick",
    title: "One stop can be enough.",
    description: "Settle into Smoketown's fire-station setting instead of turning the afternoon into a brewery checklist.",
    stops: [
      { brewerySlug: "smoketown-brewing-brunswick", beerName: "Country Roads Pilsner" },
    ],
  },
];

function resolveStop(definition: GuideStopDefinition): ResolvedStop | null {
  const brewery = BREWERY_BY_SLUG[definition.brewerySlug];
  const beer = brewery?.beers.find((candidate) => candidate.name === definition.beerName && candidate.flagship);
  return brewery && beer ? { brewery, beer } : null;
}

function isResolvedStop(stop: ResolvedStop | null): stop is ResolvedStop {
  return stop !== null;
}

/** Three intentionally small outings, not another all-results surface. */
export default function BeerGuides() {
  return (
    <section id="beer-days" aria-labelledby="beer-days-heading" className="scroll-mt-24">
      <header className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.17em]" style={{ color: "var(--app-ink-3)" }}>Three good moves</p>
          <h2 id="beer-days-heading" className="mt-2 max-w-[10ch] font-serif text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[0.94] tracking-[-0.045em]" style={{ color: "var(--beer-ink)" }}>
            Make a day, not a checklist.
          </h2>
        </div>
        <p className="max-w-[36rem] pb-1 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The smartest beer plan is usually smaller than the internet suggests. These are deliberate pairings built around pace, place, and a signature pour to look for.
        </p>
      </header>

      <div className="mt-9 grid border-y lg:grid-cols-3" style={{ borderColor: "var(--app-border-strong)" }}>
        {BEER_DAYS.map((guide, guideIndex) => {
          const stops = guide.stops.map(resolveStop).filter(isResolvedStop);
          if (stops.length === 0) return null;
          return (
            <article key={guide.slug} aria-labelledby={`beer-day-${guide.slug}`} className="flex flex-col border-b px-1 py-6 last:border-b-0 sm:px-4 lg:border-b-0 lg:border-r lg:px-6 lg:last:border-r-0" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-start justify-between gap-4">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--app-ink-3)" }}>{guide.eyebrow}</p>
                {/* Ghost numeral: 50% ink, not 20 — at 32px this is "large
                    text" (3:1 WCAG floor) and 20% failed it; aria-hidden
                    doesn't exempt VISIBLE text from the contrast rule. */}
                <span aria-hidden className="font-serif text-[32px] leading-none opacity-50" style={{ color: "var(--beer-ink)" }}>0{guideIndex + 1}</span>
              </div>
              <h3 id={`beer-day-${guide.slug}`} className="mt-5 max-w-[11ch] font-serif text-[28px] font-semibold leading-[0.98] tracking-[-0.025em]" style={{ color: "var(--beer-ink)" }}>{guide.title}</h3>
              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{guide.description}</p>

              <ol className="mt-7 divide-y" aria-label={`${guide.title} brewery stops`} style={{ borderColor: "var(--app-border)" }}>
                {stops.map(({ brewery, beer }, stopIndex) => (
                  <li key={brewery.slug} className="grid grid-cols-[38px_1fr_auto] items-center gap-3 py-3 first:border-t" style={{ borderColor: "var(--app-border)" }}>
                    <BreweryLogo brewerySlug={brewery.slug} breweryName={brewery.name} decorative sizes="38px" className="h-[38px] w-[38px] rounded-[8px] bg-white object-contain p-1 shadow-sm" />
                    <div className="min-w-0">
                      <Link href={`/places/${brewery.slug}`} className="block truncate text-[11px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]" style={{ color: "var(--beer-ink)" }}>{brewery.name}</Link>
                      <p className="mt-0.5 truncate text-[9px]" style={{ color: "var(--app-ink-3)" }}>{beer.name}{beer.abv != null ? ` · ${beer.abv.toFixed(1)}%` : ""}</p>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{stopIndex + 1}<ArrowRight className="h-3 w-3" aria-hidden /></span>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 text-[10px] leading-relaxed sm:flex-row sm:justify-between" style={{ color: "var(--app-ink-3)" }}>
        <p className="flex max-w-[32rem] gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>Signature beers, not a live tap list. Verify availability with the brewery.</span></p>
        <p className="flex max-w-[28rem] gap-2"><CarFront className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>For multi-stop outings, use a designated driver or rideshare.</span></p>
      </div>
    </section>
  );
}

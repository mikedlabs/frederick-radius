import Link from "next/link";
import { ArrowUpRight, CarFront, MapPin, Route } from "lucide-react";
import { BreweryLogo } from "./BreweryLogo";
import { BreweryPhoto, type BreweryPhotoMap } from "./BreweryPhoto";
import {
  BREWERY_BY_SLUG,
  FAMILY_BY_KEY,
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
export default function BeerGuides({ photos }: { photos: BreweryPhotoMap }) {
  return (
    <section id="beer-days" aria-labelledby="beer-days-heading" className="-mx-4 scroll-mt-24 overflow-hidden border-y border-white/10 bg-[#15130f] px-4 py-9 text-[#f7f0e4] sm:-mx-5 sm:px-8 sm:py-12 lg:mx-0 lg:rounded-[8px] lg:border lg:px-10">
      <header className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#e3b65d]">Three good moves</p>
          <h2 id="beer-days-heading" className="mt-2 max-w-[9ch] font-serif text-[clamp(3rem,9vw,5.4rem)] font-semibold leading-[0.84] tracking-[-0.055em]">
            Go somewhere good.
          </h2>
        </div>
        <p className="max-w-[36rem] pb-1 text-[14px] leading-relaxed text-white/58">
          Three small routes built around place, pace, and one pour worth knowing. No brewery checklist required.
        </p>
      </header>

      <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
        {BEER_DAYS.map((guide, guideIndex) => {
          const stops = guide.stops.map(resolveStop).filter(isResolvedStop);
          if (stops.length === 0) return null;
          const family = FAMILY_BY_KEY[stops[0].beer.family];
          return (
            <article key={guide.slug} aria-labelledby={`beer-day-${guide.slug}`} className="group relative flex min-h-[390px] w-[84vw] max-w-[340px] shrink-0 snap-center flex-col overflow-hidden border border-white/12 p-5 lg:w-auto lg:max-w-none" style={{ background: `linear-gradient(150deg, ${family.deep}, #1b1612 72%)` }}>
              <div className="absolute inset-0" aria-hidden>
                <BreweryPhoto
                  brewerySlug={stops[0].brewery.slug}
                  breweryName={stops[0].brewery.name}
                  src={photos[stops[0].brewery.slug]}
                  decorative
                  sizes="(max-width: 1024px) 84vw, 28vw"
                  className="h-full w-full"
                  imageClassName="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]"
                />
              </div>
              <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(15,11,8,.1) 0%, color-mix(in srgb, ${family.deep} 82%, rgba(15,11,8,.94)) 54%, #15110e 100%)` }} aria-hidden />
              <div className="flex items-start justify-between gap-4">
                <p className="relative flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-white/52"><Route className="h-3.5 w-3.5" aria-hidden />{guide.eyebrow}</p>
                <span aria-hidden className="relative font-serif text-[44px] leading-none text-white/50">0{guideIndex + 1}</span>
              </div>
              <h3 id={`beer-day-${guide.slug}`} className="relative mt-12 max-w-[9ch] font-serif text-[32px] font-semibold leading-[0.9] tracking-[-0.035em]">{guide.title}</h3>
              <p className="relative mt-3 text-[12px] leading-relaxed text-white/62">{guide.description}</p>

              <ol className="relative mt-auto pt-7" aria-label={`${guide.title} brewery stops`}>
                {stops.map(({ brewery, beer }, stopIndex) => (
                  <li key={brewery.slug} className="relative border-t border-white/14">
                    {stopIndex < stops.length - 1 ? <span className="absolute -bottom-3 left-[20px] top-[54px] w-px bg-[#e3b65d]/45" aria-hidden /> : null}
                    <Link
                      href={`/places/${brewery.slug}`}
                      aria-label={`Open the guide for ${brewery.name}`}
                      className="group grid min-h-11 grid-cols-[42px_1fr_auto] items-center gap-3 py-3 outline-none hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
                    >
                      <BreweryLogo brewerySlug={brewery.slug} breweryName={brewery.name} decorative sizes="42px" className="relative z-10 h-[42px] w-[42px] bg-[#f8f4eb] object-contain p-1 shadow-[0_8px_16px_rgba(0,0,0,.24)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-white group-hover:underline">{brewery.name}</span>
                        <span className="mt-0.5 block truncate text-[9px] text-white/48">{beer.name}{beer.abv != null ? ` · ${beer.abv.toFixed(1)}%` : ""}</span>
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-white/42" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2 text-[10px] leading-relaxed text-white/38 sm:flex-row sm:justify-between">
        <p className="flex max-w-[32rem] gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>Signature beers, not a live tap list. Verify availability with the brewery.</span></p>
        <p className="flex max-w-[28rem] gap-2"><CarFront className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>For multi-stop outings, use a designated driver or rideshare.</span></p>
      </div>
    </section>
  );
}

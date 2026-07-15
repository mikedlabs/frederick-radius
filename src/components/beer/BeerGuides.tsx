import Link from "next/link";
import { Beer, CarFront, MapPin } from "lucide-react";
import {
  BREWERY_BY_SLUG,
  FAMILY_BY_KEY,
  type Beer as BeerRecord,
  type Brewery,
} from "@/data/beers";

type GuideStopDefinition = {
  brewerySlug: string;
  beerName: string;
};

type BeerDayDefinition = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  stops: GuideStopDefinition[];
};

type ResolvedStop = {
  brewery: Brewery;
  beer: BeerRecord;
};

const BEER_DAYS: BeerDayDefinition[] = [
  {
    slug: "downtown-contrast",
    eyebrow: "Downtown Frederick",
    title: "A downtown contrast",
    description:
      "Look for a hop-forward IPA from Olde Mother and a soft Munich helles from Steinhardt. Two different flavors, both downtown.",
    accent: "#7A4A0E",
    stops: [
      { brewerySlug: "olde-mother-brewing-frederick", beerName: "Impressionist" },
      { brewerySlug: "steinhardt-brewing-company-frederick", beerName: "What the Helles" },
    ],
  },
  {
    slug: "farmhouse-afternoon",
    eyebrow: "Mount Airy",
    title: "A farmhouse afternoon",
    description:
      "Two lower-ABV picks from Mount Airy farm breweries: an English bitter from Milkhouse and a farmhouse ale from Frey's.",
    accent: "#6F4C0E",
    stops: [
      { brewerySlug: "milkhouse-brewery-mt-airy", beerName: "Goldie's Best Bitter" },
      { brewerySlug: "freys-farm-mount-airy", beerName: "Farmer Armor" },
    ],
  },
  {
    slug: "one-stop-brunswick",
    eyebrow: "Brunswick",
    title: "Make one stop the whole plan",
    description:
      "Settle in at Smoketown instead of turning the day into a brewery checklist.",
    accent: "#20506A",
    stops: [
      { brewerySlug: "smoketown-brewing-brunswick", beerName: "Country Roads Pilsner" },
    ],
  },
];

function resolveStop(definition: GuideStopDefinition): ResolvedStop {
  const brewery = BREWERY_BY_SLUG[definition.brewerySlug];
  const beer = brewery?.beers.find(
    (candidate) => candidate.name === definition.beerName && candidate.flagship,
  );
  if (!brewery || !beer) {
    throw new Error(
      `Beer guide references a missing signature pour: ${definition.brewerySlug} / ${definition.beerName}`,
    );
  }
  return { brewery, beer };
}

/** Curated day ideas over the durable signature-beer snapshot, never live taps. */
export default function BeerGuides() {
  return (
    <section id="beer-days" aria-labelledby="beer-days-heading" className="space-y-4 scroll-mt-24">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Pick a pace
          </p>
          <h2
            id="beer-days-heading"
            className="font-serif text-[22px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Three ways to make a beer day
          </h2>
        </div>
        <Beer className="h-5 w-5 shrink-0" strokeWidth={1.8} style={{ color: "var(--app-accent-press)" }} aria-hidden />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {BEER_DAYS.map((guide, guideIndex) => {
          const stops = guide.stops.map(resolveStop);
          return (
            <article
              key={guide.slug}
              aria-labelledby={`beer-day-${guide.slug}`}
              className="relative overflow-hidden rounded-[var(--app-radius-lg)] border p-4"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated)",
                boxShadow: "var(--app-edge), var(--app-hi)",
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(85% 75% at 100% 0%, color-mix(in srgb, ${guide.accent} 16%, transparent), transparent 72%)`,
                }}
              />
              <div className="relative space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: guide.accent }}
                    >
                      {guide.eyebrow}
                    </p>
                    <h3
                      id={`beer-day-${guide.slug}`}
                      className="mt-0.5 font-serif text-[18px] font-semibold leading-tight tracking-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {guide.title}
                    </h3>
                  </div>
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold"
                    style={{
                      background: `color-mix(in srgb, ${guide.accent} 13%, var(--app-bg-elevated))`,
                      color: guide.accent,
                      border: `1px solid color-mix(in srgb, ${guide.accent} 30%, var(--app-border))`,
                    }}
                  >
                    0{guideIndex + 1}
                  </span>
                </div>

                <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {guide.description}
                </p>

                <ol className="space-y-2" aria-label={`${guide.title} brewery stops`}>
                  {stops.map(({ brewery, beer }, stopIndex) => {
                    const family = FAMILY_BY_KEY[beer.family];
                    return (
                      <li
                        key={brewery.slug}
                        className="flex gap-2.5 rounded-[var(--app-radius-md)] border p-2.5"
                        style={{
                          borderColor: "var(--app-border)",
                          background: "var(--app-bg-sunken)",
                        }}
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold text-white"
                          style={{ background: family.deep }}
                        >
                          {stopIndex + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/places/${brewery.slug}`}
                            className="text-[13px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                            style={{ color: "var(--app-ink)" }}
                          >
                            {brewery.name}
                          </Link>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                            Signature pour to look for
                          </p>
                          <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                            <span className="font-semibold">{beer.name}</span>
                            <span style={{ color: "var(--app-ink-3)" }}>
                              {` · ${beer.style}`}
                              {beer.abv != null ? ` · ${beer.abv.toFixed(1)}%` : ""}
                            </span>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </article>
          );
        })}
      </div>

      <div
        className="grid gap-2 rounded-[var(--app-radius-md)] border p-3 text-[11px] leading-relaxed sm:grid-cols-2"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-3)",
        }}
      >
        <p className="flex gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            These are signature beers from the guide, not a live tap list. Verify today&rsquo;s availability with the brewery.
          </span>
        </p>
        <p className="flex gap-2">
          <CarFront className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span>For multi-stop outings, use a designated driver or rideshare. Don&rsquo;t drink and drive.</span>
        </p>
      </div>
    </section>
  );
}

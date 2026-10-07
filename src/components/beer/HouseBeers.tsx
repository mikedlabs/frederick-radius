import { ExternalLink } from "lucide-react";
import { BEER_SNAPSHOT_MONTH, BREWERY_BY_SLUG, type Beer } from "@/data/beers";
import { BREWERY_EXPERIENCE_BY_SLUG } from "@/data/brewery-experiences";

/** The house beers a brewery page may name. */
export const HOUSE_BEER_LIMIT = 4;

export type HouseBeers = {
  beers: Beer[];
  /** The brewery's own current beer menu, when one is on file. */
  tapListUrl: string | null;
};

/**
 * Up to four flagships for one of the guided breweries, in the beer guide's
 * own order, plus the brewery's tap list. Null for any place that is not a
 * guided brewery or has no flagship on file. Rotating taps are never listed
 * here; the stored catalog only knows the beers a brewery is built on.
 */
export function houseBeersFor(slug: string): HouseBeers | null {
  const brewery = BREWERY_BY_SLUG[slug];
  if (!brewery) return null;
  const beers = brewery.beers.filter((beer) => beer.flagship).slice(0, HOUSE_BEER_LIMIT);
  if (beers.length === 0) return null;
  return {
    beers,
    tapListUrl: BREWERY_EXPERIENCE_BY_SLUG[slug]?.tapListUrl ?? null,
  };
}

/** "American IPA · 6.3% ABV", or the style alone when ABV is unknown. */
export function houseBeerFacts(beer: Pick<Beer, "style" | "abv">): string {
  return typeof beer.abv === "number" && Number.isFinite(beer.abv)
    ? `${beer.style} · ${beer.abv}% ABV`
    : beer.style;
}

/**
 * House beers on a brewery's place page. Beer is the product's deliberate
 * Amber exception: the 6px dot marks a flagship, the same meaning it has in
 * the beer guide. Everything else stays in Ink on the page's Cream.
 */
export default function HouseBeersSection({ slug }: { slug: string }) {
  const house = houseBeersFor(slug);
  if (!house) return null;

  return (
    <section aria-labelledby="house-beers-heading" className="space-y-2">
      <h2 id="house-beers-heading" className="text-title" style={{ color: "var(--app-ink)" }}>
        House beers
      </h2>
      <p className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
        These are the brewery&apos;s flagship beers as of {BEER_SNAPSHOT_MONTH}.
      </p>
      <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
        {house.beers.map((beer) => (
          <li
            key={beer.name}
            className="flex items-start gap-2.5 border-b py-2.5"
            style={{ borderColor: "var(--app-border)" }}
          >
            <span
              aria-hidden
              data-flagship-dot
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--app-amber)" }}
            />
            <span className="min-w-0">
              <span className="text-title-sm block" style={{ color: "var(--app-ink)" }}>
                {beer.name}
              </span>
              <span className="text-meta-lg block" style={{ color: "var(--app-ink-2)" }}>
                {houseBeerFacts(beer)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {house.tapListUrl ? (
        <a
          href={house.tapListUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 text-meta-lg inline-flex items-center gap-1 font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Check today&apos;s taps
          <ExternalLink aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
        </a>
      ) : null}
    </section>
  );
}

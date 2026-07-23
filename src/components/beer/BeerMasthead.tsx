import Link from "next/link";
import { BREWERIES, ALL_BEERS, BREWERY_BY_SLUG } from "@/data/beers";
import BeerColorRibbon from "./BeerColorRibbon";
import { BreweryPhoto, type BreweryPhotoMap } from "./BreweryPhoto";

/**
 * A visual front door to the county beer guide. It uses an attributable
 * taproom photo when one is available and the brewery's own mark otherwise.
 * The compact color ribbon keeps the catalog cue without turning the page
 * into an amber theme.
 */
export default function BeerMasthead({ photos }: { photos: BreweryPhotoMap }) {
  const breweries = BREWERIES.length;
  const beers = ALL_BEERS.length;
  const featured = [
    BREWERY_BY_SLUG["olde-mother-brewing-frederick"],
    BREWERY_BY_SLUG["attaboy-beer-frederick"],
    BREWERY_BY_SLUG["milkhouse-brewery-mt-airy"],
  ].filter(Boolean);

  return (
    <header className="-mx-4 overflow-hidden border-y bg-[var(--app-bg)] text-[var(--app-ink)] sm:-mx-6" style={{ borderColor: "var(--app-border)" }}>
      <BeerColorRibbon height={10} />
      <div className="relative grid h-[228px] grid-cols-[minmax(0,1.65fr)_minmax(92px,.75fr)] grid-rows-2 gap-px bg-[var(--app-ink)] sm:h-[300px]">
        {featured.map((brewery, index) => (
          <Link
            key={brewery.slug}
            href={`/places/${brewery.slug}`}
            aria-label={`Open ${brewery.name}`}
            className={`group relative overflow-hidden outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-amber)]${index === 0 ? " row-span-2" : ""}`}
          >
            <BreweryPhoto
              brewerySlug={brewery.slug}
              breweryName={brewery.name}
              src={photos[brewery.slug]}
              decorative
              priority={index === 0}
              sizes={index === 0 ? "(max-width: 640px) 70vw, 540px" : "(max-width: 640px) 30vw, 260px"}
              className="absolute inset-0 h-full w-full"
              imageClassName="object-cover transition-transform duration-700 group-hover:scale-[1.025]"
            />
          </Link>
        ))}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgba(20,14,9,.78) 0%, rgba(20,14,9,.4) 46%, rgba(20,14,9,.12) 72%)" }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 max-w-[31rem] p-4 text-[var(--app-on-brand)] sm:p-6">
          <h1 className="font-sans text-[clamp(2rem,8vw,3.25rem)] font-semibold leading-[.96] tracking-[-0.045em] text-balance">
            Beer in Frederick County
          </h1>
        </div>
      </div>
      <div className="px-4 py-3 sm:px-6">
        <p className="max-w-xl text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The guide covers {breweries} breweries and {beers} signature beers across Frederick County.
        </p>
      </div>
    </header>
  );
}

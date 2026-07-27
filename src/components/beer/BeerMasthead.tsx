import { BREWERIES, BREWERY_BY_SLUG } from "@/data/beers";
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
  const featured = [
    BREWERY_BY_SLUG["olde-mother-brewing-frederick"],
    BREWERY_BY_SLUG["attaboy-beer-frederick"],
    BREWERY_BY_SLUG["milkhouse-brewery-mt-airy"],
  ].filter(Boolean);

  return (
    <header className="-mx-4 overflow-hidden border-y bg-[var(--app-bg)] text-[var(--app-ink)] sm:-mx-6" style={{ borderColor: "var(--app-border)" }}>
      <BeerColorRibbon height={6} />
      <div className="px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <h1 className="max-w-[34rem] font-sans text-[clamp(2rem,8vw,3.25rem)] font-semibold leading-[.98] tracking-[-0.045em] text-balance">
          Beer in Frederick County
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Radius has {breweries} brewery guides across Frederick County.
        </p>
      </div>
      <div className="grid h-[158px] grid-cols-[minmax(0,1.65fr)_minmax(92px,.75fr)] grid-rows-2 gap-px bg-[var(--app-border)] sm:h-[230px]">
        {featured.map((brewery, index) => (
          <BreweryPhoto
            key={brewery.slug}
            brewerySlug={brewery.slug}
            breweryName={brewery.name}
            photo={photos[brewery.slug]}
            decorative
            compactFallback={index > 0}
            priority={index === 0}
            sizes={index === 0 ? "(max-width: 640px) 70vw, 540px" : "(max-width: 640px) 30vw, 260px"}
            href={`/places/${brewery.slug}`}
            linkLabel={`Open ${brewery.name}`}
            className={`group relative h-full w-full outline-none${index === 0 ? " row-span-2" : ""}`}
            imageClassName="object-cover transition-transform duration-700 group-hover:scale-[1.025]"
          />
        ))}
      </div>
    </header>
  );
}

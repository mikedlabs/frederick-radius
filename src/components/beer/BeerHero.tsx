import Link from "next/link";
import { ArrowDown, Sparkles } from "lucide-react";
import { ALL_BEERS, BREWERIES, BREWERY_BY_SLUG } from "@/data/beers";
import { BreweryPhoto, type BreweryPhotoMap } from "./BreweryPhoto";

const COVER_ROOM = "olde-mother-brewing-frederick";

/** The beer guide's photo-led cover: Frederick rooms, not generic beer art. */
export default function BeerHero({ photos }: { photos: BreweryPhotoMap }) {
  const leadRoom = BREWERY_BY_SLUG[COVER_ROOM];

  return (
    <header
      aria-labelledby="beer-hero-title"
      className="beer-cover relative -mx-4 -mt-6 overflow-hidden border-y border-black/15 bg-[#f3ead9] text-[#281e14] sm:-mx-5 lg:mx-0 lg:mt-0 lg:rounded-[10px] lg:border"
    >
      <div className="absolute inset-0 beer-cover-light" aria-hidden />

      <div className="relative grid grid-rows-[auto_140px] sm:grid-rows-[auto_230px] lg:min-h-[610px] lg:grid-cols-[minmax(0,1.02fr)_minmax(390px,.98fr)] lg:grid-rows-1">
        <div className="z-10 px-5 pb-4 pt-5 sm:px-9 sm:pb-8 sm:pt-9 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
          <div>
            <p className="flex items-center gap-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-[#85501f] sm:text-[10px]">
              <span className="h-px w-6 bg-[#85501f] sm:w-8" aria-hidden />
              Frederick County beer guide
            </p>
            <h1
              id="beer-hero-title"
              className="mt-3 max-w-none font-serif text-[44px] font-semibold leading-[0.82] tracking-[-0.055em] sm:mt-5 sm:max-w-[9ch] sm:text-[clamp(4rem,12vw,7.8rem)] sm:leading-[0.8]"
            >
              Frederick beer,<br />
              <span className="text-[#85501f]">on tap.</span>
            </h1>
            <p className="mt-3 max-w-[33rem] text-[13px] leading-[1.45] text-black/66 sm:mt-6 sm:text-[16px] sm:leading-relaxed">
              Start with a taproom. Then match a beer to your taste.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2.5 sm:mt-7">
            <Link
              href="#taproom-wall"
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#382517] px-4 text-[12px] font-bold text-[#fffaf2] transition hover:bg-[#24170f] sm:min-h-12 sm:px-5 sm:text-[13px]"
            >
              Choose a taproom
              <ArrowDown className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </Link>
            <Link
              href="#find-your-pour"
              className="inline-flex min-h-11 items-center justify-center gap-2 border-b border-[#9a5c26]/60 text-[12px] font-semibold text-[#7b4722] transition hover:border-[#7b4722] hover:text-[#281e14] sm:min-h-12 sm:text-[13px]"
            >
              Find a beer
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>

        <div className="group relative overflow-hidden border-t border-black/12 bg-[#d8c8ae] lg:border-l lg:border-t-0">
          {leadRoom ? (
            <BreweryPhoto
              brewerySlug={leadRoom.slug}
              breweryName={leadRoom.name}
              src={photos[leadRoom.slug]}
              decorative
              priority
              sizes="(max-width: 1024px) 100vw, 46vw"
              className="h-full w-full"
              imageClassName="object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.035]"
            />
          ) : null}
          <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,5,.05)_10%,rgba(8,7,5,.22)_42%,rgba(8,7,5,.92)_100%)]" />
          <span aria-hidden className="absolute inset-y-0 left-0 hidden w-1/3 bg-[linear-gradient(90deg,rgba(243,234,217,.44),transparent)] lg:block" />

          <div className="absolute right-4 top-4 rotate-1 border border-[#e3b65d]/45 bg-[#171510]/84 px-3 py-2 text-right font-mono uppercase backdrop-blur-md sm:right-6 sm:top-6">
            <span className="block text-[8px] tracking-[0.16em] text-white/44">Guide snapshot</span>
            <span className="mt-0.5 block text-[12px] font-bold tracking-[0.08em] text-[#f3d496]">{BREWERIES.length} breweries · {ALL_BEERS.length} signature beers</span>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-6">
            <p className="font-mono text-[7px] font-bold uppercase tracking-[0.16em] text-[#f3d496]">
              {leadRoom?.name ?? "A Frederick taproom"} · Downtown Frederick
            </p>
            <span className="hidden text-[9px] text-white/48 sm:block">Local taproom photos appear when available.</span>
          </div>
        </div>
      </div>
    </header>
  );
}

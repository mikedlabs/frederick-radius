import Link from "next/link";
import { ArrowDown, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { ALL_BEERS, BREWERIES, BREWERY_BY_SLUG } from "@/data/beers";
import { BreweryLogo } from "./BreweryLogo";
import { BreweryPhoto, type BreweryPhotoMap } from "./BreweryPhoto";

const COVER_ROOMS = [
  "attaboy-beer-frederick",
  "milkhouse-brewery-mt-airy",
  "olde-mother-brewing-frederick",
] as const;

/** The beer guide's photo-led cover: Frederick rooms, not generic beer art. */
export default function BeerHero({ photos }: { photos: BreweryPhotoMap }) {
  const rooms = COVER_ROOMS.map((slug) => BREWERY_BY_SLUG[slug]).filter(Boolean);
  // Lead with a real branded flight so the cover is unmistakably about beer
  // without repeating the default Attaboy taproom featured immediately below.
  const leadRoom = rooms[2] ?? rooms[0];

  return (
    <header
      aria-labelledby="beer-hero-title"
      className="beer-cover relative -mx-4 -mt-6 overflow-hidden border-y border-white/10 bg-[#11100d] text-[#f7f0e4] sm:-mx-5 lg:mx-0 lg:mt-0 lg:rounded-[10px] lg:border"
    >
      <div className="absolute inset-0 beer-cover-light" aria-hidden />

      <div className="relative grid min-h-[580px] grid-rows-[auto_330px] lg:min-h-[610px] lg:grid-cols-[minmax(0,1.02fr)_minmax(390px,.98fr)] lg:grid-rows-1">
        <div className="z-10 flex flex-col justify-between px-5 pb-8 pt-8 sm:px-9 sm:pb-10 sm:pt-10 lg:px-12 lg:py-12">
          <div>
            <p className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e3b65d]">
              <span className="h-px w-8 bg-[#e3b65d]" aria-hidden />
              Frederick County beer guide
            </p>
            <h1
              id="beer-hero-title"
              className="mt-5 max-w-[8ch] font-serif text-[clamp(4rem,16vw,7.8rem)] font-semibold leading-[0.77] tracking-[-0.065em] text-balance"
            >
              Frederick.<br />
              <span className="text-[#e3b65d]">On tap.</span>
            </h1>
            <p className="mt-7 max-w-[33rem] text-[15px] leading-relaxed text-white/66 sm:text-[17px]">
              Pick the room, match your taste, and see what is happening. A better way into the county&rsquo;s beer scene than another list.
            </p>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href="#taproom-board"
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#f7f0e4] px-5 text-[13px] font-bold text-[#17130e] transition hover:bg-white"
            >
              Pull a tap
              <ArrowDown className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </Link>
            <Link
              href="#find-your-pour"
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#e3b65d]/55 px-5 text-[13px] font-semibold text-[#f3d496] transition hover:border-[#e3b65d] hover:bg-[#e3b65d]/10"
            >
              Match my taste
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>

        <div className="group relative overflow-hidden border-t border-white/10 bg-[#1b1712] lg:border-l lg:border-t-0">
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
          <span aria-hidden className="absolute inset-y-0 left-0 hidden w-1/3 bg-[linear-gradient(90deg,rgba(17,16,13,.75),transparent)] lg:block" />

          <div className="absolute right-4 top-4 rotate-1 border border-[#e3b65d]/45 bg-[#171510]/84 px-3 py-2 text-right font-mono uppercase backdrop-blur-md sm:right-6 sm:top-6">
            <span className="block text-[8px] tracking-[0.16em] text-white/44">County pour book</span>
            <span className="mt-0.5 block text-[12px] font-bold tracking-[0.08em] text-[#f3d496]">{BREWERIES.length} rooms · {ALL_BEERS.length} pours</span>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <p className="mb-3 font-mono text-[7px] font-bold uppercase tracking-[0.18em] text-[#f3d496]">Real rooms across the county</p>
            <div className="grid grid-cols-3 gap-2">
              {rooms.map((brewery, index) => (
                <Link
                  key={brewery.slug}
                  href={`/places/${brewery.slug}`}
                  className="group/room flex min-h-[70px] items-center gap-2 border border-white/18 bg-[#11100d]/78 p-2 text-white backdrop-blur-md transition hover:border-[#e3b65d]/62 hover:bg-[#11100d]/90"
                >
                  <BreweryLogo
                    brewerySlug={brewery.slug}
                    breweryName={brewery.name}
                    decorative
                    sizes="42px"
                    className="h-10 w-10 shrink-0 bg-[#f7f0e4] object-contain p-1 shadow-[0_10px_20px_rgba(0,0,0,.32)]"
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-[6.5px] uppercase tracking-[0.12em] text-white/44">
                      {index === 0 ? "City" : index === 1 ? "Farm" : "Downtown"}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[8px] font-semibold leading-tight group-hover/room:underline sm:text-[9px]">
                      {brewery.name}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <nav aria-label="Beer guide shortcuts" className="relative grid grid-cols-3 border-t border-white/10 bg-black/15">
        <Link href="#taproom-board" className="group flex min-h-[62px] items-center justify-center gap-2 border-r border-white/10 px-2 text-center text-[11px] font-semibold text-white/68 transition hover:bg-white/5 hover:text-white">
          <MapPin className="h-3.5 w-3.5 text-[#e3b65d] transition group-hover:-translate-y-0.5" aria-hidden />
          Taprooms
        </Link>
        <Link href="#beer-week" className="group flex min-h-[62px] items-center justify-center gap-2 border-r border-white/10 px-2 text-center text-[11px] font-semibold text-white/68 transition hover:bg-white/5 hover:text-white">
          <CalendarDays className="h-3.5 w-3.5 text-[#e3b65d] transition group-hover:-translate-y-0.5" aria-hidden />
          This week
        </Link>
        <Link href="#find-your-pour" className="group flex min-h-[62px] items-center justify-center gap-2 px-2 text-center text-[11px] font-semibold text-white/68 transition hover:bg-white/5 hover:text-white">
          <Sparkles className="h-3.5 w-3.5 text-[#e3b65d] transition group-hover:-translate-y-0.5" aria-hidden />
          Taste match
        </Link>
      </nav>
    </header>
  );
}

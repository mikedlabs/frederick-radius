import Link from "next/link";
import Image from "next/image";
import { ArrowDown, Search } from "lucide-react";
import { ALL_BEERS, BREWERIES } from "@/data/beers";

/** A calm, photo-led introduction using a real Frederick taproom. */
export default function BeerHero() {
  return (
    <header
      aria-labelledby="beer-hero-title"
      className="beer-cover -mx-4 -mt-6 overflow-hidden border-y border-black/12 bg-[#f5eee2] text-[#281e14] sm:-mx-5 lg:mx-0 lg:mt-0 lg:rounded-[10px] lg:border"
    >
      <div className="grid lg:min-h-[500px] lg:grid-cols-[minmax(0,1fr)_minmax(360px,.9fr)]">
        <div className="px-5 py-7 sm:px-9 sm:py-10 lg:flex lg:flex-col lg:justify-center lg:px-12">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#85501f] sm:text-[10px]">
              Frederick County beer
            </p>
            <h1
              id="beer-hero-title"
              className="mt-3 max-w-[10ch] font-serif text-[46px] font-semibold leading-[0.9] tracking-[-0.045em] sm:mt-4 sm:text-[clamp(3.8rem,8vw,6rem)]"
            >
              Beer in Frederick County.
            </h1>
            <p className="mt-4 max-w-[33rem] text-[13px] leading-relaxed text-black/64 sm:mt-5 sm:text-[15px]">
              Browse {BREWERIES.length} breweries and {ALL_BEERS.length} signature beers, with current hours when available and direct links to brewery tap lists.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 sm:mt-7">
            <Link
              href="#taproom-wall"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#382517] px-5 text-[12px] font-bold text-[#fffaf2] transition hover:bg-[#24170f]"
            >
              Browse breweries
              <ArrowDown className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </Link>
            <Link
              href="#find-your-pour"
              className="inline-flex min-h-11 items-center justify-center gap-2 text-[12px] font-semibold text-[#70451f] transition hover:text-[#281e14]"
            >
              Search by taste
              <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>

        <div className="group relative min-h-[210px] overflow-hidden border-t border-black/10 bg-[#d8c8ae] sm:min-h-[280px] lg:border-l lg:border-t-0">
          <Image
            src="/images/seasons/summer/083.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 46vw"
            className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.02]"
          />
          <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_44%,rgba(13,10,7,.72)_100%)]" />

          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <p className="text-[10px] font-medium text-white/82">
              Downtown Frederick
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

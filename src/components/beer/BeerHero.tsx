import Link from "next/link";
import { ArrowDown, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { ALL_BEERS, BREWERIES } from "@/data/beers";
import { BeerGlassArt } from "./BeerGlassArt";

/** The beer guide's cover: bold enough to feel like a destination, useful enough to move. */
export default function BeerHero() {
  return (
    <header
      aria-labelledby="beer-hero-title"
      className="beer-cover relative -mx-4 -mt-6 overflow-hidden border-y border-white/10 bg-[#11100d] text-[#f7f0e4] sm:-mx-5 lg:mx-0 lg:mt-0 lg:rounded-[10px] lg:border"
    >
      <div className="absolute inset-0 beer-cover-light" aria-hidden />
      <div className="absolute -right-24 top-5 h-64 w-64 rounded-full bg-[#d7851b]/10 blur-3xl sm:right-0" aria-hidden />

      <div className="relative grid min-h-[520px] grid-rows-[1fr_auto] sm:min-h-[560px] lg:grid-cols-[minmax(0,1.05fr)_minmax(330px,.95fr)] lg:grid-rows-1">
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

        <div className="relative min-h-[230px] overflow-hidden border-t border-white/10 lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/16" aria-hidden />
          <div className="beer-cover-glasses absolute inset-x-[-8%] bottom-[-28px] flex items-end justify-center text-[#f7f0e4] sm:inset-x-[2%] lg:inset-x-[-4%] lg:bottom-[-8px]">
            <BeerGlassArt family="stout-porter" variant="pint" className="beer-glass beer-glass-delay-2 h-[205px] w-auto -rotate-3 opacity-80 sm:h-[270px] lg:h-[300px]" />
            <BeerGlassArt family="lager-pilsner" variant="pilsner" className="beer-glass z-10 -ml-8 h-[255px] w-auto opacity-100 sm:h-[330px] lg:h-[385px]" />
            <BeerGlassArt family="sour-wild" variant="tulip" className="beer-glass beer-glass-delay-1 -ml-9 h-[215px] w-auto rotate-3 opacity-85 sm:h-[285px] lg:h-[325px]" />
          </div>
          <div className="absolute right-4 top-4 rotate-2 border border-[#e3b65d]/45 bg-[#171510]/80 px-3 py-2 text-right font-mono uppercase backdrop-blur-sm sm:right-6 sm:top-6">
            <span className="block text-[8px] tracking-[0.16em] text-white/44">County pour book</span>
            <span className="mt-0.5 block text-[12px] font-bold tracking-[0.08em] text-[#f3d496]">{BREWERIES.length} rooms · {ALL_BEERS.length} pours</span>
          </div>
          <p className="absolute bottom-4 left-5 font-mono text-[8px] uppercase tracking-[0.15em] text-white/38 sm:left-7">
            Choose well. Verify the tap.
          </p>
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

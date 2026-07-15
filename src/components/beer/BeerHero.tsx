import Image from "next/image";
import Link from "next/link";
import { ArrowDown, MapPinned, Search } from "lucide-react";
import { ALL_BEERS, BREWERIES } from "@/data/beers";

const START_POINTS = [
  {
    href: "#find-your-pour",
    label: "Match my taste",
    detail: "Build a three-pour shortlist",
    icon: ArrowDown,
  },
  {
    href: "#beer-settings",
    label: "Choose the setting",
    detail: "Creekside, city, farm, or detour",
    icon: MapPinned,
  },
  {
    href: "#all-beer",
    label: "Search everything",
    detail: `${ALL_BEERS.length} pours by style, brewery, or town`,
    icon: Search,
  },
] as const;

/** Cinematic, choice-led entry to the county beer guide. */
export default function BeerHero() {
  return (
    <section
      aria-labelledby="beer-hero-title"
      className="relative isolate min-h-[650px] overflow-hidden rounded-[30px] border sm:min-h-[610px] lg:min-h-[590px]"
      style={{
        borderColor: "rgba(226, 194, 144, 0.26)",
        background: "var(--beer-ink)",
        boxShadow: "0 28px 80px rgba(24, 28, 23, 0.24)",
      }}
    >
      <Image
        src="/images/seasons/spring/Frederick Night.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 1152px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 32px)"
        className="object-cover object-[61%_center]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,15,12,0.50)_0%,rgba(9,15,12,0.80)_58%,rgba(9,15,12,0.98)_100%)] lg:bg-[linear-gradient(90deg,rgba(9,15,12,0.97)_0%,rgba(9,15,12,0.88)_46%,rgba(9,15,12,0.38)_76%,rgba(9,15,12,0.52)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.14] mix-blend-soft-light [background-image:radial-gradient(rgba(255,255,255,.7)_0.55px,transparent_0.55px)] [background-size:5px_5px]"
      />

      <div className="relative z-10 grid min-h-[650px] sm:min-h-[610px] lg:min-h-[590px] lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex flex-col justify-between px-5 pb-8 pt-7 sm:px-9 sm:pb-10 sm:pt-9 lg:px-12 lg:py-11">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/68">
              Frederick County beer field guide
            </p>
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-white/52 sm:block">
              Edition 01 · 2026
            </p>
          </div>

          <div className="max-w-[650px] pb-8 pt-20 sm:pt-24 lg:pb-0 lg:pt-14">
            <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--beer-copper-light)]">
              Drink local. Choose well.
            </p>
            <h1
              id="beer-hero-title"
              className="max-w-[9.5ch] font-serif text-[clamp(3.5rem,9vw,6.8rem)] font-semibold leading-[0.86] tracking-[-0.055em] text-[#f7f0e4] text-balance"
            >
              The county,
              <br />
              <span className="font-normal italic text-[var(--beer-copper-light)]">by the glass.</span>
            </h1>
            <p className="mt-6 max-w-[37rem] text-[15px] leading-relaxed text-white/74 sm:text-[17px]">
              A sharper way into Frederick beer: start with your taste, the room you want, or the day you have. Not a directory.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-white/16 pt-5">
            <Stat value={BREWERIES.length} label="brewery guides" />
            <Stat value={ALL_BEERS.length} label="signature pours" />
            <p className="max-w-[18rem] text-[10px] leading-relaxed text-white/46">
              Editorial guide, not a live tap list. Check today&rsquo;s hours and availability before heading out.
            </p>
          </div>
        </div>

        <nav
          aria-label="Start the Frederick beer guide"
          className="self-end border-t border-white/16 bg-[rgba(9,15,12,0.78)] p-4 backdrop-blur-xl sm:p-5 lg:m-5 lg:rounded-[22px] lg:border"
        >
          <p className="px-2 pb-3 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/46">
            Start with one question
          </p>
          {START_POINTS.map(({ href, label, detail, icon: Icon }, index) => (
            <Link
              key={href}
              href={href}
              className="group grid min-h-[72px] grid-cols-[28px_1fr_auto] items-center gap-2 border-t border-white/12 px-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--beer-copper-light)]"
            >
              <span className="font-mono text-[10px] tabular-nums text-white/35">0{index + 1}</span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{label}</span>
                <span className="mt-0.5 block truncate text-[11px] text-white/48">{detail}</span>
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/18 text-[var(--beer-copper-light)] transition-[transform,background-color] group-hover:translate-x-0.5 group-hover:bg-white/8">
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <p className="flex items-baseline gap-2 text-[#f7f0e4]">
      <span className="font-serif text-[28px] leading-none tabular-nums">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/48">{label}</span>
    </p>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, Route } from "lucide-react";
import { BeerGlassArt } from "./BeerGlassArt";

/**
 * Editorial lead for the Frederick beer guide. The aerial is a user-owned
 * local image; the glasswork is inert SVG. No third-party image, rating, tap,
 * or live-status claim is made here.
 */
export default function BeerHero() {
  return (
    <section
      aria-labelledby="beer-hero-title"
      className="relative isolate min-h-[620px] overflow-hidden rounded-[var(--app-radius-xl)] border sm:min-h-[570px] lg:min-h-[540px]"
      style={{
        borderColor: "color-mix(in srgb, var(--app-accent) 44%, var(--app-border))",
        background: "var(--app-brand-2)",
        boxShadow: "var(--app-elev-3), var(--app-edge), var(--app-hi)",
      }}
    >
      <Image
        src="/images/seasons/spring/Frederick Night.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 1152px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 32px)"
        className="object-cover object-[58%_center]"
      />

      {/* A hard editorial grade protects text contrast while leaving the real
          city lights legible. It intentionally avoids the generic mesh/blob
          treatment retired elsewhere in the design system. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,25,21,0.95)_0%,rgba(8,25,21,0.80)_52%,rgba(8,25,21,0.54)_100%)] lg:bg-[linear-gradient(90deg,rgba(8,25,21,0.97)_0%,rgba(8,25,21,0.90)_43%,rgba(8,25,21,0.45)_76%,rgba(8,25,21,0.30)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[rgba(5,17,14,0.88)] to-transparent lg:h-1/2"
      />

      <div className="relative z-10 grid min-h-[620px] grid-rows-[auto_1fr] sm:min-h-[570px] lg:min-h-[540px] lg:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)] lg:grid-rows-1">
        <div className="flex flex-col justify-center px-5 pb-2 pt-7 sm:px-9 sm:pb-5 sm:pt-10 lg:px-12 lg:py-12">
          <p
            className="eyebrow flex items-center gap-2"
            style={{ color: "color-mix(in srgb, var(--app-accent) 72%, white)" }}
          >
            <span
              aria-hidden
              className="h-px w-7"
              style={{ background: "color-mix(in srgb, var(--app-accent) 72%, white)" }}
            />
            Frederick County beer guide
          </p>

          <h1
            id="beer-hero-title"
            className="mt-4 max-w-[9ch] font-serif text-[clamp(3.25rem,9vw,5.8rem)] font-semibold leading-[0.88] tracking-[-0.045em] text-balance"
            style={{ color: "var(--app-on-brand)" }}
          >
            Frederick,
            <br />
            <span style={{ color: "color-mix(in srgb, var(--app-accent) 74%, white)" }}>
              on tap.
            </span>
          </h1>

          <p
            className="mt-5 max-w-[34rem] text-[15px] leading-relaxed sm:text-[16px]"
            style={{ color: "color-mix(in srgb, var(--app-on-brand) 86%, transparent)" }}
          >
            174 signature pours from 17 local breweries. Start with what sounds good, not a list.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 min-[430px]:flex-row min-[430px]:flex-wrap">
            <Link
              href="#find-your-pour"
              className="tap-44-y inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: "var(--app-bg-elevated-solid)",
                color: "var(--app-brand-2)",
                boxShadow: "0 10px 24px rgba(5, 17, 14, 0.28), var(--app-hi)",
              }}
            >
              Find your pour
              <ArrowDown className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </Link>
            <Link
              href="#beer-days"
              className="tap-44-y inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-[14px] font-semibold transition-colors hover:bg-white/10"
              style={{
                borderColor: "color-mix(in srgb, var(--app-on-brand) 42%, transparent)",
                background: "rgba(8, 25, 21, 0.28)",
                color: "var(--app-on-brand)",
              }}
            >
              Build a beer day
              <Route className="h-4 w-4" strokeWidth={2.1} aria-hidden />
            </Link>
          </div>

          <p
            className="mt-5 inline-flex w-fit items-center rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.09em]"
            style={{
              borderColor: "color-mix(in srgb, var(--app-accent) 46%, transparent)",
              background: "rgba(8, 25, 21, 0.48)",
              color: "color-mix(in srgb, var(--app-on-brand) 78%, transparent)",
            }}
          >
            Signature-pour guide · Verify today&rsquo;s availability before you go.
          </p>
        </div>

        <div className="relative min-h-[230px] overflow-hidden sm:min-h-[260px] lg:min-h-0">
          <div
            aria-hidden
            className="sw-m-facet absolute inset-y-4 right-0 w-[88%] border-l opacity-70 lg:inset-y-10 lg:w-full"
            style={{ borderColor: "rgba(255,255,255,0.18)" }}
          />

          <div
            aria-hidden
            className="absolute right-4 top-3 rotate-2 rounded-[var(--app-radius-sm)] border px-3 py-2 text-right font-mono uppercase sm:right-8 sm:top-7 lg:right-8 lg:top-10"
            style={{
              borderColor: "color-mix(in srgb, var(--app-accent) 54%, transparent)",
              background: "rgba(8, 25, 21, 0.48)",
              color: "var(--app-on-brand)",
              boxShadow: "var(--app-edge)",
            }}
          >
            <span className="block text-[9px] tracking-[0.16em] opacity-70">County pour book</span>
            <span className="mt-0.5 block text-[13px] font-bold tracking-[0.08em]">17 breweries</span>
          </div>

          <BeerGlassArt
            family="stout-porter"
            variant="pint"
            className="absolute -bottom-8 left-[7%] h-[205px] w-auto -rotate-[8deg] drop-shadow-[0_22px_18px_rgba(3,12,10,0.48)] sm:left-[20%] sm:h-[235px] lg:-bottom-7 lg:left-[2%] lg:h-[285px]"
          />
          <BeerGlassArt
            family="lager-pilsner"
            variant="pilsner"
            className="absolute -bottom-7 left-1/2 z-10 h-[245px] w-auto -translate-x-1/2 drop-shadow-[0_26px_20px_rgba(3,12,10,0.55)] sm:h-[280px] lg:-bottom-8 lg:h-[350px]"
          />
          <BeerGlassArt
            family="sour-wild"
            variant="tulip"
            className="absolute -bottom-9 right-[5%] h-[215px] w-auto rotate-[7deg] drop-shadow-[0_22px_18px_rgba(3,12,10,0.48)] sm:right-[19%] sm:h-[245px] lg:-bottom-8 lg:right-[1%] lg:h-[300px]"
          />
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/15"
      />
    </section>
  );
}

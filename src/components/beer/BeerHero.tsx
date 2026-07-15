import Link from "next/link";
import { ArrowDown, Route } from "lucide-react";
import { BeerGlassArt } from "./BeerGlassArt";

/**
 * Editorial lead for the Frederick beer guide, as a FIELD-GUIDE PLATE.
 *
 * The first cover was a dark marketing-green block over a blurred night
 * photo with flat cartoon glasses — off-system for the app (the dark
 * palette belongs to /pitch) and the exact clipart style the design-tells
 * audit exists to catch ("the cover looks cheesy", owner). This version
 * speaks the same language as every other page: paper cream ground,
 * Fraunces display, engraved glassware in ink, a mono ledger stamp for the
 * counts. No photo, no priority image, no contrast grades to maintain.
 * No third-party image, rating, tap, or live-status claim is made here.
 */
export default function BeerHero() {
  return (
    <section
      aria-labelledby="beer-hero-title"
      className="fg-plate relative overflow-hidden rounded-[var(--app-radius-xl)] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        backgroundImage: "var(--app-paper-light)",
        boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
      }}
    >
      <div className="grid gap-2 px-5 pt-7 sm:px-9 sm:pt-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:gap-8 lg:px-12 lg:pt-11">
        <div className="min-w-0">
          <p className="fg-eyebrow flex items-center gap-2">
            <span aria-hidden className="h-px w-7" style={{ background: "currentColor" }} />
            Frederick County beer guide
          </p>

          <h1
            id="beer-hero-title"
            className="mt-3 max-w-[9ch] font-serif text-[clamp(3rem,8.5vw,5.4rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-balance"
            style={{ color: "var(--app-ink)" }}
          >
            Frederick,
            <br />
            <span style={{ color: "var(--app-brand-2)" }}>on tap.</span>
          </h1>

          <p className="mt-4 max-w-[34rem] text-[15px] leading-relaxed sm:text-[16px]" style={{ color: "var(--app-ink-2)" }}>
            174 signature pours from 17 local breweries. Start with what sounds good, not a list.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 min-[430px]:flex-row min-[430px]:flex-wrap">
            <Link
              href="#find-your-pour"
              className="tap-44-y tactile-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold"
              style={{
                background: "var(--app-brand-2)",
                color: "var(--app-on-brand)",
                boxShadow: "var(--app-elev-1), var(--app-hi)",
              }}
            >
              Find your pour
              <ArrowDown className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </Link>
            <Link
              href="#beer-days"
              className="tap-44-y tactile-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-[14px] font-semibold"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated-solid)",
                color: "var(--app-ink)",
                boxShadow: "var(--app-elev-1), var(--app-hi)",
              }}
            >
              Build a beer day
              <Route className="h-4 w-4" strokeWidth={2.1} aria-hidden />
            </Link>
          </div>

          <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--app-ink-3)" }}>
            Signature-pour guide · Verify today&rsquo;s availability before you go.
          </p>
        </div>

        {/* The plate art: three engraved pours on a printed counter line,
            with the pour-book count as a stamped ledger tablet. */}
        <div className="relative mt-2 min-w-0 lg:mt-0" style={{ color: "var(--app-ink)" }}>
          <div
            aria-hidden
            className="absolute right-1 top-0 rotate-[1.5deg] rounded-[var(--app-radius-sm)] border px-3 py-2 text-right font-mono uppercase"
            style={{
              borderColor: "color-mix(in srgb, var(--app-ink) 35%, transparent)",
              background: "color-mix(in srgb, var(--app-accent) 12%, var(--app-bg-elevated-solid))",
              color: "var(--app-ink)",
              boxShadow: "var(--app-edge)",
            }}
          >
            <span className="block text-[9px] tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
              County pour book
            </span>
            <span className="mt-0.5 block text-[13px] font-bold tracking-[0.08em]">17 breweries</span>
          </div>

          <div className="flex items-end justify-center pt-10 sm:gap-2 lg:h-full lg:pt-6">
            <BeerGlassArt family="stout-porter" variant="pint" className="h-[128px] w-auto shrink sm:h-[175px] lg:h-[215px]" />
            <BeerGlassArt family="lager-pilsner" variant="pilsner" className="h-[150px] w-auto shrink sm:h-[200px] lg:h-[250px]" />
            <BeerGlassArt family="sour-wild" variant="tulip" className="h-[132px] w-auto shrink sm:h-[180px] lg:h-[220px]" />
          </div>
        </div>
      </div>

      {/* Plate footer rule — the same caption grammar the Today plates use. */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-1 sm:px-9 lg:px-12 lg:pb-5">
        <div className="fg-rule flex-1" />
        <span className="fg-plate-no shrink-0">Pl. XVII</span>
      </div>
    </section>
  );
}

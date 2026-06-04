import Image from "next/image";
import {
  Sparkles,
  Footprints,
  Coffee,
  UtensilsCrossed,
  Trees,
  Palette,
  Wand2,
  Star,
  Flag,
  Navigation,
  Share2,
  ChevronRight,
  Sunrise,
  Sunset,
  type LucideIcon,
} from "lucide-react";
import { PLACES, HERO_AERIAL } from "./data";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * Plan — a sequenced day in Frederick, auto-built into a route.
 *
 * Composition: a cinematic dark "playbill" rather than a list. A full-bleed
 * aerial cover carries the day's title + the auto-optimize magic, then the
 * itinerary becomes a literal ROUTE — a dashed map-spine running down a
 * left time-rail, with overlapping photo stop-cards strung along it and
 * "X min walk" travel pills bridging each leg.
 */

const STOP_ICON: Record<string, LucideIcon> = {
  Coffee,
  Restaurant: UtensilsCrossed,
  Park: Trees,
  Gallery: Palette,
};

// Pick four downtown-walkable stops in a believable morning→evening arc.
const bySlug = (slug: string) => PLACES.find((p) => p.slug === slug)!;
const STOPS = [
  {
    place: bySlug("back-street-brews-coffee-tea-house-brunswick"),
    time: "8:30",
    period: "AM",
    note: "Open the day slow — corner roaster + a window seat.",
    walk: "6 min walk",
  },
  {
    place: bySlug("carroll-creek-linear-park-frederick"),
    time: "9:45",
    period: "AM",
    note: "Wander the waterway before the gardens fill in.",
    walk: "4 min walk",
  },
  {
    place: bySlug("dream-free-art-frederick"),
    time: "11:30",
    period: "AM",
    note: "Open studio — the light is best mid-morning.",
    walk: "5 min walk",
  },
  {
    place: bySlug("k-town-takeout"),
    time: "1:00",
    period: "PM",
    note: "Late lunch to close the loop. Family-owned, brand new.",
    walk: null,
  },
];

const SHADOW =
  "0 1px 2px rgba(26,24,21,0.05), 0 22px 48px -24px rgba(26,24,21,0.30)";
const CARD_SHADOW =
  "0 1px 2px rgba(0,0,0,0.25), 0 26px 50px -28px rgba(0,0,0,0.70)";

export default function PlanMock() {
  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[440px] overflow-hidden"
      style={{ background: "#13110E" }}
    >
      {/* ---- Cinematic aerial cover ---- */}
      <header className="relative h-[418px] w-full overflow-hidden">
        <Image
          src={HERO_AERIAL}
          alt="Aerial view of downtown Frederick at golden hour"
          fill
          priority
          sizes="440px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
        {/* legibility wash + bottom fade into the dark canvas */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(19,17,14,0.62) 0%, rgba(19,17,14,0.05) 26%, rgba(19,17,14,0.18) 55%, rgba(19,17,14,0.86) 88%, #13110E 100%)",
          }}
        />

        {/* top status row */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
            style={{
              background: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "#F0C25A" }} aria-hidden />
            Auto-built
          </span>
          <button
            type="button"
            aria-label="Share this plan"
            className="grid h-9 w-9 place-items-center rounded-full text-white"
            style={{
              background: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
            }}
          >
            <Share2 className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* title block */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-7">
          <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-white/70">
            Your day · Downtown Frederick
          </p>
          <h1
            className="mt-2 text-[40px] font-bold leading-[0.96] tracking-[-0.02em] text-white"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            A slow
            <br />
            creek-side
            <br />
            morning
          </h1>

          {/* trip meta chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MetaChip>
              <Flag className="h-3.5 w-3.5" aria-hidden />
              4 stops
            </MetaChip>
            <MetaChip>
              <Footprints className="h-3.5 w-3.5" aria-hidden />
              15 min walking
            </MetaChip>
            <MetaChip>
              <Sunrise className="h-3.5 w-3.5" aria-hidden />
              8:30a
              <span className="opacity-50">–</span>
              <Sunset className="h-3.5 w-3.5" aria-hidden />
              2:30p
            </MetaChip>
          </div>
        </div>
      </header>

      {/* ---- "optimized" magic strip ---- */}
      <div className="px-5">
        <div
          className="-mt-1 flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background:
              "linear-gradient(100deg, rgba(160,58,34,0.20), rgba(201,150,50,0.16))",
            boxShadow: "inset 0 0 0 1px rgba(240,194,90,0.28)",
          }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(240,194,90,0.18)" }}
          >
            <Wand2 className="h-[18px] w-[18px]" style={{ color: "#F0C25A" }} aria-hidden />
          </span>
          <p className="text-[13px] leading-snug text-white/85">
            <span className="font-semibold text-white">Route optimized.</span>{" "}
            Reordered to cut backtracking — every leg is under 6 minutes on foot.
          </p>
        </div>
      </div>

      {/* ---- The route timeline ---- */}
      <section className="relative px-5 pb-2 pt-6">
        {/* dashed map-spine running behind the time rail */}
        <span
          aria-hidden
          className="absolute bottom-[96px] left-[34px] top-3 w-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(240,194,90,0.55) 0 7px, transparent 7px 15px)",
          }}
        />

        <ol className="space-y-0">
          {STOPS.map((stop, i) => {
            const p = stop.place;
            const Icon = STOP_ICON[p.category] ?? Coffee;
            const isLast = i === STOPS.length - 1;
            return (
              <li key={p.slug} className="relative">
                {/* time-rail node */}
                <div className="absolute left-0 top-1 flex w-[28px] flex-col items-center">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold text-white"
                    style={{
                      background: p.color,
                      boxShadow: `0 0 0 4px #13110E, 0 0 0 5px ${p.color}66`,
                    }}
                  >
                    {i + 1}
                  </span>
                </div>

                {/* stop card */}
                <article className="ml-[52px] pb-7">
                  {/* time header */}
                  <div className="mb-2 flex items-baseline gap-1.5">
                    <span
                      className="text-[20px] font-bold leading-none tracking-tight text-white"
                      style={{ fontFamily: "var(--font-display), Georgia, serif" }}
                    >
                      {stop.time}
                    </span>
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-white/55">
                      {stop.period}
                    </span>
                  </div>

                  <div
                    className="overflow-hidden rounded-[20px]"
                    style={{
                      background: "var(--app-bg-elevated-solid)",
                      boxShadow: CARD_SHADOW,
                    }}
                  >
                    {/* photo */}
                    <div className="relative h-40 w-full">
                      <Image
                        src={p.photo}
                        alt={p.name}
                        fill
                        sizes="440px"
                        placeholder="blur"
                        blurDataURL={PAPER_CREAM_BLUR}
                        className="object-cover"
                      />
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(0,0,0,0.32) 0%, transparent 38%, transparent 60%, rgba(0,0,0,0.30) 100%)",
                        }}
                      />
                      {/* category tag */}
                      <span
                        className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                        style={{
                          background: "rgba(20,18,14,0.55)",
                          backdropFilter: "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                        }}
                      >
                        <Icon
                          className="h-3.5 w-3.5"
                          style={{ color: "#F4EFE6" }}
                          aria-hidden
                        />
                        {p.category}
                      </span>
                      {/* open + distance */}
                      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5">
                        {p.open && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                            style={{
                              background: "rgba(20,18,14,0.55)",
                              color: "#7BE0A0",
                              backdropFilter: "blur(8px)",
                              WebkitBackdropFilter: "blur(8px)",
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: "#43C97A" }}
                              aria-hidden
                            />
                            Open · til {p.closes}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* body */}
                    <div className="px-4 pb-4 pt-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <h2
                          className="text-[20px] font-bold leading-tight tracking-[-0.01em]"
                          style={{
                            fontFamily: "var(--font-display), Georgia, serif",
                            color: "var(--app-ink)",
                          }}
                        >
                          {p.name}
                        </h2>
                        <span
                          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                          style={{ background: "var(--app-bg)", color: "var(--app-ink-2)" }}
                          aria-hidden
                        >
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </div>

                      <p
                        className="mt-1 text-[13.5px] leading-snug"
                        style={{ color: "var(--app-ink-2)" }}
                      >
                        {stop.note}
                      </p>

                      {/* stat row */}
                      <div className="mt-3 flex items-center gap-3 text-[12.5px]">
                        <span
                          className="inline-flex items-center gap-1 font-semibold"
                          style={{ color: "var(--app-ink)" }}
                        >
                          <Star
                            className="h-3.5 w-3.5"
                            style={{ color: "var(--app-accent)", fill: "var(--app-accent)" }}
                            aria-hidden
                          />
                          {p.rating.toFixed(1)}
                        </span>
                        <span style={{ color: "var(--app-ink-3)" }}>
                          {p.reviews.toLocaleString()} reviews
                        </span>
                        <span
                          aria-hidden
                          className="h-1 w-1 rounded-full"
                          style={{ background: "var(--app-border)" }}
                        />
                        <span style={{ color: "var(--app-ink-3)" }}>
                          {p.neighborhood} · {p.price}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* travel pill bridging to the next stop */}
                  {!isLast && stop.walk && (
                    <div className="relative mt-3 flex items-center gap-2 pl-1">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
                        }}
                      >
                        <Footprints
                          className="h-3.5 w-3.5"
                          style={{ color: "#F0C25A" }}
                          aria-hidden
                        />
                        {stop.walk}
                      </span>
                      <span className="text-[12px] text-white/40">to next stop</span>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ol>

        {/* finish flag */}
        <div className="ml-[52px] flex items-center gap-2 pb-1">
          <span
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{
              background: "var(--app-positive)",
              boxShadow: "0 0 0 4px #13110E",
              marginLeft: "-52px",
            }}
            aria-hidden
          >
            <Flag className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-[13px] font-semibold text-white/70">
            End of the loop — you&apos;re back where you started.
          </span>
        </div>
      </section>

      {/* ---- Sticky action bar ---- */}
      <div className="sticky bottom-0 z-10 mt-3 px-5 pb-6 pt-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 top-[-32px]"
          style={{
            background:
              "linear-gradient(180deg, transparent, #13110E 42%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <button
            type="button"
            className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white"
            style={{ background: "var(--app-brand)", boxShadow: SHADOW }}
          >
            <Navigation className="h-[18px] w-[18px]" aria-hidden />
            Start the route
          </button>
          <button
            type="button"
            aria-label="Re-shuffle the plan"
            className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full text-white"
            style={{
              background: "rgba(255,255,255,0.10)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
            }}
          >
            <Sparkles className="h-5 w-5" style={{ color: "#F0C25A" }} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-white"
      style={{
        background: "rgba(255,255,255,0.12)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      }}
    >
      {children}
    </span>
  );
}

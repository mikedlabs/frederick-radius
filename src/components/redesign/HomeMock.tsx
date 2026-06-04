import Image from "next/image";
import {
  Sunrise,
  Wind,
  Navigation,
  MapPin,
  Star,
  ArrowUpRight,
  Coffee,
  UtensilsCrossed,
  TreePine,
  Sparkles,
  Ticket,
  Clock,
} from "lucide-react";
import { PLACES, EVENTS, HERO_AERIAL } from "./data";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * Home / Today — the daily front door.
 *
 * Composition: a cinematic full-bleed season AERIAL owns the top ~52% of the
 * 9:16 canvas with a glass almanac bar floating on it (date · weather · sun).
 * The warm cream "today" sheet then lifts UP over the aerial — a magazine
 * cover folding into the field guide — carrying an open-now snap rail of
 * three places across categories, one tonight event, and a map-peek footer.
 */

const DEPTH =
  "0 1px 2px rgba(26,24,21,0.05), 0 22px 48px -24px rgba(26,24,21,0.30)";

// Three places across distinct categories for the "open now" rail.
const coffee = PLACES.find((p) => p.category === "Coffee")!; // Back Street Brews
const park = PLACES.find((p) => p.category === "Park")!; // Carroll Creek
const restaurant = PLACES.find((p) => p.category === "Restaurant")!; // K Town
const gallery = PLACES.find((p) => p.category === "Gallery")!; // Dream Free Art
const rail = [coffee, restaurant, park];
const tonight = EVENTS[0]; // Alive @ Five

const CATEGORY_ICON: Record<
  string,
  React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
> = {
  Coffee,
  Restaurant: UtensilsCrossed,
  Park: TreePine,
  Gallery: Sparkles,
};

function CatIcon({
  category,
  size = 13,
  className,
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category] ?? Sparkles;
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden />;
}

export default function HomeMock() {
  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[440px] overflow-hidden"
      style={{ background: "var(--app-bg)" }}
    >
      {/* ============== CINEMATIC AERIAL COVER ============== */}
      <div className="relative h-[460px] w-full">
        <Image
          src={HERO_AERIAL}
          alt="Aerial view of downtown Frederick in early autumn"
          fill
          priority
          sizes="440px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
        {/* legibility + warm vignette into the cream sheet below */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,16,11,0.62) 0%, rgba(20,16,11,0.12) 26%, rgba(20,16,11,0.04) 52%, rgba(20,16,11,0.46) 82%, var(--app-bg) 100%)",
          }}
        />

        {/* --- floating glass status bar --- */}
        <div className="absolute inset-x-4 top-3 flex items-center justify-between">
          <span
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white/95"
            style={{
              background: "rgba(20,16,11,0.34)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            FREDERICK · MD
          </span>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/95"
            style={{
              background: "rgba(20,16,11,0.34)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <Navigation size={15} strokeWidth={2.2} aria-hidden />
          </span>
        </div>

        {/* --- cover headline --- */}
        <div className="absolute inset-x-5 top-[78px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/80">
            Wednesday · June 4
          </p>
          <h1
            className="mt-2 max-w-[300px] text-[42px] font-semibold leading-[0.96] tracking-[-0.02em] text-white"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            A bright, breezy
            <br />
            day downtown.
          </h1>
        </div>

        {/* --- glass almanac strip (weather + sun) --- */}
        <div className="absolute inset-x-4 bottom-[92px]">
          <div
            className="flex items-stretch overflow-hidden rounded-2xl text-white"
            style={{
              background: "rgba(20,16,11,0.30)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.16)",
            }}
          >
            <div className="flex flex-1 flex-col items-center gap-1 px-2 py-3">
              <span
                className="text-[26px] font-semibold leading-none tracking-[-0.02em]"
                style={{ fontFamily: "var(--font-display), Georgia, serif" }}
              >
                74°
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/70">
                Clear
              </span>
            </div>
            <div className="my-3 w-px bg-white/15" aria-hidden />
            <div className="flex flex-1 flex-col items-center gap-1.5 px-2 py-3">
              <Wind size={17} strokeWidth={2} className="text-white/90" aria-hidden />
              <span className="text-[11px] font-semibold leading-none">8 mph</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/60">
                Breeze
              </span>
            </div>
            <div className="my-3 w-px bg-white/15" aria-hidden />
            <div className="flex flex-1 flex-col items-center gap-1.5 px-2 py-3">
              <Sunrise size={17} strokeWidth={2} className="text-white/90" aria-hidden />
              <span className="text-[11px] font-semibold leading-none">8:34</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/60">
                Sunset
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ============== TODAY SHEET (lifts over the cover) ============== */}
      <div className="relative -mt-12 rounded-t-[30px] px-5 pb-10 pt-2" style={{ background: "var(--app-bg)" }}>
        {/* grabber */}
        <div
          className="mx-auto mb-5 h-1 w-10 rounded-full"
          style={{ background: "var(--app-border)" }}
          aria-hidden
        />

        {/* ---- Open now rail ---- */}
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className="relative flex h-2 w-2"
                aria-hidden
              >
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-60"
                  style={{ background: "var(--app-positive)" }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ background: "var(--app-positive)" }}
                />
              </span>
              <span
                className="text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: "var(--app-positive)" }}
              >
                Open right now
              </span>
            </div>
            <h2
              className="mt-1 text-[23px] font-semibold leading-tight tracking-[-0.01em]"
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                color: "var(--app-ink)",
              }}
            >
              Worth a walk
            </h2>
          </div>
          <span
            className="mb-1 flex items-center gap-0.5 text-[12px] font-semibold"
            style={{ color: "var(--app-cool)" }}
          >
            Map
            <MapPin size={13} strokeWidth={2.4} aria-hidden />
          </span>
        </div>

        {/* horizontal snap rail */}
        <div className="-mx-5 mb-7 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rail.map((p, i) => (
            <article
              key={p.slug}
              className="relative w-[208px] shrink-0 snap-start overflow-hidden rounded-3xl"
              style={{
                background: "var(--app-bg-elevated-solid)",
                boxShadow: DEPTH,
              }}
            >
              <span className="relative block h-[166px] w-full overflow-hidden">
                <Image
                  src={p.photo}
                  alt={p.name}
                  fill
                  sizes="208px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                  priority={i === 0}
                />
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(20,16,11,0) 42%, rgba(20,16,11,0.55) 100%)",
                  }}
                />
                {/* category chip */}
                <span
                  className="absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ background: p.color }}
                >
                  <CatIcon category={p.category} size={11} />
                  {p.category}
                </span>
                {/* distance + close on glass */}
                <span
                  className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                  style={{
                    background: "rgba(20,16,11,0.42)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                  }}
                >
                  <Navigation size={10} strokeWidth={2.4} aria-hidden />
                  {p.distance}
                </span>
              </span>

              <div className="px-3.5 pb-3.5 pt-3">
                <h3
                  className="truncate text-[16px] font-semibold tracking-[-0.01em]"
                  style={{ color: "var(--app-ink)" }}
                >
                  {p.name}
                </h3>
                <div className="mt-1 flex items-center gap-1.5 text-[12px]">
                  <Star
                    size={13}
                    className="fill-current"
                    style={{ color: "var(--app-accent)" }}
                    aria-hidden
                  />
                  <span className="font-bold" style={{ color: "var(--app-ink)" }}>
                    {p.rating.toFixed(1)}
                  </span>
                  <span style={{ color: "var(--app-ink-3)" }}>
                    · {p.neighborhood} · {p.price}
                  </span>
                </div>
                <p
                  className="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold"
                  style={{ color: "var(--app-positive)" }}
                >
                  <Clock size={11} strokeWidth={2.4} aria-hidden />
                  Open till {p.closes}
                </p>
              </div>
            </article>
          ))}
        </div>

        {/* ---- Tonight: feature event ---- */}
        <div className="mb-3 flex items-center gap-2">
          <Ticket
            size={15}
            strokeWidth={2.2}
            style={{ color: "var(--app-brand)" }}
            aria-hidden
          />
          <h2
            className="text-[14px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--app-ink-2)" }}
          >
            Happening tonight
          </h2>
        </div>

        <article
          className="relative mb-7 overflow-hidden rounded-3xl"
          style={{ background: "var(--app-bg-elevated-solid)", boxShadow: DEPTH }}
        >
          <span className="relative block h-[170px] w-full overflow-hidden">
            <Image
              src={tonight.photo}
              alt={tonight.title}
              fill
              sizes="440px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(20,16,11,0.05) 0%, rgba(20,16,11,0.30) 55%, rgba(20,16,11,0.80) 100%)",
              }}
            />
            <span
              className="absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
              style={{ background: tonight.color }}
            >
              {tonight.day} · {tonight.time}
            </span>
            <div className="absolute inset-x-4 bottom-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/75">
                {tonight.category}
              </p>
              <h3
                className="mt-0.5 text-[25px] font-semibold leading-tight tracking-[-0.01em] text-white"
                style={{ fontFamily: "var(--font-display), Georgia, serif" }}
              >
                {tonight.title}
              </h3>
              <p className="mt-0.5 flex items-center gap-1 text-[12.5px] font-medium text-white/85">
                <MapPin size={12} strokeWidth={2.2} aria-hidden />
                {tonight.venue}
              </p>
            </div>
          </span>
        </article>

        {/* ---- Map peek footer ---- */}
        <h2
          className="mb-3 text-[14px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          One more idea
        </h2>
        <article
          className="flex items-center gap-3.5 overflow-hidden rounded-3xl p-2.5 pr-4"
          style={{ background: "var(--app-bg-elevated-solid)", boxShadow: DEPTH }}
        >
          <span className="relative block h-[78px] w-[78px] shrink-0 overflow-hidden rounded-2xl">
            <Image
              src={gallery.photo}
              alt={gallery.name}
              fill
              sizes="78px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white"
                style={{ background: gallery.color }}
              >
                <CatIcon category={gallery.category} size={9} />
                {gallery.category}
              </span>
              <span
                className="text-[11px] font-semibold"
                style={{ color: "var(--app-positive)" }}
              >
                Open
              </span>
            </div>
            <h3
              className="mt-1 truncate text-[16px] font-semibold tracking-[-0.01em]"
              style={{ color: "var(--app-ink)" }}
            >
              {gallery.name}
            </h3>
            <p
              className="mt-0.5 truncate text-[12.5px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {gallery.blurb}
            </p>
          </div>
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "var(--app-brand)" }}
            aria-hidden
          >
            <ArrowUpRight size={18} strokeWidth={2.4} />
          </span>
        </article>
      </div>
    </div>
  );
}

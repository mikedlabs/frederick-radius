import Image from "next/image";
import {
  ChevronLeft,
  Bookmark,
  Navigation,
  Star,
  Clock,
  MapPin,
  Sunset,
  Quote,
  ArrowUpRight,
  Camera,
} from "lucide-react";
import { PLACES, AERIALS, HERO_AERIAL } from "./data";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * Place detail — the payoff screen.
 *
 * Subject: Carroll Creek Linear Park, told "from above." A full-bleed
 * aerial stage fills the top of the 9:16 canvas; a cream payoff sheet
 * overlaps the seam (layered depth) carrying rating, blurb, an hours
 * timeline, and an aerial strip; a nearby snap-rail and a pinned action
 * bar close it out. Purely presentational server component.
 */

const DEPTH_SHADOW =
  "0 1px 2px rgba(26,24,21,0.05), 0 22px 48px -24px rgba(26,24,21,0.30)";

export default function PlaceMock() {
  // Subject + two nearby places, pulled from curated data (photos match labels).
  const place = PLACES.find((p) => p.slug === "carroll-creek-linear-park-frederick")!;
  const nearby = PLACES.filter(
    (p) =>
      p.neighborhood === "Downtown" &&
      p.slug !== place.slug &&
      (p.slug === "national-museum-civil-war-medicine-frederick" ||
        p.slug === "dream-free-art-frederick"),
  );

  // "From above" aerials — owner drone photos. Hero is the seam between sky + sheet.
  const heroAerial = HERO_AERIAL;
  const stripAerials = AERIALS.filter((src) => src !== heroAerial).slice(0, 3);

  const ratingStars = Math.round(place.rating);

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[440px] overflow-hidden"
      style={{ background: "#14110D" }}
    >
      {/* ============================ AERIAL STAGE ============================ */}
      <section className="relative h-[480px] w-full">
        <Image
          src={heroAerial}
          alt="Carroll Creek Linear Park seen from above in autumn"
          fill
          sizes="440px"
          priority
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
        {/* Cinematic legibility scrims */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,17,13,0.55) 0%, rgba(20,17,13,0) 26%, rgba(20,17,13,0) 52%, rgba(20,17,13,0.82) 100%)",
          }}
        />

        {/* Floating top bar */}
        <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-12">
          <GlassButton label="Back">
            <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
          </GlassButton>
          <span
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              color: "rgba(244,239,230,0.92)",
              background: "rgba(20,17,13,0.32)",
              border: "1px solid rgba(244,239,230,0.22)",
              backdropFilter: "blur(10px)",
            }}
          >
            From above
          </span>
          <GlassButton label="Save this place">
            <Bookmark className="h-5 w-5" strokeWidth={2.25} />
          </GlassButton>
        </header>

        {/* Title block, lifted off the floor of the stage */}
        <div className="absolute inset-x-0 bottom-0 px-6 pb-14">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{
                color: "#F4EFE6",
                background: place.color,
                boxShadow: "0 6px 18px -8px rgba(0,0,0,0.7)",
              }}
            >
              {place.category}
            </span>
            <OpenPill open={place.open} closes={place.closes} />
          </div>

          <h1
            className="text-[40px] leading-[0.98] tracking-[-0.02em]"
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              color: "#FBF8F1",
              fontWeight: 600,
              textShadow: "0 2px 20px rgba(0,0,0,0.45)",
            }}
          >
            Carroll Creek
            <br />
            Linear Park
          </h1>

          <div
            className="mt-3 flex items-center gap-3 text-[13px]"
            style={{ color: "rgba(244,239,230,0.88)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              {place.neighborhood}
            </span>
            <Dot />
            <span>{place.distance} away</span>
            <Dot />
            <span>{place.price}</span>
          </div>
        </div>
      </section>

      {/* ====================== PAYOFF SHEET (overlaps seam) ====================== */}
      <section
        className="relative -mt-7 rounded-t-[28px] px-6 pt-6"
        style={{
          background: "var(--app-bg)",
          boxShadow: "0 -18px 40px -24px rgba(0,0,0,0.55)",
        }}
      >
        <div
          aria-hidden
          className="mx-auto mb-5 h-1 w-10 rounded-full"
          style={{ background: "var(--app-border)" }}
        />

        {/* Rating + primary directions, side by side */}
        <div className="flex items-stretch gap-3">
          <div
            className="flex flex-1 flex-col justify-center rounded-2xl px-4 py-3"
            style={{
              background: "var(--app-bg-elevated-solid)",
              border: "1px solid var(--app-border)",
              boxShadow: DEPTH_SHADOW,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-2xl tracking-[-0.02em]"
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  color: "var(--app-ink)",
                  fontWeight: 600,
                }}
              >
                {place.rating.toFixed(1)}
              </span>
              <span className="flex items-center gap-0.5" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-3.5 w-3.5"
                    style={{
                      color:
                        i < ratingStars ? "var(--app-accent)" : "var(--app-border)",
                    }}
                    fill={i < ratingStars ? "var(--app-accent)" : "none"}
                    strokeWidth={1.5}
                  />
                ))}
              </span>
            </div>
            <span className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {place.reviews.toLocaleString()} reviews
            </span>
          </div>

          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold"
            style={{
              background: "var(--app-cool)",
              color: "#F4EFE6",
              boxShadow:
                "0 1px 2px rgba(26,24,21,0.05), 0 16px 30px -14px rgba(47,84,112,0.65)",
            }}
          >
            <Navigation className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
            Directions
          </button>
        </div>

        {/* The blurb, as a pull quote */}
        <div className="relative mt-6">
          <Quote
            className="absolute -left-1 -top-2 h-7 w-7"
            style={{ color: "var(--app-brand-tint-22)" }}
            aria-hidden
          />
          <p
            className="relative pl-7 text-[19px] leading-[1.4]"
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              color: "var(--app-ink)",
              fontWeight: 500,
            }}
          >
            A mile of waterway, gardens, and seasonal sailboats threading the
            heart of downtown.
          </p>
        </div>

        {/* Today's hours — a compact timeline, not a list */}
        <div className="mt-7">
          <SectionLabel icon={<Clock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}>
            Open today
          </SectionLabel>
          <div
            className="mt-3 rounded-2xl px-4 py-4"
            style={{
              background: "var(--app-bg-elevated-solid)",
              border: "1px solid var(--app-border)",
              boxShadow: DEPTH_SHADOW,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
                style={{ color: "var(--app-positive)" }}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--app-positive)" }}
                />
                Open now
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-[12px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                <Sunset className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Closes at {place.closes}
              </span>
            </div>

            {/* Daylight track: dawn → now → dusk */}
            <div className="relative mt-3.5 h-2 w-full">
              <div
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--app-bg-sunken)" }}
              />
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: "62%",
                  background:
                    "linear-gradient(90deg, var(--app-positive) 0%, var(--app-accent) 100%)",
                }}
              />
              <div
                aria-hidden
                className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full"
                style={{
                  left: "62%",
                  marginLeft: "-7px",
                  background: "var(--app-bg-elevated-solid)",
                  border: "2.5px solid var(--app-accent)",
                  boxShadow: "0 2px 6px rgba(26,24,21,0.25)",
                }}
              />
            </div>
            <div
              className="mt-2 flex justify-between text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <span>Dawn</span>
              <span style={{ color: "var(--app-ink-2)", fontWeight: 600 }}>Now</span>
              <span>Dusk</span>
            </div>
          </div>
        </div>

        {/* The aerial strip — "from above" moment */}
        <div className="mt-7">
          <SectionLabel
            icon={<Camera className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
          >
            From above
          </SectionLabel>
          <div className="-mx-6 mt-3 flex gap-3 overflow-x-auto px-6 pb-1">
            {stripAerials.map((src, i) => (
              <span
                key={src}
                className="relative block h-32 w-44 shrink-0 overflow-hidden rounded-2xl"
                style={{ boxShadow: DEPTH_SHADOW }}
              >
                <Image
                  src={src}
                  alt={`Aerial view of Carroll Creek and downtown Frederick, ${i + 1} of ${stripAerials.length}`}
                  fill
                  sizes="176px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                />
              </span>
            ))}
          </div>
        </div>

        {/* Nearby — snap rail of stacked place cards */}
        <div className="mt-7 pb-32">
          <SectionLabel
            icon={<MapPin className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
          >
            A few steps away
          </SectionLabel>
          <div className="mt-3 flex flex-col gap-3">
            {nearby.map((p) => (
              <article
                key={p.slug}
                className="flex items-center gap-3.5 rounded-2xl p-3"
                style={{
                  background: "var(--app-bg-elevated-solid)",
                  border: "1px solid var(--app-border)",
                  boxShadow: DEPTH_SHADOW,
                }}
              >
                <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                  <Image
                    src={p.photo}
                    alt={p.name}
                    fill
                    sizes="64px"
                    placeholder="blur"
                    blurDataURL={PAPER_CREAM_BLUR}
                    className="object-cover"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: p.color }}
                    >
                      {p.category}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {p.distance}
                    </span>
                  </div>
                  <h3
                    className="truncate text-[15px] tracking-[-0.01em]"
                    style={{
                      fontFamily: "var(--font-display), Georgia, serif",
                      color: "var(--app-ink)",
                      fontWeight: 600,
                    }}
                  >
                    {p.name}
                  </h3>
                  <span
                    className="inline-flex items-center gap-1 text-[12px]"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    <Star
                      className="h-3 w-3"
                      style={{ color: "var(--app-accent)" }}
                      fill="var(--app-accent)"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    {p.rating.toFixed(1)}
                    <span style={{ color: "var(--app-ink-3)" }}>· {p.price}</span>
                  </span>
                </div>
                <ArrowUpRight
                  className="h-5 w-5 shrink-0"
                  style={{ color: "var(--app-ink-3)" }}
                  strokeWidth={2}
                  aria-hidden
                />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ PINNED ACTION BAR ============================ */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-7 pt-8"
        style={{
          background:
            "linear-gradient(180deg, rgba(229,216,191,0) 0%, var(--app-bg) 42%)",
        }}
      >
        <div
          className="pointer-events-auto flex items-center gap-2.5 rounded-[20px] p-2"
          style={{
            background: "var(--app-bg-elevated-solid)",
            border: "1px solid var(--app-border)",
            boxShadow: DEPTH_SHADOW,
          }}
        >
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{
              background: "var(--app-brand-tint-14)",
              color: "var(--app-brand)",
            }}
            aria-label="Save this place"
          >
            <Bookmark className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold"
            style={{
              background: "var(--app-brand)",
              color: "#F4EFE6",
              boxShadow:
                "0 1px 2px rgba(26,24,21,0.05), 0 14px 26px -12px rgba(160,58,34,0.7)",
            }}
          >
            <Navigation className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
            Take me there
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- helpers ------------------------------- */

function GlassButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full"
      style={{
        color: "#F4EFE6",
        background: "rgba(20,17,13,0.32)",
        border: "1px solid rgba(244,239,230,0.22)",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </button>
  );
}

function OpenPill({ open, closes }: { open: boolean; closes: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        color: "#F4EFE6",
        background: open ? "rgba(30,107,58,0.85)" : "rgba(20,17,13,0.5)",
        border: "1px solid rgba(244,239,230,0.22)",
        backdropFilter: "blur(10px)",
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: open ? "#7BE0A0" : "#C9C2B4" }}
      />
      {open ? `Open · til ${closes}` : "Closed"}
    </span>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: "var(--app-ink-3)" }}
    >
      {icon}
      {children}
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="h-1 w-1 rounded-full"
      style={{ background: "rgba(244,239,230,0.6)" }}
    />
  );
}

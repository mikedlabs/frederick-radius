import type { Metadata } from "next";
import { Coffee, Trees, Croissant, Beer, Mountain, TrainFront, Utensils, UtensilsCrossed, Baby, Toilet, ParkingCircle, Landmark, Compass, MessageSquare, ArrowRight } from "lucide-react";
import { FieldCard, FieldIndexRow, type FieldCardData } from "@/components/fieldguide/FieldCard";

/**
 * PROTOTYPE preview — the "field guide × Wallet" card language.
 *
 * Deliberately a TOP-LEVEL route (outside the (app) group) so it does
 * NOT mount the app nav / PulseIndicator. That header polls
 * /api/pulse/status, which fetches external feeds; in a sandbox with no
 * egress those hang and saturate the dev server. Standalone = loads
 * instantly. Throwaway / noindex; safe to delete.
 */
export const metadata: Metadata = {
  title: "Field card — prototype",
  robots: { index: false, follow: false },
};

const SPECIMENS: FieldCardData[] = [
  {
    specimenNo: "014",
    name: "Frederick Coffee Co.",
    category: "Coffee",
    accent: "var(--app-brand)",
    glyph: Coffee,
    fieldNote: "Local roaster and café on East Street. The back patio is the move on a clear evening.",
    habitat: "100 East St · Downtown",
    status: "Open until 8 PM",
    statusTone: "open",
  },
  {
    specimenNo: "031",
    name: "Baker Park",
    category: "Outdoors",
    accent: "var(--app-positive)",
    glyph: Trees,
    fieldNote: "Forty-four acres along Carroll Creek. The bell tower carillon plays on the hour.",
    habitat: "Carroll Creek · Downtown",
    status: "Open · dawn to dusk",
    statusTone: "open",
  },
  {
    specimenNo: "052",
    name: "Zoe's Chocolate Co.",
    category: "Sweets",
    accent: "var(--app-accent)",
    glyph: Croissant,
    fieldNote: "Hand-rolled truffles on Market Street. Go before the weekend crowd arrives.",
    habitat: "121 N Market St",
    status: "Closes 6 PM",
    statusTone: "info",
  },
  {
    specimenNo: "067",
    name: "Olde Mother Brewing",
    category: "Brews",
    accent: "var(--app-warning)",
    glyph: Beer,
    fieldNote: "Taproom a block off the creek. The sours rotate weekly and the room is dog-friendly.",
    habitat: "526 N Market St",
    status: "Open until 10 PM",
    statusTone: "open",
  },
];

const INDEX: FieldCardData[] = [
  ...SPECIMENS,
  {
    specimenNo: "078",
    name: "Catoctin Mountain Park",
    category: "Trails",
    accent: "var(--app-positive)",
    glyph: Mountain,
    fieldNote: "Cunningham Falls and the Thurmont overlooks. Twenty-five minutes up US-15.",
    habitat: "Thurmont",
    status: "Open daily",
    statusTone: "open",
  },
  {
    specimenNo: "002",
    name: "MARC · Brunswick Line",
    category: "Transit",
    accent: "var(--app-cool)",
    glyph: TrainFront,
    fieldNote: "Weekday commuter rail to Washington from four county stations.",
    habitat: "Frederick · Monocacy · Point of Rocks · Brunswick",
    status: "Next 5:42 PM",
    statusTone: "info",
  },
];

const PLATES: { glyph: typeof Coffee; accent: string; label: string }[] = [
  { glyph: Coffee, accent: "var(--app-brand)", label: "Coffee" },
  { glyph: Utensils, accent: "var(--app-danger)", label: "Eat" },
  { glyph: Trees, accent: "var(--app-positive)", label: "Outdoors" },
  { glyph: Croissant, accent: "var(--app-accent)", label: "Sweets" },
  { glyph: Beer, accent: "var(--app-warning)", label: "Brews" },
  { glyph: TrainFront, accent: "var(--app-cool)", label: "Transit" },
];

type PhotoDatum = {
  no: string;
  name: string;
  category: string;
  glyph: typeof Coffee;
  habitat: string;
  status: string;
  img: string;
};

// Real local Frederick imagery (public/history-photos). The photo IS
// the card — premium, like a Wallet event pass — no color fills.
const PHOTOS: PhotoDatum[] = [
  { no: "031", name: "Baker Park", category: "Outdoors", glyph: Trees, habitat: "Carroll Creek · Downtown", status: "Open daily", img: "/history-photos/carroll-creek-park.webp" },
  { no: "078", name: "Catoctin Mountain Park", category: "Trails", glyph: Mountain, habitat: "Thurmont", status: "Open daily", img: "/history-photos/catoctin-mountain-park.webp" },
  { no: "002", name: "MARC · Brunswick Line", category: "Transit", glyph: TrainFront, habitat: "Four county stations", status: "Next 5:42 PM", img: "/history-photos/brunswick-railroad.webp" },
  { no: "001", name: "The Clustered Spires", category: "Historic", glyph: Landmark, habitat: "Downtown Frederick", status: "Landmark", img: "/history-photos/clustered-spires.webp" },
];

/**
 * PROTOTYPE PhotoCard — the premium, Wallet-pass-like surface: the real
 * place photograph full-bleed, a refined dark scrim for legibility,
 * elegant serif name, and frosted-glass chips for the category and
 * status. Material and restraint, not saturated color.
 */
function PhotoCard({ data }: { data: PhotoDatum }) {
  const { name, category, glyph: Glyph, habitat, status, img, no } = data;
  return (
    <article
      className="relative aspect-[1.5/1] w-full overflow-hidden rounded-[22px]"
      style={{ boxShadow: "0 22px 48px -20px rgba(0,0,0,0.55)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- prototype; production uses next/image */}
      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* legibility scrim */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(14,11,9,0.84) 0%, rgba(14,11,9,0.32) 44%, rgba(14,11,9,0.04) 70%, rgba(14,11,9,0.22) 100%)" }}
      />
      {/* crisp inner ring */}
      <span aria-hidden className="absolute inset-0 rounded-[22px]" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)" }} />
      <div className="absolute inset-0 flex flex-col p-4 text-white">
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ background: "rgba(255,255,255,0.16)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          >
            <Glyph className="h-3.5 w-3.5" strokeWidth={2.5} /> {category}
          </span>
          <span className="font-mono text-[11px] opacity-85" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
            No. {no}
          </span>
        </div>
        <div className="mt-auto">
          <h3 className="font-serif text-[26px] font-semibold leading-none tracking-tight" style={{ textShadow: "0 2px 14px rgba(0,0,0,0.55)" }}>
            {name}
          </h3>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12.5px] opacity-90" style={{ textShadow: "0 1px 5px rgba(0,0,0,0.6)" }}>
              {habitat}
            </span>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              {status}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

type WalletDatum = {
  no: string;
  name: string;
  category: string;
  glyph: typeof Coffee;
  habitat: string;
  status: string;
  from: string;
  via: string;
  to: string;
};

// Rich, saturated material gradients — the vivid Wallet-card look, not
// the muted paper palette. Each card is its own "brand artifact."
const WALLET: WalletDatum[] = [
  { no: "014", name: "Frederick Coffee Co.", category: "Coffee", glyph: Coffee, habitat: "100 East St · Downtown", status: "Open until 8 PM", from: "#7A5234", via: "#56371F", to: "#2C1A0F" },
  { no: "031", name: "Baker Park", category: "Outdoors", glyph: Trees, habitat: "Carroll Creek", status: "Open daily", from: "#3E8E63", via: "#236742", to: "#103A26" },
  { no: "067", name: "Olde Mother Brewing", category: "Brews", glyph: Beer, habitat: "526 N Market St", status: "Open until 10 PM", from: "#C58A38", via: "#946320", to: "#4C320F" },
  { no: "002", name: "MARC · Brunswick Line", category: "Transit", glyph: TrainFront, habitat: "Four county stations", status: "Next 5:42 PM", from: "#3D74A8", via: "#264E76", to: "#13283E" },
];

/**
 * PROTOTYPE WalletCard — recalibrated toward the actual Apple Wallet
 * examples: a vivid full-bleed material surface, a sheen highlight, a
 * dense halftone field (the Apple Cash card), an oversized glyph, and
 * minimal face text (category + No. up top, name + status at the
 * bottom, like a cardholder name). Meant to be STACKED.
 */
function WalletCard({ data }: { data: WalletDatum }) {
  const { name, category, glyph: Glyph, habitat, status, from, via, to, no } = data;
  return (
    <article
      className="relative aspect-[1.6/1] w-full overflow-hidden rounded-[22px] text-white"
      style={{
        background: `linear-gradient(135deg, ${from} 0%, ${via} 48%, ${to} 100%)`,
        boxShadow: "0 20px 44px -18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.22)",
      }}
    >
      {/* sheen highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 75% at 12% -10%, rgba(255,255,255,0.30), transparent 55%)" }}
      />
      {/* halftone dot field — the Apple Cash beat */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.85) 0.85px, transparent 1.05px)",
          backgroundSize: "9px 9px",
          opacity: 0.5,
          maskImage: "radial-gradient(135% 120% at 88% 112%, black 22%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(135% 120% at 88% 112%, black 22%, transparent 70%)",
        }}
      />
      {/* oversized glyph */}
      <Glyph aria-hidden className="pointer-events-none absolute -right-7 -top-7 h-44 w-44" strokeWidth={1} style={{ opacity: 0.16 }} />
      <div className="absolute inset-0 flex flex-col p-4">
        <div className="flex items-center gap-2">
          <Glyph className="h-[18px] w-[18px]" strokeWidth={2.5} />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-90">{category}</span>
          <span className="ml-auto font-mono text-[11px] opacity-75">No. {no}</span>
        </div>
        <div className="mt-auto">
          <h3 className="font-serif text-[23px] font-semibold leading-none tracking-tight">{name}</h3>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] opacity-85">{habitat}</span>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.22)" }}>
              {status}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function needGradient(color: string): string {
  return `linear-gradient(155deg, color-mix(in srgb, ${color} 76%, white) 0%, ${color} 62%, color-mix(in srgb, ${color} 88%, black) 100%)`;
}

const NEEDS: { label: string; glyph: typeof Coffee; color: string }[] = [
  { label: "Coffee", glyph: Coffee, color: "var(--app-brand)" },
  { label: "Eat", glyph: UtensilsCrossed, color: "var(--app-danger)" },
  { label: "Outdoors", glyph: Trees, color: "var(--app-positive)" },
  { label: "With kids", glyph: Baby, color: "var(--app-accent)" },
  { label: "Restroom", glyph: Toilet, color: "#2F5470" },
  { label: "Parking", glyph: ParkingCircle, color: "#4A4844" },
];

/**
 * PROTOTYPE NeedTile — the MoodTile with the field-card visual grammar:
 * gradient + plate-dot texture + an oversized glyph watermark bleeding
 * off the corner, so each tile reads as a crafted plate rather than a
 * flat color block. (The current live tile uses a meaningless white
 * blob for depth and no texture.)
 */
function NeedTile({ label, glyph: Glyph, color }: { label: string; glyph: typeof Coffee; color: string }) {
  return (
    <div
      className="relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--app-radius-md)] border p-2 text-center"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, var(--app-border))`,
        background: needGradient(color),
        boxShadow: `var(--app-elev-1), 0 4px 10px -5px color-mix(in srgb, ${color} 45%, transparent)`,
      }}
    >
      {/* plate-dot texture (white on the colored field, faded out). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1.4px)",
          backgroundSize: "11px 11px",
          maskImage: "linear-gradient(150deg, black, transparent 75%)",
          WebkitMaskImage: "linear-gradient(150deg, black, transparent 75%)",
        }}
      />
      {/* oversized glyph watermark — the field-card identity beat. */}
      <Glyph
        aria-hidden
        className="pointer-events-none absolute -bottom-4 -right-3 h-[5.5rem] w-[5.5rem]"
        strokeWidth={1.25}
        style={{ color: "#fff", opacity: 0.18 }}
      />
      {/* glass icon pill. */}
      <span
        aria-hidden
        className="relative grid h-9 w-9 place-items-center rounded-full"
        style={{
          background: "rgba(255,255,255,0.96)",
          boxShadow: "0 2px 6px -1px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.7)",
        }}
      >
        <Glyph className="h-[18px] w-[18px]" strokeWidth={2.25} style={{ color }} />
      </span>
      <span
        className="relative block max-w-full truncate text-[11.5px] font-semibold leading-none text-white"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
      >
        {label}
      </span>
    </div>
  );
}

export default function FieldCardPreview() {
  return (
    <main
      className="min-h-screen px-4 py-6"
      style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
    >
      <div className="mx-auto max-w-screen-md space-y-7 pb-12">
        {/* Welcome card — redesigned as a premium FIELD-GUIDE COVER:
            a sweeping Frederick photo as the header with a masthead +
            serif title over it, then the personal note on cream. Far
            more eye-catching than the icon-and-five-paragraphs version. */}
        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
            Prototype · welcome card
          </p>
          <article
            className="relative mx-auto max-w-[440px] overflow-hidden rounded-[24px] border"
            style={{ borderColor: "var(--app-border)", boxShadow: "0 26px 54px -22px rgba(0,0,0,0.5)" }}
          >
            {/* cover photo */}
            <div className="relative aspect-[1.45/1] w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- prototype; production uses next/image */}
              <img src="/history-photos/clustered-spires.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
              <span
                aria-hidden
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, rgba(12,10,8,0.90) 0%, rgba(12,10,8,0.10) 50%, rgba(12,10,8,0.44) 100%)" }}
              />
              {/* masthead row */}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 text-white">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                  <Compass className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Frederick Radius
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                >
                  Beta · May 2026
                </span>
              </div>
              {/* cover title */}
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-85" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                  A field guide to the county
                </p>
                <h2 className="mt-1 font-serif text-[32px] font-semibold leading-[1.0] tracking-tight" style={{ textShadow: "0 2px 16px rgba(0,0,0,0.5)" }}>
                  Welcome to Frederick.
                </h2>
              </div>
            </div>
            {/* body on cream */}
            <div className="space-y-3.5 p-5" style={{ background: "var(--app-bg-elevated)" }}>
              <p className="font-serif text-[18px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
                I have lived in Downtown Frederick for nearly 10 years, and I still find out about things after they happen.
              </p>
              <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                The county and the city are connected in real life, but the information is scattered. Events get buried and updates disappear. Frederick Radius brings the pieces together. Nothing to download. It works right in your browser.
              </p>
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                  style={{ background: "var(--app-brand)" }}
                >
                  <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  Send feedback
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                </span>
                <span className="text-[11.5px] italic" style={{ color: "var(--app-ink-3)" }}>
                  by Michael DeMattia
                </span>
              </div>
            </div>
          </article>
        </section>

        {/* Premium · photography — the photo IS the card. The most
            Wallet-pass-like, most premium surface for a place: real
            imagery, a refined dark scrim, elegant type, frosted chips.
            No color fills. This is the recalibration. */}
        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
            Premium · photography
          </p>
          <div className="mx-auto max-w-[440px] space-y-3.5">
            {PHOTOS.map((d) => (
              <PhotoCard key={d.no} data={d} />
            ))}
          </div>
        </section>

        {/* Wallet stack — recalibrated toward the actual Apple Wallet
            screenshots: vivid full-bleed material cards with a halftone
            field, minimal face text, stacked like a real wallet so you
            see each card's top band peeking. (Below the photo direction
            for contrast — the saturated color read cheap.) */}
        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
            Recalibrated · Apple Wallet feel
          </p>
          <div className="mx-auto max-w-[420px] px-0.5 pb-1">
            {WALLET.map((d, i) => (
              <div key={d.no} className="relative" style={{ marginTop: i === 0 ? 0 : -150, zIndex: i + 1 }}>
                <WalletCard data={d} />
              </div>
            ))}
          </div>
        </section>

        {/* Showcase strip — echoes the Apple Wallet "Passes and Tickets"
            promo: a tinted panel with colorful category plate tiles. */}
        <section
          className="relative overflow-hidden rounded-[var(--app-radius-lg)] border px-4 py-6"
          style={{
            borderColor: "var(--app-border)",
            background:
              "linear-gradient(155deg, color-mix(in srgb, var(--app-brand) 9%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 70%)",
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
            Prototype · field guide × wallet
          </p>
          <h1 className="mt-1.5 font-serif text-[26px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            A field guide to Frederick.
          </h1>
          <p className="mt-1 max-w-[46ch] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Every place, trail, and train as a specimen card you can pocket. One card grammar across the app.
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {PLATES.map(({ glyph: G, accent, label }) => (
              <li key={label} className="flex flex-col items-center gap-1.5">
                <span
                  aria-hidden
                  className="grid h-12 w-12 place-items-center rounded-[var(--app-radius-md)]"
                  style={{
                    background: `linear-gradient(150deg, color-mix(in srgb, ${accent} 22%, var(--app-bg-elevated)), var(--app-bg-elevated))`,
                    color: accent,
                    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  }}
                >
                  <G className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <span className="text-[10.5px] font-medium" style={{ color: "var(--app-ink-3)" }}>
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* What do you need right now — the MoodTiles, upgraded with the
            field-card grammar (gradient + plate-dot texture + oversized
            glyph watermark) so they read as crafted plates, not flat
            color blocks. */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
            What do you need right now
          </h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {NEEDS.map((n) => (
              <li key={n.label}>
                <NeedTile {...n} />
              </li>
            ))}
          </ul>
        </section>

        {/* The plate — hero / featured form. */}
        <section className="space-y-3">
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            The plate
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SPECIMENS.map((s) => (
              <FieldCard key={s.specimenNo} data={s} />
            ))}
          </div>
        </section>

        {/* The index — dense list form. */}
        <section className="space-y-3">
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            The index
          </h2>
          <div className="space-y-2">
            {INDEX.map((s) => (
              <FieldIndexRow key={`idx-${s.specimenNo}`} data={s} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

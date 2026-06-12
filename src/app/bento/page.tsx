import type { Metadata } from "next";
import {
  Coffee, UtensilsCrossed, Trees, Baby, Toilet, ParkingCircle,
  TrainFront, Moon, Siren, ChevronRight,
} from "lucide-react";

/**
 * PROTOTYPE — "Your Frederick, at a glance": a bento dashboard home.
 *
 * Replaces the long vertical scroll of full-width sections with a packed
 * grid of right-sized tiles (size = importance), in the premium photo /
 * neutral-plate card language. Standalone top-level route (no app-shell
 * polling, so it loads in the sandbox). Throwaway / noindex.
 */
export const metadata: Metadata = {
  title: "Bento — prototype",
  robots: { index: false, follow: false },
};

const TILE = "relative overflow-hidden rounded-[20px] border";
const SHADOW = "var(--app-elev-1), var(--app-edge), var(--app-hi)";

function PhotoTile({
  img, eyebrow, title, sub, glyph: Glyph, className = "",
}: {
  img: string; eyebrow: string; title?: string; sub?: string; glyph?: typeof Coffee; className?: string;
}) {
  return (
    <div className={`${TILE} ${className}`} style={{ borderColor: "var(--app-border)", boxShadow: "0 18px 40px -20px rgba(0,0,0,0.5)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- prototype */}
      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(12,10,8,0.86) 0%, rgba(12,10,8,0.16) 52%, rgba(12,10,8,0.30) 100%)" }} />
      <div className="absolute inset-0 flex flex-col justify-end p-3.5 text-white">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] opacity-90" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
          {Glyph && <Glyph className="h-3 w-3" strokeWidth={2.5} aria-hidden />} {eyebrow}
        </p>
        {title && (
          <p className="mt-1 font-serif text-[20px] font-semibold leading-[1.04] tracking-tight" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
            {title}
          </p>
        )}
        {sub && <p className="mt-1 text-[12px] opacity-90" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>{sub}</p>}
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon, accent, value, label, sub, className = "",
}: {
  icon: typeof Coffee; accent: string; value: string; label: string; sub?: string; className?: string;
}) {
  return (
    <div className={`${TILE} flex flex-col p-3 ${className}`} style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: SHADOW }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: accent, opacity: 0.5 }} />
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <span className="mt-auto font-serif text-[19px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>{value}</span>
      <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        {label}<ChevronRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
      </span>
      {sub && <span className="text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>{sub}</span>}
    </div>
  );
}

const NEEDS = [
  { icon: Coffee, accent: "var(--app-brand)", label: "Coffee" },
  { icon: UtensilsCrossed, accent: "var(--app-danger)", label: "Eat" },
  { icon: Trees, accent: "var(--app-positive)", label: "Outdoors" },
  { icon: Baby, accent: "var(--app-accent)", label: "Kids" },
  { icon: Toilet, accent: "#2F5470", label: "Restroom" },
  { icon: ParkingCircle, accent: "#4A4844", label: "Parking" },
];

export default function BentoPreview() {
  return (
    <main className="min-h-screen px-4 py-5" style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}>
      <div className="mx-auto max-w-screen-lg">
        <header className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
              Prototype · bento home
            </p>
            <h1 className="font-serif text-[26px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              Thursday, May 28
            </h1>
          </div>
          <span className="text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>11:27 PM</span>
        </header>

        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          style={{ gridAutoRows: "112px", gridAutoFlow: "dense" }}
        >
          {/* Hero — the one answer */}
          <PhotoTile
            className="col-span-2 row-span-2"
            img="/history-photos/clustered-spires.webp"
            eyebrow="Tonight in Frederick"
            title="Patio weather. Carroll Creek's full of it."
            sub="Alive @ Five · The Learned Doctors playing now"
          />

          {/* Weather — compact night tile */}
          <div
            className="relative row-span-2 flex flex-col overflow-hidden rounded-[20px] border p-3.5 text-white"
            style={{ borderColor: "var(--app-border)", background: "linear-gradient(150deg, #2b2f55 0%, #1a1d3a 60%, #12152b 100%)", boxShadow: SHADOW }}
          >
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(80% 60% at 82% 8%, rgba(255,255,255,0.20), transparent 60%)" }} />
            <div className="relative flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">Weather</span>
              <Moon className="h-5 w-5 opacity-90" strokeWidth={1.75} aria-hidden />
            </div>
            <span className="relative mt-auto font-serif text-[36px] font-semibold leading-none tracking-tight">61°</span>
            <span className="relative mt-1.5 text-[12px] opacity-90">Clear · H 78° L 53°</span>
          </div>

          {/* Tonight event — photo */}
          <PhotoTile
            className="row-span-2"
            img="/history-photos/carroll-creek-park.webp"
            eyebrow="Tonight"
            title="Alive @ Five"
            sub="5–8 PM"
          />

          {/* What you need — affordance cluster */}
          <div
            className="col-span-2 flex flex-col justify-center overflow-hidden rounded-[20px] border p-3"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: SHADOW }}
          >
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              What do you need
            </p>
            <div className="flex items-start justify-between gap-1">
              {NEEDS.map(({ icon: I, accent, label }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>
                    <I className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="text-[9.5px]" style={{ color: "var(--app-ink-3)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MARC next train */}
          <StatTile icon={TrainFront} accent="var(--app-cool)" value="5:42 PM" label="Next MARC" sub="to Washington" />
          {/* Pulse */}
          <StatTile icon={Siren} accent="var(--app-positive)" value="All clear" label="County pulse" sub="no active incidents" />

          {/* Worth a look — photo */}
          <PhotoTile
            className="col-span-2 row-span-2"
            img="/history-photos/catoctin-mountain-park.webp"
            eyebrow="Worth a look"
            title="Catoctin Mountain Park"
            sub="Cunningham Falls · 25 min up US-15"
          />

          {/* Parking */}
          <StatTile icon={ParkingCircle} accent="#4A4844" value="6 garages" label="Parking" sub="downtown · live" />
          {/* From Above — aerial */}
          <PhotoTile
            img="/from-above/photos/pg-045-bf50@1200.webp"
            eyebrow="From Above"
          />
        </div>
      </div>
    </main>
  );
}

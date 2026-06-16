import type { ReactNode } from "react";
import Link from "next/link";
import {
  Coffee,
  IceCream,
  Utensils,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Martini,
  ParkingCircle,
  Train,
  Bus,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { CRAVINGS } from "@/data/cravings";

/**
 * CravingStrip — the fast lane on Today.
 *
 * "I want ___ right now" as a tap-to-answer grid. Each tile deep-links into
 * /nearby with the craving preselected, so a person on the sidewalk goes
 * Today → tap "Ice cream" → nearest open one, in two taps.
 *
 * TWO labeled groups, not one flat 14-tile block. The findability audit
 * (June 2026) found "I want… the bus" reads as a different instinct from
 * "I want coffee," so the wants and the getting-around utilities are split:
 *   • "I want…"        → cravings (Happy hour + the CRAVINGS set) + an escape
 *                        hatch ("Something else") to the full picker.
 *   • "Getting around" → Parking / MARC / Transit, their own eyebrow + row.
 * Both stay one-tap in the same area (the utilities are real find-paths, not
 * clutter) — the labels just make the hierarchy legible.
 *
 * A GRID (not the old horizontal pill scroll) so every tile is visible at
 * once. Each tile is a tactile paper well matching /nearby's RightNow picker
 * (same vocabulary, one visual voice), with a tinted icon well; the whole tile
 * is the 44px+ target. Server component (plain links) — costs nothing above
 * the fold.
 *
 * `locationSlot` rides on the RIGHT of the "I want…" bar (the page passes the
 * LocationPrime consent pill there), so the consent and the prompt share one
 * tidy row instead of two stacked spots. Self-hides once granted.
 */
const ICONS: Record<string, LucideIcon> = {
  Coffee,
  IceCream,
  Utensils,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
};

const TILE =
  "tactile tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2.5";
const TILE_STYLE = {
  background: "var(--app-bg-elevated)",
  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
} as const;

export default function CravingStrip({ locationSlot }: { locationSlot?: ReactNode }) {
  return (
    <div className="space-y-4">
    <section aria-labelledby="i-want-eyebrow" className="space-y-2">
      {/* One bar: the "I want…" prompt on the left, the location consent pill
          on the right — opposite ends of a single row, not two stacked spots.
          The pill self-hides once granted, leaving the prompt alone. */}
      <div className="flex min-h-[34px] items-center justify-between gap-3">
        <p id="i-want-eyebrow" className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          I want…
        </p>
        {locationSlot}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Happy hour — the most-asked-for local intent. Leads the grid.
            Points at the /happy-hour view powered by the Field Notes layer
            (verified happy-hour times, confirmed at the source). */}
        <Link
          href="/happy-hour"
          aria-label="Happy hour"
          className={TILE}
          style={TILE_STYLE}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-accent) 16%, var(--app-bg-elevated-solid))" }}
          >
            <Martini className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-accent)" }} />
          </span>
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Happy hour
          </span>
        </Link>
        {CRAVINGS.map((c) => {
          const Icon = ICONS[c.icon];
          return (
            <Link
              key={c.key}
              href={`/nearby?c=${c.key}`}
              aria-label={`${c.label} — nearest open`}
              className={TILE}
              style={TILE_STYLE}
            >
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{ background: `color-mix(in srgb, ${c.color} 14%, var(--app-bg-elevated-solid))` }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: c.color }} />
              </span>
              <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                {c.label}
              </span>
            </Link>
          );
        })}
        {/* A missing noun routes to the full picker, never a dead end. */}
        <Link
          href="/nearby"
          aria-label="Something else — open the full picker"
          className={TILE}
          style={TILE_STYLE}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--app-bg-sunken)" }}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
          </span>
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
            Something else
          </span>
        </Link>
      </div>
    </section>

    {/* ── GETTING AROUND — the same one-tap tiles, but their own eyebrow so
        "I want… the bus" no longer reads as a craving. Three short
        find-paths: where to park, the MARC train, the local TransIT bus. */}
    <section aria-labelledby="getting-around-eyebrow" className="space-y-2">
      <p id="getting-around-eyebrow" className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        Getting around
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Link href="/parking" aria-label="Parking" className={TILE} style={TILE_STYLE}>
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, var(--app-bg-elevated-solid))" }}>
            <ParkingCircle className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
          </span>
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Parking</span>
        </Link>
        <Link href="/transit" aria-label="MARC train" className={TILE} style={TILE_STYLE}>
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, var(--app-bg-elevated-solid))" }}>
            <Train className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
          </span>
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>MARC</span>
        </Link>
        <Link href="/transit" aria-label="TransIT bus" className={TILE} style={TILE_STYLE}>
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, var(--app-bg-elevated-solid))" }}>
            <Bus className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
          </span>
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Transit</span>
        </Link>
      </div>
    </section>
    </div>
  );
}

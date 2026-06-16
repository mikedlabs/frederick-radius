import Link from "next/link";
import {
  Coffee,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  Palette,
  Martini,
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
 * A GRID (not the old horizontal pill scroll) so every craving is visible at
 * once — the scroll hid "Drinks"/"Outside" off the right edge. Each tile is a
 * tactile paper well matching /nearby's RightNow picker (same vocabulary, one
 * visual voice), with a tinted icon well; the whole tile is the 44px+ target.
 * An 8th "Something else" tile routes to the full picker so a missing noun
 * never dead-ends. Server component (plain links) — costs nothing above the
 * fold.
 */
const ICONS: Record<string, LucideIcon> = {
  Coffee,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  Palette,
};

const TILE =
  "tactile tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2.5";
const TILE_STYLE = {
  background: "var(--app-bg-elevated)",
  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
} as const;

export default function CravingStrip() {
  return (
    <section aria-labelledby="i-want-eyebrow" className="space-y-2">
      <div>
        <p id="i-want-eyebrow" className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          I want…
        </p>
        <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Tap one; we find the nearest one open.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Happy hour — the most-asked-for local intent. Leads the grid.
            Points at the events happy-hour filter for now; repoints to a
            real "Happy hour now" view once the agent-built Field Notes
            dataset (verified happy-hour times) lands. */}
        <Link
          href="/events?happy=1"
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
  );
}

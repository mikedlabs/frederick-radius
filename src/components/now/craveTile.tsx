import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared presentation for the "I want…" tiles, so the Link tiles (FieldTag)
 * and the button tile (MoreSheetTile, which opens the More drawer instead of
 * navigating) render identically and can never drift. Pure + presentational
 * (no hooks/handlers), so it's safe in both a server and a client component.
 *
 * LETTERPRESS CATALOG — the redesign. The old tiles were 13 glossy chips, each
 * a DIFFERENT saturated color with the glyph reversed WHITE-on-color: a plastic
 * iOS-springboard rainbow that read cheap and fought the app's own icon
 * language (IconStamp: a pressed-paper seal, glyph drawn IN ink, never
 * white-on-color). This is the opposite, and it obeys IconStamp's rule:
 *
 *  - The tile is one uniform sheet of warm field-guide paper (same elevated
 *    stock + grain + hairline edge + soft top highlight as every tactile
 *    surface). No per-tile fill color — the grid reads as one printed page.
 *  - The glyph is ENGRAVED into the paper: drawn in INK inside a debossed
 *    seal (an inset ring, not a raised plate), with a faint ink highlight
 *    below the stroke so it reads pressed-in, not stuck-on.
 *  - A tiny mono index mark (catalog specimen detail) sits top-left.
 *  - ONE accent, reserved for the live "intel" leads only (the meal tile +
 *    Happy hour) — those get an accent-inked glyph, an accent index mark, and
 *    a hairline accent left-margin rule. Everything else is calm ink.
 */

export const craveTileClass =
  "tactile-interactive group/crave relative flex flex-col items-center justify-center gap-[5px] overflow-hidden rounded-[var(--app-radius-sm)] px-1 pb-[7px] pt-[9px] text-center";

/**
 * Tile stock. The same warm elevated paper for every tile (no rainbow). A lead
 * tile (meal / Happy hour) earns a hairline accent rule down its left edge —
 * the one place color enters the grid.
 *
 * @param accent  Kept for call-site compatibility. Honored ONLY when `lead`
 *                is set, as the live-intel accent. Ignored otherwise — the
 *                grid is deliberately near-monochrome.
 */
export function craveTileStyle(accent: string, lead = false): CSSProperties {
  return {
    backgroundColor: "var(--app-bg-elevated-solid)",
    backgroundImage: "var(--app-paper-light)",
    // Hairline edge + soft top highlight + quiet lift = the pressed-into-the-
    // page read shared with IconStamp and every tactile surface. A lead tile
    // adds a 2px accent rule on the left as a thin index tab.
    boxShadow: lead
      ? `inset 2px 0 0 ${accent}, var(--app-edge), var(--app-hi), var(--app-elev-1)`
      : "var(--app-edge), var(--app-hi), var(--app-elev-1)",
  };
}

/**
 * The engraved glyph + the catalog label.
 *
 * @param icon    The lucide glyph (drawn in ink, never reversed on color).
 * @param label   The "I want X" label — Public Sans, ink.
 * @param accent  Honored only when `lead` — the glyph + index mark ink for a
 *                live-intel tile. Otherwise the tile is monochrome ink.
 * @param index   Optional mono specimen mark (top-left), e.g. "01". Catalog
 *                detail; omit and the mark is hidden.
 * @param lead    Marks a live-intel tile (meal / Happy hour) — the only tiles
 *                that take the accent.
 */
export function CraveTileInner({
  icon: Icon,
  label,
  accent,
  index,
  lead = false,
}: {
  icon: LucideIcon;
  label: ReactNode;
  accent: string;
  index?: string;
  lead?: boolean;
}) {
  // Ink for everything that isn't a live-intel lead. Leads borrow the accent.
  const glyphColor = lead ? accent : "var(--app-ink-2)";
  return (
    <>
      {/* Mono specimen index — a tiny catalog detail, top-left. Ink, or the
          accent on a lead tile. Decorative; the label carries the meaning. */}
      {index ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[7px] top-[6px] font-mono text-[8px] font-medium leading-none tracking-[0.08em] tabular-nums"
          style={{ color: lead ? accent : "var(--app-ink-3)", opacity: lead ? 0.85 : 0.55 }}
        >
          {index}
        </span>
      ) : null}

      {/* The engraved seal: a debossed ring pressed into the paper, the glyph
          drawn IN ink inside it. The inset ring + a 1px lower ink highlight
          read as letterpress, not a raised plastic plate. On hover the seal
          warms a hair toward the tile's ink (quiet, not a color flood). */}
      <span
        aria-hidden
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] transition-colors duration-150"
        style={{
          // A barely-there tint inside the seal so the deboss reads on paper;
          // for leads it's the faintest wash of the accent, otherwise ink.
          background: lead
            ? `color-mix(in srgb, ${accent} 9%, var(--app-bg-elevated-solid))`
            : "color-mix(in srgb, var(--app-ink) 4%, var(--app-bg-elevated-solid))",
          // Debossed: an inner hairline ring + a soft inset top shadow (pressed
          // in) + a 1px light edge below (the ink catching the paper tooth).
          boxShadow: lead
            ? `inset 0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent), inset 0 1px 2px color-mix(in srgb, var(--app-ink) 12%, transparent), 0 1px 0 var(--app-hi)`
            : "inset 0 0 0 1px var(--app-edge), inset 0 1px 2px color-mix(in srgb, var(--app-ink) 9%, transparent), 0 1px 0 var(--app-hi)",
          color: glyphColor,
        }}
      >
        <Icon className="h-[16px] w-[16px]" strokeWidth={1.85} />
      </span>

      {/* The label — Public Sans, ink, calm. Leads sit a touch heavier so the
          live tiles read as the lead without shouting in color. */}
      <span
        className="max-w-full truncate text-[11px] leading-tight"
        style={{ color: "var(--app-ink)", fontWeight: lead ? 600 : 500 }}
      >
        {label}
      </span>
    </>
  );
}

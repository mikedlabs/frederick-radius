import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared presentation for the "I want…" craving tiles, so the Link tiles
 * (FieldTag) and the button tile (MoreSheetTile, which opens the More drawer
 * instead of navigating) render identically and can never drift. Pure +
 * presentational (no hooks/handlers), so it's safe in both a server and a
 * client component.
 *
 * THE LOOK — a pressed-paper field-guide seal, not an app-launcher chip.
 * Earlier each tile was a glossy chip filled with a SATURATED brand color and
 * a glyph reversed WHITE on top — thirteen different colors tiled in a grid,
 * the plastic iOS-springboard read the owner flagged as "lofi and cheap." That
 * also violated the app's OWN canonical icon language (IconStamp), whose
 * docstring says "nothing else should hand-roll a saturated/glossy stamp."
 * This brings the grid INTO that language: every glyph is now a quiet
 * pressed-paper seal — the mark drawn IN the ink (never white-on-color), a
 * hairline edge + soft top highlight + a warm ink-tinted lift — over a refined
 * mono specimen caption, finished with one short ink-keyed leader rule.
 *
 * Rainbow-regression guard: there is NO per-tile saturated FILL anymore. The
 * card stock is one warm paper across the whole sheet; the item's `ink`
 * survives only concentrated in the seal (a ~14% tint + the glyph + a soft
 * lift) and a faint border cast + the leader rule — a whispered signature
 * color, never confetti. Keep it that way so a future craving can't bring the
 * launcher look back.
 */

export const craveTileClass =
  "tactile-interactive group/crave relative flex min-h-[72px] flex-col items-center justify-center gap-[7px] overflow-hidden rounded-[var(--app-radius-sm)] px-1.5 py-[9px] text-center";

export function craveTileStyle(ink: string): CSSProperties {
  return {
    // ONE warm paper stock across the sheet — no per-tile saturated fill. The
    // item's `ink` survives only as a barely-there warm cast in the hairline
    // border, so 13 tiles read as one calm set rather than 13 confetti colors.
    backgroundColor: `color-mix(in srgb, ${ink} 5%, var(--app-bg-elevated-solid))`,
    backgroundImage: "var(--app-paper-light)",
    border: `1px solid color-mix(in srgb, ${ink} 18%, var(--app-border))`,
    boxShadow: "var(--app-elev-1), var(--app-hi)",
  };
}

/** A pressed-paper seal (glyph drawn IN the ink, IconStamp language) above a
 *  mono specimen caption, finished with one ink-keyed leader rule that firms
 *  on hover — the field-guide "this is live" cue, never a glow. No reversed
 *  white-on-color plate. */
export function CraveTileInner({ icon: Icon, label, ink }: { icon: LucideIcon; label: ReactNode; ink: string }) {
  return (
    <>
      <span
        aria-hidden
        className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[11px]"
        style={{
          // IconStamp's exact pressed-seal recipe: a ~14% accent tint over
          // elevated paper, the glyph IN the accent, a hairline edge + soft
          // highlight, and a soft WARM ink-tinted lift (never a grey shadow).
          background: `color-mix(in srgb, ${ink} 14%, var(--app-bg-elevated))`,
          boxShadow: `var(--app-edge), var(--app-hi), 0 6px 14px -8px color-mix(in srgb, ${ink} 34%, transparent)`,
          color: ink,
        }}
      >
        <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
      </span>
      <span
        className="max-w-full truncate font-mono text-[10.5px] font-medium uppercase leading-tight tracking-[0.04em]"
        style={{ color: "var(--app-ink)" }}
      >
        {label}
      </span>
      {/* Leader rule — a short underline keyed to the item's ink, the single
          deliberate chroma per tile (the at-a-glance key), firming on hover. */}
      <span
        aria-hidden
        className="block h-px w-4 rounded-full opacity-55 transition-opacity duration-200 group-hover/crave:opacity-100"
        style={{ background: `color-mix(in srgb, ${ink} 70%, var(--app-border))` }}
      />
    </>
  );
}

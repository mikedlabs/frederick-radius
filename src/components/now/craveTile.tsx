import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { GLYPHS } from "@/components/glyphs";

/**
 * Shared presentation for the "I want…" craving tiles, so the Link tiles
 * and any launcher tile that routes into Compass render identically and can
 * never drift. Pure +
 * presentational (no hooks/handlers), so it's safe in both a server and a
 * client component.
 *
 * THE LOOK — a pressed FIELD-GUIDE SPECIMEN PLATE, not an app-launcher chip.
 * Earlier each tile was a glossy chip filled with a SATURATED brand color and
 * a glyph reversed WHITE on top — the "lofi and cheap" iOS-springboard read.
 * The first fix quieted that to a tiny 14%-tint seal, but it went TOO quiet —
 * low visual impact, and it rendered stock Lucide while the rest of the app
 * uses the bespoke engraved woodcut GLYPHS. This is the "engraved, with
 * presence" treatment: the mark is now the HERO of the tile — a bespoke
 * woodcut glyph (Lucide only where no woodcut is drawn yet) at full size, in a
 * matted specimen plate (an ink-keyed wash, a hairline inner frame, a paper
 * mount ring, a soft warm lift), with the ink-keyed leader rule moved up
 * between the mark and the mono caption. It reads like a pressed plate in a
 * field guide, and it carries real weight.
 *
 * Rainbow-regression guard (UNCHANGED, load-bearing): there is still NO
 * per-tile saturated FILL. The card stock is one warm paper across the whole
 * sheet; the item's `ink` survives only as the plate wash + a faint border
 * cast + the leader rule + a deepened mark — a confident signature, never
 * confetti. Presence comes from SIZE, the engraved mark, and the plate frame,
 * NOT from turning the tiles into colored buttons. Keep it that way.
 */

export const craveTileClass =
  "tactile-interactive group/crave relative flex min-h-[96px] flex-col items-center justify-center gap-[8px] overflow-hidden rounded-[var(--app-radius-sm)] px-1.5 py-[11px] text-center";

export function craveTileStyle(ink: string): CSSProperties {
  return {
    // ONE warm paper stock across the sheet — no per-tile saturated fill. The
    // item's `ink` survives only as a barely-there warm cast in the hairline
    // border, so the whole grid reads as one calm sheet, not confetti.
    backgroundColor: `color-mix(in srgb, ${ink} 5%, var(--app-bg-elevated-solid))`,
    backgroundImage: "var(--app-paper-light)",
    border: `1px solid color-mix(in srgb, ${ink} 18%, var(--app-border))`,
    boxShadow: "var(--app-elev-1), var(--app-hi)",
  };
}

/**
 * A matted specimen plate (the bespoke engraved woodcut where one exists, the
 * Lucide fallback otherwise — the exact GLYPHS-first precedence CategoryIcon
 * uses), over a short ink-keyed leader rule and a mono caption. The mark is
 * pulled a touch toward ink so a pale signature color (gold) still reads as a
 * confident engraving while keeping its identity.
 */
export function CraveTileInner({
  icon: Icon,
  glyphName,
  label,
  ink,
}: {
  /** Lucide fallback, used when no bespoke woodcut exists for `glyphName`. */
  icon: LucideIcon;
  /** Icon NAME (e.g. "Coffee", "Utensils"); if GLYPHS has a woodcut for it,
   *  that bespoke engraving renders instead of the Lucide fallback. */
  glyphName?: string;
  label: ReactNode;
  ink: string;
}) {
  const Glyph = glyphName ? GLYPHS[glyphName] : undefined;
  const markColor = `color-mix(in srgb, ${ink} 78%, var(--app-ink))`;
  return (
    <>
      <span
        aria-hidden
        className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px]"
        style={{
          // Matted specimen plate: an ink-keyed wash, a hairline inner frame, a
          // paper mount ring (4px of solid paper, like a print mat), the warm
          // top highlight, and a soft ink-tinted lift — never a grey shadow.
          background: `color-mix(in srgb, ${ink} 16%, var(--app-bg-elevated))`,
          boxShadow:
            `inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 11%, transparent), 0 0 0 4px var(--app-bg-elevated-solid), var(--app-hi), 0 8px 18px -10px color-mix(in srgb, ${ink} 40%, transparent)`,
          color: markColor,
        }}
      >
        {/* Bespoke woodcuts bake their own stroke (no strokeWidth forwarded);
            the Lucide fallback gets a calm 1.75 weight at the larger size. */}
        {Glyph ? (
          <Glyph className="h-[30px] w-[30px]" />
        ) : (
          <Icon className="h-[26px] w-[26px]" strokeWidth={1.75} />
        )}
      </span>
      {/* Leader rule — a short underline keyed to the item's ink, sitting
          between the plate and the caption, firming on hover. */}
      <span
        aria-hidden
        className="block h-px w-5 rounded-full opacity-60 transition-opacity duration-200 group-hover/crave:opacity-100"
        style={{ background: `color-mix(in srgb, ${ink} 70%, var(--app-border))` }}
      />
      <span
        className="max-w-full truncate font-mono text-[10.5px] font-medium uppercase leading-tight tracking-[0.04em]"
        style={{ color: "var(--app-ink)" }}
      >
        {label}
      </span>
    </>
  );
}

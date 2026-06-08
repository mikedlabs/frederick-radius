import type { CSSProperties, ReactNode } from "react";

/**
 * IconStamp — THE one icon backplate for the app: a tinted paper chip,
 * like a pressed field-guide seal. This is the single, deliberate icon
 * language; nothing else should hand-roll a saturated/glossy stamp.
 *
 * Material (printed-paper, not plastic):
 *  - backplate tinted with the accent at ~14% over elevated paper
 *  - the icon drawn IN the accent (no white-on-color blocks)
 *  - a hairline edge + a soft top highlight (the tactile system's
 *    --app-edge / --app-hi) for a pressed-into-the-page read
 *  - a soft, accent-TINTED lift beneath (not a grey drop shadow) so the
 *    chip sits just off the page — quiet depth, never flat oatmeal
 *  - a continuous-corner squircle, sized for the thumb
 *
 * The stamp normalizes the icon's size AND stroke weight via CSS, so a
 * row of stamps reads as one set regardless of what each caller passes.
 * Pass any lucide icon (or <CategoryIcon>) as children + an `accent`.
 */
export default function IconStamp({
  children,
  accent = "var(--app-ink-2)",
  size = "md",
  className = "",
  style,
}: {
  /** The icon element — a raw lucide icon or a <CategoryIcon>. Its size
   *  and stroke are normalized by the stamp; its color comes from
   *  `accent` via currentColor, so callers needn't set either. */
  children: ReactNode;
  /** A CSS color or `var(--app-*)` token. Drives the backplate tint, the
   *  icon color, and the tinted lift. Defaults to ink-2 (neutral). */
  accent?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}) {
  const dim = SIZES[size];
  return (
    <span
      aria-hidden
      // [&>svg] rules normalize every child icon to one size + stroke, so
      // a dense glyph (Trees) and a sparse one (Clock) read at equal weight.
      className={`relative inline-grid shrink-0 place-items-center [&>svg]:h-[var(--stamp-ic)] [&>svg]:w-[var(--stamp-ic)] [&>svg]:[stroke-width:2] ${className}`}
      style={{
        width: dim,
        height: dim,
        // Continuous-corner squircle (~32% keeps it a soft square, not a pill).
        borderRadius: `${Math.round(dim * 0.32)}px`,
        background: `color-mix(in srgb, ${accent} 14%, var(--app-bg-elevated))`,
        // Hairline edge + top highlight (pressed seal) + a soft accent-tinted
        // lift (quiet depth, warm — not a grey plastic shadow).
        boxShadow: `var(--app-edge), var(--app-hi), 0 6px 14px -8px color-mix(in srgb, ${accent} 34%, transparent)`,
        color: accent,
        // Drives the [&>svg] size utilities above.
        ["--stamp-ic" as string]: `${ICONS[size]}px`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

const SIZES: Record<"sm" | "md" | "lg", number> = {
  sm: 32,
  md: 40,
  lg: 48,
};

// Icon glyph size per stamp — ~46% of the backplate, the optical sweet
// spot for a centred mark with breathing room.
const ICONS: Record<"sm" | "md" | "lg", number> = {
  sm: 16,
  md: 19,
  lg: 22,
};

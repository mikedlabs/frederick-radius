import type { CSSProperties, ReactNode } from "react";

/**
 * IconStamp — the guide's compact legend marker. A quiet paper square with a
 * colored registration edge replaces the generic pastel icon bubble.
 *
 * It is intentionally flat. The icon supplies meaning; a shadow or glossy
 * colored tile would make every directory row compete for attention.
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
        borderRadius: "var(--app-radius-sm)",
        background: `color-mix(in srgb, ${accent} 7%, var(--app-bg-elevated))`,
        boxShadow: `inset 2px 0 0 ${accent}, inset 0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent)`,
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

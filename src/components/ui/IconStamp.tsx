import type { CSSProperties, ReactNode } from "react";

/**
 * IconStamp — a round "stamped" backplate for an icon, like a wax
 * seal or a field-guide reference mark.
 *
 * Replaces emoji glyphs in tile UIs. Emoji render differently on
 * every OS, read casual, and ignore the brand palette. A lucide
 * icon inside a hairline-edged circle, tinted with the category
 * accent at 12% over paper-elevated, reads as deliberately set —
 * the printed-paper aesthetic the Brand Book asks for.
 *
 * Pass any icon as children (typically a `<CategoryIcon>` or a
 * raw lucide icon). The stamp itself handles size, color tint,
 * and the inner highlight + edge that the rest of the tactile
 * system uses, so a row of stamps looks like a row of stamps.
 */
export default function IconStamp({
  children,
  accent = "var(--app-ink-2)",
  size = "md",
  className = "",
  style,
}: {
  /** The icon element. Pass a `<CategoryIcon slug=…>` or a raw
   *  lucide icon. Color is set by the parent — the stamp passes
   *  `accent` through CSS so the icon picks it up via `currentColor`
   *  or an explicit color prop. */
  children: ReactNode;
  /** A CSS color or `var(--app-*)` token. Drives both the
   *  backplate's 12% tint and the icon's stroke color. Defaults to
   *  ink-2 for a neutral stamp. */
  accent?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}) {
  const dim = SIZES[size];
  return (
    <span
      aria-hidden
      className={`relative inline-grid shrink-0 place-items-center rounded-full ${className}`}
      style={{
        width: dim,
        height: dim,
        background: `color-mix(in srgb, ${accent} 12%, var(--app-bg-elevated))`,
        boxShadow: "var(--app-edge), var(--app-hi)",
        color: accent,
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

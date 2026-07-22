import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * Surface — the canonical paper container.
 *
 * Replaces the hand-repeated
 * `rounded-[…] border bg-[var(--app-bg-elevated)] shadow-[…]` pattern
 * with one restrained primitive. Most content belongs on the paper plane;
 * higher elevations are reserved for drawers, dialogs, and true overlays.
 * `interactive` adds a quiet edge change and press response. Polymorphic:
 * pass `href` to render a Next link, or `as` for the element tag.
 * Server-component safe (no hooks, no client boundary).
 */

type Elevation = 0 | 1 | 2 | 3 | 4;
type Tag = "div" | "section" | "article" | "li" | "ul";

const ELEV: Record<Elevation, string> = {
  0: "",
  1: "tactile",
  2: "tactile tactile-e2",
  3: "tactile tactile-e3",
  4: "tactile tactile-e4",
};

type SurfaceProps = {
  elevation?: Elevation;
  interactive?: boolean;
  as?: Tag;
  href?: string;
  /** Border radius; defaults to the 14px card radius. */
  radius?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function Surface({
  elevation = 1,
  interactive = false,
  as = "div",
  href,
  radius = "var(--app-radius-lg)",
  className = "",
  style,
  children,
}: SurfaceProps) {
  const cls = [
    ELEV[elevation],
    interactive ? "tactile-interactive" : "",
    "bg-[var(--app-bg-elevated)]",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const mergedStyle: CSSProperties = { borderRadius: radius, ...style };

  if (href) {
    return (
      <Link href={href} className={cls} style={mergedStyle}>
        {children}
      </Link>
    );
  }
  const Tag = as;
  return (
    <Tag className={cls} style={mergedStyle}>
      {children}
    </Tag>
  );
}

/** Card = the default elevation-1 Surface. */
export function Card(props: Omit<SurfaceProps, "elevation">) {
  return <Surface elevation={1} {...props} />;
}

import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from "react";

/**
 * Surface — the canonical bordered/inset container (Visual System v2).
 *
 * Kills the hand-repeated `rounded-[var(--app-radius-lg)] border
 * bg-[var(--app-bg-elevated)]` recipe that had multiplied across cards,
 * wells, and panels. One primitive, three roles:
 *
 *   raised — a lifted card on the page (border + raised fill). Default.
 *   sunken — an inset well (sunken fill, no border).
 *   flat   — a plain bordered block on the base canvas.
 *
 * Polymorphic: pass `as` for the right semantic element (section, article,
 * li, ...). Pass `interactive` for a tappable card (adds the tactile press
 * grammar). It only owns the container shell; typography, headings, and
 * content come from their own primitives.
 */

type Variant = "raised" | "sunken" | "flat";
type Padding = "none" | "sm" | "md" | "lg";

const BASE = "rounded-[var(--app-radius-lg)]";

const PADDING: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

function variantOf(variant: Variant): { cls: string; style: CSSProperties } {
  switch (variant) {
    case "raised":
      return { cls: "border bg-[var(--app-bg-elevated)]", style: { borderColor: "var(--app-border)" } };
    case "sunken":
      return { cls: "bg-[var(--app-bg-sunken)]", style: {} };
    case "flat":
      return { cls: "border bg-[var(--app-bg)]", style: { borderColor: "var(--app-border)" } };
  }
}

type SurfaceOwnProps = {
  variant?: Variant;
  padding?: Padding;
  /** Adds the shared tappable-card press grammar for a clickable surface. */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export type SurfaceProps<T extends ElementType = "div"> = SurfaceOwnProps & {
  /** The element/tag to render. Defaults to a div. */
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof SurfaceOwnProps | "as">;

export function Surface<T extends ElementType = "div">({
  as,
  variant = "raised",
  padding = "md",
  interactive = false,
  className = "",
  style,
  children,
  ...rest
}: SurfaceProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const { cls, style: variantStyle } = variantOf(variant);
  const classes = [
    BASE,
    cls,
    PADDING[padding],
    interactive ? "tactile tactile-interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} style={{ ...variantStyle, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

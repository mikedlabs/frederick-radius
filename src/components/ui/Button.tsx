import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * Button — the canonical action (Visual System v2).
 *
 * Kills the hand-repeated CTA classNames. Tactile by construction:
 * filled variants get layered elevation + the inner top highlight
 * (which over the brick reads as a soft gloss) + spring press; ghost
 * stays flat. Polymorphic: pass `href` to render a Next link, else a
 * real <button>. Server-component safe — no onClick (interactive
 * callers use a client wrapper); links + form buttons cover the app.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[12px]",
  md: "h-10 gap-2 px-4 text-[13px]",
  lg: "h-12 gap-2.5 px-6 text-[15px]",
};

function variantOf(v: Variant): { cls: string; style: CSSProperties } {
  switch (v) {
    case "primary":
      return {
        cls: "tactile tactile-interactive tactile-lift text-white",
        style: { background: "var(--app-brand)" },
      };
    case "danger":
      return {
        cls: "tactile tactile-interactive tactile-lift text-white",
        style: { background: "var(--app-danger)" },
      };
    case "secondary":
      return {
        cls: "tactile tactile-interactive",
        style: { background: "var(--app-bg-elevated)", color: "var(--app-ink)" },
      };
    case "ghost":
      return {
        cls: "transition-[transform,background-color,color] duration-150 hover:bg-[var(--app-bg-sunken)] hover:text-[var(--app-ink)] active:scale-[0.97]",
        style: { color: "var(--app-ink-2)" },
      };
  }
}

const BASE =
  "inline-flex select-none items-center justify-center whitespace-nowrap rounded-[var(--app-radius-md)] font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-bg)]";

function Spinner() {
  return (
    <span
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden
    />
  );
}

type Common = {
  variant?: Variant;
  size?: Size;
  className?: string;
  style?: CSSProperties;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
  "aria-label"?: string;
};

type ButtonAsButton = Common & {
  href?: undefined;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
};

type ButtonAsLink = Common & {
  href: string;
  target?: string;
  rel?: string;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = "primary",
    size = "md",
    className = "",
    style,
    iconLeft,
    iconRight,
    children,
  } = props;
  const v = variantOf(variant);
  const cls = `${BASE} ${SIZE[size]} ${v.cls} ${className}`.trim();
  const mergedStyle: CSSProperties = { ...v.style, ...style };

  if (props.href !== undefined) {
    return (
      <Link
        href={props.href}
        target={props.target}
        rel={props.rel}
        aria-label={props["aria-label"]}
        className={cls}
        style={mergedStyle}
      >
        {iconLeft}
        {children}
        {iconRight}
      </Link>
    );
  }

  const loading = props.loading ?? false;
  return (
    <button
      type={props.type ?? "button"}
      disabled={(props.disabled ?? false) || loading}
      aria-busy={loading || undefined}
      aria-label={props["aria-label"]}
      className={`${cls} disabled:pointer-events-none disabled:opacity-50`}
      style={mergedStyle}
    >
      {loading ? <Spinner /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
}

import Link from "next/link";
import type {
  AriaAttributes,
  CSSProperties,
  MouseEventHandler,
  ReactNode,
} from "react";

/**
 * Button — the canonical action (Visual System v2).
 *
 * Kills the hand-repeated CTA classNames. Tactile by construction:
 * filled variants get layered elevation + the inner top highlight
 * (which over the brick reads as a soft gloss) + spring press; quiet
 * stays flat. Polymorphic: pass `href` to render a Next link, else a
 * real <button>. It can be imported by a client component for interactive
 * actions, so those callers no longer need to rebuild the button grammar.
 */

type Variant = "primary" | "secondary" | "quiet";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "h-11 gap-1.5 px-3 text-[12px]",
  md: "h-11 gap-2 px-4 text-[13px]",
  lg: "h-12 gap-2.5 px-6 text-[15px]",
};

function variantOf(v: Variant): { cls: string; style: CSSProperties } {
  switch (v) {
    case "primary":
      return {
        cls: "tactile tactile-interactive tactile-lift tactile-glow-brand",
        style: { backgroundColor: "var(--app-brand-press)", color: "var(--app-on-brand)" },
      };
    case "secondary":
      return {
        cls: "tactile tactile-interactive",
        style: { backgroundColor: "var(--app-bg-elevated)", color: "var(--app-ink)" },
      };
    case "quiet":
      return {
        cls: "transition-[transform,background-color,color] duration-[var(--app-dur-fast)] hover:bg-[var(--app-bg-sunken)] hover:text-[var(--app-ink)] active:scale-[0.97]",
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
  "data-decision-action"?: string;
};

type ButtonAsButton = Common & {
  href?: undefined;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
  "aria-pressed"?: AriaAttributes["aria-pressed"];
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

type ButtonAsLink = Common & {
  href: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
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
        data-decision-action={props["data-decision-action"]}
        onClick={props.onClick}
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
      aria-pressed={props["aria-pressed"]}
      data-decision-action={props["data-decision-action"]}
      onClick={props.onClick}
      className={`${cls} disabled:pointer-events-none disabled:opacity-50`}
      style={mergedStyle}
    >
      {loading ? <Spinner /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
  AriaAttributes,
  CSSProperties,
  MouseEventHandler,
  ReactNode,
} from "react";

/**
 * Button: the canonical action.
 *
 * Kills the hand-repeated CTA classNames. Plain tool direction: every
 * variant is flat with a 6px corner. Primary is the one filled coral action
 * a view may have (press coral under white text for AA). Secondary is an
 * outlined control on the page ground. Quiet is text with a hover ground.
 * No gloss, lip, glow or lift. Polymorphic: pass `href` to render a Next
 * link, else a real <button>. It can be imported by a client component for
 * interactive actions, so those callers no longer need to rebuild the
 * button grammar.
 */

type Variant = "primary" | "secondary" | "quiet";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "h-11 gap-1.5 px-3 text-[12px]",
  md: "h-11 gap-2 px-4 text-[13px]",
  lg: "h-12 gap-2.5 px-6 text-[15px]",
};

/* Every variant's resting ground, border and text live in classes, never in
 * an inline style. An inline declaration outranks any utility, so a resting
 * color set in `style` would silently defeat the hover classes beside it.
 * Callers should likewise restyle through `className`, not `style`. */
const BUTTON_VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "border border-transparent bg-[var(--app-brand-press)] text-[var(--app-on-brand)] [--press-ack-color:var(--app-on-brand)] transition-[filter] duration-[var(--app-dur-fast)] hover:brightness-[0.94] active:brightness-90",
  secondary:
    "border border-[var(--app-control-border)] bg-[var(--app-bg)] text-[var(--app-ink)] transition-colors duration-[var(--app-dur-fast)] hover:bg-[var(--app-bg-sunken)]",
  quiet:
    "bg-transparent text-[var(--app-ink-2)] transition-colors duration-[var(--app-dur-fast)] hover:bg-[var(--app-bg-sunken)] hover:text-[var(--app-ink)]",
};

const BASE =
  "inline-flex select-none items-center justify-center whitespace-nowrap rounded-[var(--app-radius-md)] font-semibold tracking-tight";

function Spinner() {
  return (
    <span
      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-r-transparent"
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
  const cls = cn(BASE, SIZE[size], BUTTON_VARIANT_CLASS[variant], className);

  if (props.href !== undefined) {
    return (
      <Link
        href={props.href}
        target={props.target}
        rel={props.rel}
        aria-label={props["aria-label"]}
        data-decision-action={props["data-decision-action"]}
        data-press-target="control"
        onClick={props.onClick}
        className={cls}
        style={style}
      >
        <span data-press-face className="inline-flex w-full min-w-0 [align-items:inherit] [flex-direction:inherit] [justify-content:inherit] [gap:inherit]">
          {iconLeft}
          {children}
          {iconRight}
        </span>
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
      data-press-target="control"
      onClick={props.onClick}
      className={`${cls} disabled:pointer-events-none disabled:opacity-50`}
      style={style}
    >
      <span data-press-face className="inline-flex w-full min-w-0 [align-items:inherit] [flex-direction:inherit] [justify-content:inherit] [gap:inherit]">
        {loading ? <Spinner /> : iconLeft}
        {children}
        {!loading && iconRight}
      </span>
    </button>
  );
}

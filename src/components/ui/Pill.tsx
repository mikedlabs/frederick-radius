"use client";

import Link, { useLinkStatus } from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { haptic } from "@/lib/haptics";

/**
 * Pill — the canonical standalone toggle/intent pill (Visual System v2).
 *
 * One primitive for the "tap to narrow / pivot" control that was
 * hand-rolled ~40 times across the app with five slightly different
 * stylings (the events QUICK chips, type/town facets, TimeToggle,
 * FilterChip, RightNowStrip…). Same press feel, same tonal vocabulary,
 * one place to tune.
 *
 * Renders a <button> by default; pass `href` to render a Next <Link>
 * (with an automatic pending spinner during navigation, the
 * MapModeToggle behavior, so a slow route never feels "stuck"). The
 * inactive state uses the shared tactile elevation so it reads as a
 * real, pressable chip; active fills with the chosen tone.
 *
 * Tones:
 *   brand      — brand fill (the default "selected facet")
 *   cool       — cool fill (town / place lane)
 *   ink        — ink fill on paper text (TimeToggle's "when?" lane)
 *   prominent  — brand→cool gradient + lift (hero intent chips)
 */

type Tone = "brand" | "cool" | "ink" | "prominent";

const ACTIVE_BG: Record<Tone, string> = {
  brand: "var(--app-brand)",
  cool: "var(--app-cool)",
  ink: "var(--app-ink)",
  prominent:
    "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))",
};
const ACTIVE_FG: Record<Tone, string> = {
  brand: "#fff",
  cool: "#fff",
  ink: "var(--app-bg)",
  prominent: "#fff",
};

type PillProps = {
  children: ReactNode;
  active?: boolean;
  tone?: Tone;
  icon?: LucideIcon;
  /** Trailing count badge (tabular, tone-aware). */
  count?: number;
  size?: "sm" | "md";
  /** For chip rows that live INSIDE a shared elevated/glass container
   *  (e.g. the map time strip): inactive chips are transparent with no
   *  per-chip elevation, so they read as one connected control. */
  bare?: boolean;
  href?: string;
  onClick?: () => void;
  "aria-label"?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

function CountBadge({ count, active, tone }: { count: number; active: boolean; tone: Tone }) {
  const onInk = active && tone === "ink";
  return (
    <span
      className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
      style={{
        background: active
          ? `color-mix(in srgb, ${onInk ? "var(--app-bg)" : "#fff"} 22%, transparent)`
          : "color-mix(in srgb, var(--app-ink) 8%, transparent)",
        color: active ? ACTIVE_FG[tone] : "var(--app-ink-3)",
      }}
    >
      {count}
    </span>
  );
}

/** Shared inner content. `spinner` swaps the leading icon for a
 *  loading glyph (link path only — see LinkBody). */
function Body({
  Icon,
  children,
  count,
  active,
  tone,
  spinner = false,
}: {
  Icon?: LucideIcon;
  children: ReactNode;
  count?: number;
  active: boolean;
  tone: Tone;
  spinner?: boolean;
}) {
  return (
    <>
      {spinner ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} aria-hidden />
      ) : (
        Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      )}
      {children}
      {typeof count === "number" && count > 0 && (
        <CountBadge count={count} active={active} tone={tone} />
      )}
    </>
  );
}

/** Link-only body: reads useLinkStatus() (valid only inside a <Link>)
 *  so the pill shows a spinner the instant its navigation starts. */
function LinkBody(props: {
  Icon?: LucideIcon;
  children: ReactNode;
  count?: number;
  active: boolean;
  tone: Tone;
}) {
  const { pending } = useLinkStatus();
  return <Body {...props} spinner={pending} />;
}

export default function Pill({
  children,
  active = false,
  tone = "brand",
  icon: Icon,
  count,
  size = "md",
  bare = false,
  href,
  onClick,
  className = "",
  style,
  ...rest
}: PillProps) {
  const pad = size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]";
  const base =
    `inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold tracking-tight transition active:scale-[0.95] ${pad}`;
  // Inactive elevation: a free-standing pill gets the tactile chip
  // treatment; a `bare` pill (inside a shared container) stays flat.
  const inactiveCls = active || bare ? "" : "tactile tactile-interactive";
  const cls = `${base} ${inactiveCls} ${className}`.trim();
  const fillStyle: CSSProperties = active
    ? {
        background: ACTIVE_BG[tone],
        color: ACTIVE_FG[tone],
        boxShadow: tone === "prominent" ? "var(--app-elev-2)" : undefined,
        transitionTimingFunction: "var(--app-ease-spring)",
      }
    : {
        background: bare ? "transparent" : "var(--app-bg-elevated)",
        color: "var(--app-ink-2)",
        transitionTimingFunction: "var(--app-ease-spring)",
      };
  const merged = { ...fillStyle, ...style };

  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cls}
        style={merged}
        aria-label={rest["aria-label"]}
        title={rest.title}
      >
        <LinkBody Icon={Icon} count={count} active={active} tone={tone}>
          {children}
        </LinkBody>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onClick?.();
      }}
      aria-pressed={active}
      className={cls}
      style={merged}
      aria-label={rest["aria-label"]}
      title={rest.title}
    >
      <Body Icon={Icon} count={count} active={active} tone={tone}>
        {children}
      </Body>
    </button>
  );
}

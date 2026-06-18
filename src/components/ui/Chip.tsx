import type { CSSProperties, ReactNode } from "react";

/**
 * Chip — small tonal pill (Visual System v2).
 *
 * One source of truth for the count / status / category pills that
 * were inlined everywhere. The fill is a tokenized color-mix wash of
 * the tone (never a flat block), so it sits in the warm palette
 * instead of fighting it. Server-component safe.
 */

type Tone =
  | "neutral"
  | "brand"
  | "cool"
  | "positive"
  | "warning"
  | "danger"
  | "accent";

const TONE: Record<Tone, string> = {
  neutral: "var(--app-ink-3)",
  brand: "var(--app-brand)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive, #1E6B3A)",
  warning: "var(--app-warning)",
  danger: "var(--app-danger)",
  accent: "var(--app-accent-press)", // text-safe gold (the tone color is the chip's TEXT; gold base fails AA)
};

export function Chip({
  tone = "neutral",
  color: colorOverride,
  tabular = false,
  title,
  className = "",
  style,
  children,
}: {
  tone?: Tone;
  /** Raw CSS color (e.g. a per-source accent var) overriding `tone`. */
  color?: string;
  /** Use tabular-nums (counts that shouldn't jitter). */
  tabular?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const color = colorOverride ?? TONE[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        tabular ? "tabular-nums" : ""
      } ${className}`.trim()}
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

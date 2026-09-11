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

const TONE: Record<Tone, { fill: string; text: string }> = {
  // The tint keeps the semantic hue. Text uses its darker companion where
  // the tint would otherwise pull contrast below 4.5:1 at this 10px size.
  neutral: { fill: "var(--app-ink-3)", text: "var(--app-ink-2)" },
  brand: { fill: "var(--app-brand)", text: "var(--app-brand-press)" },
  cool: { fill: "var(--app-cool)", text: "var(--app-cool)" },
  positive: { fill: "var(--app-positive)", text: "var(--app-positive)" },
  warning: { fill: "var(--app-warning)", text: "var(--app-warning-press)" },
  danger: { fill: "var(--app-danger)", text: "var(--app-danger)" },
  accent: { fill: "var(--app-accent)", text: "var(--app-accent-press)" },
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
  const preset = TONE[tone];
  const color = colorOverride ?? preset.fill;
  // A raw color override (a category or per-source hue) is usually a vivid
  // pin/fill color that fails WCAG AA as small text. Darken it toward ink for
  // the TEXT while keeping the true hue for the tint, so category chips stay
  // legible. Tone presets are already text-safe, so leave them untouched. (a11y)
  const textColor = colorOverride
    ? `color-mix(in srgb, ${colorOverride} 55%, var(--app-ink))`
    : preset.text;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        tabular ? "tabular-nums" : ""
      } ${className}`.trim()}
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: textColor,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

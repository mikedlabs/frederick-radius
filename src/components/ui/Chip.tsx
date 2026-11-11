import type { CSSProperties, ReactNode } from "react";

/**
 * Chip: small tonal tag.
 *
 * One source of truth for the count, status and category tags that
 * were inlined everywhere. It draws a 4px tag with a light tint of the
 * tone. This tinted tag is the one informational tag still awaiting the
 * plain-text conversion, so new informational tags should be plain text.
 * The label always uses a theme-readable text token, so it keeps AA
 * contrast in the dark appearance. Server-component safe.
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
  // --app-link is the press shade in light (AA on the tint) and the light
  // coral in dark.
  brand: { fill: "var(--app-brand)", text: "var(--app-link)" },
  cool: { fill: "var(--app-cool)", text: "var(--app-cool-text)" },
  positive: { fill: "var(--app-positive)", text: "var(--app-forest-text)" },
  // --app-warning-text is the pressed Ochre in light and a light Ochre in
  // dark, where the pressed shade fell to about 2.1:1 on its own tint.
  warning: { fill: "var(--app-warning)", text: "var(--app-warning-text)" },
  danger: { fill: "var(--app-danger)", text: "var(--app-danger-text)" },
  accent: { fill: "var(--app-accent)", text: "var(--app-accent-text)" },
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
      // Plain tool: informational tags take the 4px utility corner. Full
      // capsules belong to compact filters, status badges and toggles.
      className={`inline-flex items-center gap-1 rounded-[var(--app-radius-sm)] px-2 py-0.5 text-[10px] font-semibold ${
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

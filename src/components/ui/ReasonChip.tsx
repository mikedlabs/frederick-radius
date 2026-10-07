import type { CSSProperties } from "react";

/**
 * ReasonChip — the small "why this is shown" pill that lives on
 * place and event cards. Per Brand Book No. 01 + the master UI
 * brief: each card should help the visitor make a decision, not
 * just describe the record. Reason chips do the deciding-context
 * work in a single horizontal row.
 *
 * Tones map to the brand palette:
 *   open      — positive green   (open / live now)
 *   near      — Carroll Creek    (distance / walkable)
 *   verified  — Catoctin green   (recently verified)
 *   free      — positive green   (no admission)
 *   rated     — neutral ink      (top rated / local favorite / hidden gem)
 *   neutral   — paper-sunken     (catch-all)
 *
 * Quality chips used to wear Plum, which put an arts accent on a third of
 * the catalog (501 of 1,570 places carried "Local favorite"). The brand
 * guide limits Plum to arts and editorial moments, so ratings and favorites
 * read in neutral ink like the rest of a row's supporting data.
 *
 * Capped at 3 per card by the producers (placeReasons / eventReasons)
 * so a card never reads as a chip soup.
 */
export type ReasonTone =
  | "open"
  | "near"
  | "verified"
  | "free"
  | "rated"
  | "neutral";

const TONE_TOKENS: Record<ReasonTone, { color: string; bg: string; dot?: boolean }> = {
  open: {
    color: "var(--state-open)",
    bg: "var(--state-open-bg)",
    dot: true, // a live cue for "open now"
  },
  near: {
    color: "var(--app-cool)",
    bg: "color-mix(in srgb, var(--app-cool) 16%, transparent)",
  },
  verified: {
    color: "var(--app-positive)",
    bg: "color-mix(in srgb, var(--app-positive) 16%, transparent)",
  },
  free: {
    color: "var(--app-cool)",
    bg: "color-mix(in srgb, var(--app-cool) 16%, transparent)",
  },
  rated: {
    color: "var(--app-ink-2)",
    bg: "var(--app-ink-tint-6)",
  },
  neutral: {
    color: "var(--app-ink-2)",
    bg: "var(--app-bg-sunken)",
  },
};

export default function ReasonChip({
  label,
  tone = "neutral",
  className = "",
  style,
}: {
  label: string;
  tone?: ReasonTone;
  className?: string;
  style?: CSSProperties;
}) {
  const t = TONE_TOKENS[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-tight ${className}`}
      style={{
        background: t.bg,
        color: t.color,
        // Hairline ring in the tone's own hue so the chip reads as a made
        // token on the cream card, not washed-out tinted text.
        boxShadow:
          tone === "neutral"
            ? "inset 0 0 0 1px var(--app-border)"
            : `inset 0 0 0 1px color-mix(in srgb, ${t.color} 32%, transparent)`,
        ...style,
      }}
    >
      {t.dot && (
        <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: t.color }} />
      )}
      {label}
    </span>
  );
}

/**
 * Compact row of chips — handles spacing + ARIA so consumers don't
 * have to. Use with any helper that returns an array of {label, tone}.
 */
export function ReasonChipRow({
  reasons,
  className = "",
  ariaLabel,
}: {
  reasons: Array<{ label: string; tone: ReasonTone }>;
  className?: string;
  ariaLabel?: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className}`}
      aria-label={ariaLabel ?? "Reasons this is shown"}
    >
      {reasons.map((r, i) => (
        <ReasonChip key={`${r.label}-${i}`} label={r.label} tone={r.tone} />
      ))}
    </span>
  );
}

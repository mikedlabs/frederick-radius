import { Fragment, type CSSProperties } from "react";

/**
 * ReasonChip: the small "why this is shown" label that lives on
 * place and event cards. Per Brand Book No. 01 + the master UI
 * brief: each card should help the visitor make a decision, not
 * just describe the record. Reasons do the deciding-context work in
 * a single horizontal line.
 *
 * Plain tool: a reason only labels why a record is shown. It is not a
 * status badge or a filter, so it renders as plain small text with no
 * fill, ring, corner or capsule. The open cue keeps a small status dot
 * in its own hue; every label uses a readable ink in either appearance.
 *
 * Tones keep their meaning through the dot and the data attribute:
 *   open      positive green (open / live now), drawn as a status dot
 *   near      Carroll Creek (distance / walkable)
 *   verified  Catoctin green (recently verified)
 *   free      positive green (no admission)
 *   rated     almanac gold (top rated / local favorite)
 *   neutral   catch-all
 *
 * Capped at 3 per card by the producers (placeReasons / eventReasons)
 * so a card never reads as a list of labels.
 */
export type ReasonTone =
  | "open"
  | "near"
  | "verified"
  | "free"
  | "rated"
  | "neutral";

const TONE_TOKENS: Record<ReasonTone, { color: string; dot?: boolean }> = {
  open: { color: "var(--state-open)", dot: true },
  near: { color: "var(--app-cool-text)" },
  verified: { color: "var(--app-forest-text)" },
  free: { color: "var(--app-cool-text)" },
  rated: { color: "var(--app-accent-text)" },
  neutral: { color: "var(--app-ink-2)" },
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
      data-reason-tone={tone}
      className={`inline-flex items-center gap-1 text-[12px] font-semibold leading-snug ${className}`}
      style={{
        color: "var(--app-ink-2)",
        ...style,
      }}
    >
      {t.dot && (
        <span aria-hidden className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: t.color }} />
      )}
      {label}
    </span>
  );
}

/**
 * Compact line of reasons: handles spacing, the middle-dot separators and
 * ARIA so consumers don't have to. Use with any helper that returns an
 * array of {label, tone}.
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
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}
      aria-label={ariaLabel ?? "Reasons this is shown"}
    >
      {reasons.map((r, i) => (
        <Fragment key={`${r.label}-${i}`}>
          {i > 0 && <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>}
          <ReasonChip label={r.label} tone={r.tone} />
        </Fragment>
      ))}
    </span>
  );
}

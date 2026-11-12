import { NotebookPen, Tag } from "lucide-react";

/**
 * FieldNoteTag: the small, legible "this place has source-linked local notes"
 * mark (the moat, surfaced), so a browse row, the place sheet and the map
 * popup all flag which places carry a confirmed happy hour, deal, parking
 * note or insider tip.
 *
 * PLAIN TOOL: it is an informational label, not a filter, so it renders as
 * small uppercase sans text in the readable coral text token with no fill,
 * ring or capsule. The icon is decorative; the label carries the meaning, and
 * the title spells out what's inside for hover and screen readers.
 */
export default function FieldNoteTag({
  compact = false,
  className = "",
}: {
  /** Tighter sizing for dense rows (tile/grid cards, popups). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      title="Source-linked local notes on file: happy hour, a deal, parking, or an insider tip"
      data-field-note-tag
      className={`inline-flex shrink-0 items-center gap-1 font-semibold uppercase leading-snug tracking-[0.06em] ${
        compact ? "text-[12px]" : "text-[13px]"
      } ${className}`}
      style={{ color: "var(--app-brand-text)" }}
    >
      <NotebookPen className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2.25} aria-hidden />
      Field notes
    </span>
  );
}

/**
 * DealHookTag: the same moat label, but it shows the actual verified deal
 * FIGURE ("25% OFF", "$2.75", "FROM $4") instead of the generic "Field notes"
 * label. Shown when the venue has a standing happy-hour hook
 * (PlaceCardData.deal_hook); strictly more informative than the generic tag,
 * so it REPLACES it where a hook exists. It keeps its own accent text color,
 * distinct from the coral Field notes label, with tabular figures and no
 * fill, ring or capsule.
 */
export function DealHookTag({
  label,
  compact = false,
  className = "",
}: {
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      title={`Verified deal on file: ${label}`}
      data-deal-hook-tag
      className={`inline-flex shrink-0 items-center gap-1 font-bold uppercase leading-snug tracking-[0.06em] tabular-nums ${
        compact ? "text-[12px]" : "text-[13px]"
      } ${className}`}
      style={{ color: "var(--app-accent-text)" }}
    >
      <Tag className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}

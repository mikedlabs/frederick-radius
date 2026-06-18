import { NotebookPen, Tag } from "lucide-react";

/**
 * FieldNoteTag — the small, legible "this place has VERIFIED local intel"
 * mark (the moat, surfaced). Echoes the FieldNotesCard heading grammar
 * (mono, uppercase, vermilion) shrunk to a chip so a browse card, the
 * place sheet, and the map popup all flag — at a glance — which places
 * carry a confirmed happy hour, deal, parking note, or insider tip.
 *
 * Text is --app-brand-press (AA on cream) on a brand tint, never raw
 * vermilion-on-cream. The icon is decorative; the label carries the
 * meaning, and the title spells out what's inside for hover/SR.
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
      title="Verified local intel on file: happy hour, a deal, parking, or an insider tip"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-mono font-semibold uppercase leading-none tracking-[0.1em] ${
        compact ? "px-1.5 py-[3px] text-[8.5px]" : "px-2 py-[3.5px] text-[9.5px]"
      } ${className}`}
      style={{ background: "var(--app-brand-tint-14)", color: "var(--app-brand-press)" }}
    >
      <NotebookPen className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.25} aria-hidden />
      Field notes
    </span>
  );
}

/**
 * DealHookTag — the same moat chip, but it shows the actual verified deal
 * FIGURE ("25% OFF", "$2.75", "FROM $4") instead of the generic "Field notes"
 * label, in gold. Shown on a card when the venue has a standing happy-hour
 * hook (PlaceCardData.deal_hook); strictly more informative than the generic
 * tag, so it REPLACES it where a hook exists. Gold = "there's a number here,"
 * distinct from the vermilion Field-notes mark. Text is --app-accent-press
 * (the AA-safe gold-as-text) on a gold tint, tabular-nums for the figure.
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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-mono font-bold uppercase leading-none tracking-[0.08em] tabular-nums ${
        compact ? "px-1.5 py-[3px] text-[8.5px]" : "px-2 py-[3.5px] text-[9.5px]"
      } ${className}`}
      style={{
        background: "color-mix(in srgb, var(--app-accent) 16%, transparent)",
        color: "var(--app-accent-press)",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 30%, transparent)",
      }}
    >
      <Tag className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}

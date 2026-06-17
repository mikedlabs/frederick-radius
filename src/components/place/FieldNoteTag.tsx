import { NotebookPen } from "lucide-react";

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

import type { LucideIcon } from "lucide-react";

/**
 * FieldCard — a "field guide × Apple Wallet" specimen card (PROTOTYPE).
 *
 * The proposed unifying card language for Frederick Radius: every entity
 * (place, event, trail, the next train) reads as a field-guide specimen
 * with Wallet materiality. Field guide carries the CONTENT grammar
 * (plate glyph, specimen number, a one-line field note, "habitat",
 * status); Wallet carries the SURFACE (rounded, layered shadow, a faint
 * accent wash + plate-paper texture, an oversized glyph watermark).
 *
 * Restraint is the rule: matte paper + ONE accent per category, so a
 * deck of these reads as a guide, not a casino. The only fully-saturated
 * card in the system is the weather "sky plate"; everything else stays
 * papery like this.
 *
 * Two forms, like a real field guide: `FieldCard` (the plate) for hero /
 * featured, `FieldIndexRow` (the index) for dense lists.
 */
export type FieldCardData = {
  /** Field-guide index tag, e.g. "014". */
  specimenNo: string;
  name: string;
  /** Single-word category label shown in small caps, e.g. "Coffee". */
  category: string;
  /** CSS color (token or var) — the one accent for this specimen. */
  accent: string;
  /** Category plate glyph. */
  glyph: LucideIcon;
  /** The editorial "what to know / when to catch it" line. */
  fieldNote: string;
  /** Where it lives — shown under the HABITAT label. */
  habitat: string;
  /** Hours / freshness, e.g. "Open until 9 PM". */
  status: string;
  statusTone?: "open" | "closed" | "info";
};

function statusColor(tone: FieldCardData["statusTone"]): string {
  if (tone === "open") return "var(--app-positive)";
  if (tone === "closed") return "var(--app-ink-3)";
  return "var(--app-cool)";
}

export function FieldCard({ data }: { data: FieldCardData }) {
  const { specimenNo, name, category, accent, glyph: Glyph, fieldNote, habitat, status, statusTone } = data;
  const sc = statusColor(statusTone);
  return (
    <article
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
        borderColor: "var(--app-border)",
        // Wallet materiality: faint accent wash dissolving into paper.
        background: `linear-gradient(150deg, color-mix(in srgb, ${accent} 12%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 58%)`,
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      {/* Field-guide spine — the accent left edge. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      {/* Plate-paper texture — a faint dot grid, faded out toward the bottom. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in srgb, var(--app-ink) 6%, transparent) 1px, transparent 1.4px)",
          backgroundSize: "13px 13px",
          maskImage: "linear-gradient(180deg, black, transparent 72%)",
          WebkitMaskImage: "linear-gradient(180deg, black, transparent 72%)",
        }}
      />
      {/* Oversized glyph watermark — the Wallet "halftone fill" identity beat. */}
      <Glyph
        aria-hidden
        className="pointer-events-none absolute -bottom-7 -right-5 h-44 w-44"
        strokeWidth={1.1}
        style={{ color: accent, opacity: 0.08 }}
      />

      <div className="relative px-4 py-3.5">
        {/* Header — plate glyph, category, specimen number. */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
          >
            <Glyph className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
            {category}
          </span>
          <span className="ml-auto font-mono text-[10px] tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            No. {specimenNo}
          </span>
        </div>

        {/* Name — the editorial serif register. */}
        <h3 className="mt-2.5 font-serif text-[20px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {name}
        </h3>

        {/* Field note. */}
        <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {fieldNote}
        </p>

        {/* Specimen labels — habitat + status, like a guide's plate caption. */}
        <div
          className="mt-3 flex items-end justify-between gap-3 border-t pt-2.5"
          style={{ borderColor: "color-mix(in srgb, var(--app-ink) 9%, transparent)" }}
        >
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              Habitat
            </p>
            <p className="truncate text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              {habitat}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: `color-mix(in srgb, ${sc} 14%, transparent)`, color: sc }}
          >
            {status}
          </span>
        </div>
      </div>
    </article>
  );
}

/** The compact "index" form — dense lists keep the field-guide grammar. */
export function FieldIndexRow({ data }: { data: FieldCardData }) {
  const { specimenNo, name, accent, glyph: Glyph, fieldNote, status } = data;
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
      >
        <Glyph className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          {name}
        </span>
        <span className="block truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
          {fieldNote}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        {specimenNo}
      </span>
      <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        {status}
      </span>
    </div>
  );
}

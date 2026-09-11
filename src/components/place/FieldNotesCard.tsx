import { ChevronDown, Clock3, Tag, Car, Lightbulb, ExternalLink, type LucideIcon } from "lucide-react";
import FieldStamp from "@/components/ui/FieldStamp";
import {
  fieldNotesFor,
  fieldNoteSources,
  fieldNotesVerificationSummary,
  verifiedLabel,
  type FNSourced,
} from "@/lib/loaders/fieldNotes";

/**
 * FieldNotesCard — source-linked Field Notes for a place.
 *
 * Icon-led, not label-led: each line is anchored by a small tinted glyph
 * (happy hour / deal / parking / insider) instead of a mono label column, so
 * the card reads as a few scannable facts rather than a wall of text. Notes render in FULL —
 * a hand-curated tip cut mid-word ("the same block as Caf…") threw away
 * the exact payoff the card exists for; curation bounds the length, not CSS.
 * Every row carries its own compact evidence line. Undated facts stay visible, but are clearly labeled instead
 * of inheriting a blanket VERIFIED mark from a different row. Self-hides when
 * a place has no notes.
 */

function hostOf(u?: string): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Row({
  icon: Icon,
  tint,
  lead,
  evidence,
  children,
}: {
  icon: LucideIcon;
  tint: string;
  lead?: string;
  evidence: FNSourced;
  children: React.ReactNode;
}) {
  const verified = verifiedLabel(evidence.last_verified);
  const host = hostOf(evidence.source_url);
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${tint} 15%, transparent)`, color: tint }}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        <span>
          {lead && <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{lead} </span>}
          {children}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
          <span>{verified ?? "Verification date not recorded"}</span>
          {host && evidence.source_url ? (
            <>
              <span aria-hidden>·</span>
              <a
                href={evidence.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-44-y inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
              >
                {host}
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
              </a>
            </>
          ) : null}
        </span>
      </span>
    </li>
  );
}

type NoteRow =
  | { kind: "happy-hour"; text: string; details?: string; evidence: FNSourced }
  | { kind: "deal"; text: string; index: number; evidence: FNSourced }
  | { kind: "parking"; text: string; evidence: FNSourced }
  | { kind: "insider"; text: string; index: number; evidence: FNSourced };

function renderRow(row: NoteRow) {
  switch (row.kind) {
    case "happy-hour":
      return (
        <Row key="happy-hour" icon={Clock3} tint="var(--app-accent)" lead="Happy hour" evidence={row.evidence}>
          <span className="font-medium" style={{ color: "var(--app-ink)" }}>{row.text}</span>
          {row.details ? <span> · {row.details}</span> : null}
        </Row>
      );
    case "parking":
      return (
        <Row key="parking" icon={Car} tint="var(--app-cool)" lead="Park" evidence={row.evidence}>
          {row.text}
        </Row>
      );
    case "deal":
      return (
        <Row key={`deal-${row.index}`} icon={Tag} tint="var(--app-brand)" evidence={row.evidence}>
          <span className="font-medium" style={{ color: "var(--app-ink)" }}>{row.text}</span>
        </Row>
      );
    case "insider":
      return (
        <Row key={`ins-${row.index}`} icon={Lightbulb} tint="var(--app-brand-2)" evidence={row.evidence}>
          {row.text}
        </Row>
      );
  }
}

export default function FieldNotesCard({ slug }: { slug: string }) {
  const fn = fieldNotesFor(slug);
  if (!fn) return null;

  const all = fieldNoteSources(fn);
  const verification = fieldNotesVerificationSummary(all);
  // Lead with visit decisions. Event-like deals and extra local color remain
  // one tap away, so a rich record does not turn the place page into a wall.
  const rows: NoteRow[] = [
    ...(fn.happy_hour
      ? [{
          kind: "happy-hour" as const,
          text: fn.happy_hour.schedule,
          details: fn.happy_hour.details,
          evidence: {
            text: fn.happy_hour.schedule,
            source_url: fn.happy_hour.source_url,
            confidence: fn.happy_hour.confidence,
            last_verified: fn.happy_hour.last_verified,
          },
        }]
      : []),
    ...(fn.parking ? [{ kind: "parking" as const, text: fn.parking.text, evidence: fn.parking }] : []),
    ...(fn.deals ?? []).map((deal, index) => ({ kind: "deal" as const, text: deal.text, index, evidence: deal })),
    ...(fn.insider ?? []).map((note, index) => ({ kind: "insider" as const, text: note.text, index, evidence: note })),
  ];
  const visibleRows = rows.slice(0, 2);
  const moreRows = rows.slice(2);

  return (
    <section
      aria-labelledby="fieldnotes-heading"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <div className="flex items-center gap-2">
        <h2 id="fieldnotes-heading" className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
          Field notes
        </h2>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
      </div>

      <ul className="mt-3 space-y-3">
        {visibleRows.map(renderRow)}
      </ul>

      {moreRows.length > 0 && (
        <details className="group mt-2">
          <summary
            className="tap-44 flex cursor-pointer list-none items-center justify-between rounded-xl px-1 text-[12px] font-semibold [&::-webkit-details-marker]:hidden"
            style={{ color: "var(--app-brand-press)" }}
          >
            <span>{moreRows.length} more {moreRows.length === 1 ? "note" : "notes"}</span>
            <ChevronDown
              aria-hidden
              className="h-4 w-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="space-y-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
            {moreRows.map(renderRow)}
          </ul>
        </details>
      )}

      {verification.total > 0 && (
        <div className="mt-3.5 flex items-center gap-2.5 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          <FieldStamp
            id={`fn-${slug}`}
            top={verification.allDated ? "VERIFIED" : "SOURCED"}
            bottom="FIELD NOTES"
            size={40}
            className="-my-1 shrink-0"
          />
          <p className="min-w-0 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {verification.allDated
              ? "Every note has a recorded verification date."
              : `${verification.undated} of ${verification.total} ${verification.undated === 1 ? "note has" : "notes have"} no recorded verification date.`}
          </p>
        </div>
      )}
    </section>
  );
}

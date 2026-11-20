import { ChevronDown, Clock3, Tag, Car, Lightbulb, ExternalLink, type LucideIcon } from "lucide-react";
import PlaceSectionLabel from "./PlaceSectionLabel";
import {
  fieldNotesFor,
  verifiedLabel,
  type FNSourced,
} from "@/lib/loaders/fieldNotes";

/**
 * FieldNotesCard — source-linked Field Notes for a place.
 *
 * Icon-led, not label-led: each line is anchored by a small bare glyph
 * (happy hour / deal / parking / insider) instead of a mono label column, so
 * the card reads as a few scannable facts rather than a wall of text. Notes render in FULL —
 * a hand-curated tip cut mid-word ("the same block as Caf…") threw away
 * the exact payoff the card exists for; curation bounds the length, not CSS.
 * Every row carries its own compact evidence line: its own verification date
 * (or "Verification date not recorded") and its source link. There is no
 * card-level seal or summary sentence; a row's date is the only claim made
 * about that row, so an undated fact can never borrow another row's date.
 * Self-hides when a place has no notes.
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
      {/* PLAIN TOOL: the glyph sits bare beside the line, no tinted disc. */}
      <Icon aria-hidden className="mt-[3px] h-4 w-4 shrink-0" strokeWidth={2} style={{ color: tint }} />
      <span className="min-w-0 flex-1 text-[15px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        <span>
          {lead && <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{lead} </span>}
          {children}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
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
        <Row key="happy-hour" icon={Clock3} tint="var(--app-accent-text)" lead="Happy hour" evidence={row.evidence}>
          <span className="font-medium" style={{ color: "var(--app-ink)" }}>{row.text}</span>
          {row.details ? <span> · {row.details}</span> : null}
        </Row>
      );
    case "parking":
      return (
        <Row key="parking" icon={Car} tint="var(--app-cool-text)" lead="Park" evidence={row.evidence}>
          {row.text}
        </Row>
      );
    case "deal":
      return (
        <Row key={`deal-${row.index}`} icon={Tag} tint="var(--app-ink-2)" evidence={row.evidence}>
          <span className="font-medium" style={{ color: "var(--app-ink)" }}>{row.text}</span>
        </Row>
      );
    case "insider":
      return (
        <Row key={`ins-${row.index}`} icon={Lightbulb} tint="var(--app-forest-text)" evidence={row.evidence}>
          {row.text}
        </Row>
      );
  }
}

export default function FieldNotesCard({ slug }: { slug: string }) {
  const fn = fieldNotesFor(slug);
  if (!fn) return null;

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
    // PLAIN TOOL: a ruled section on the page ground. No box, no shadow; the
    // page draws the one hairline between sections.
    <section aria-labelledby="fieldnotes-heading">
      <PlaceSectionLabel id="fieldnotes-heading">Field notes</PlaceSectionLabel>

      <ul className="mt-3 space-y-3">
        {visibleRows.map(renderRow)}
      </ul>

      {moreRows.length > 0 && (
        <details className="group mt-2">
          <summary
            className="tap-44 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-[var(--app-radius-sm)] text-[14px] font-semibold [&::-webkit-details-marker]:hidden"
            style={{ color: "var(--app-link)" }}
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
    </section>
  );
}

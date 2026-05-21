/**
 * Event lifecycle status.
 *
 * Events get cancelled or postponed — Alive @ Five gets rained out, a
 * venue double-books, a headliner drops. A stale "it's on!" card is a
 * trust-killer, so status is a first-class field, not a guess.
 *
 * Two ways status arrives:
 *   1. An iCal feed carries a STATUS property (STATUS:CANCELLED).
 *      Clean, structured — trust it directly.
 *   2. A publisher only edits the event TITLE ("... - CANCELLED").
 *      Common in practice (the Celebrate Frederick feed does this),
 *      so we sniff the title as a fallback.
 *
 * Pure module — no network, no clock. Safe to import anywhere.
 */

export type EventStatus = "scheduled" | "cancelled" | "postponed";

const TITLE_CANCELLED = /\b(cancell?ed|canceled)\b/i;
const TITLE_POSTPONED = /\b(postponed|rescheduled|rain\s*date|date\s*tbd)\b/i;

/**
 * Resolve an event's status from its iCal STATUS property (when
 * present) and a title sniff (always). The iCal STATUS wins when it
 * says CANCELLED; otherwise the title heuristic fills the gap.
 */
export function deriveEventStatus(
  title: string,
  icalStatus?: string | null,
): EventStatus {
  const s = (icalStatus ?? "").trim().toUpperCase();
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  const t = title ?? "";
  if (TITLE_CANCELLED.test(t)) return "cancelled";
  if (TITLE_POSTPONED.test(t)) return "postponed";
  // iCal TENTATIVE is not a cancellation — a tentative event is still
  // "scheduled" as far as a user planning their evening is concerned.
  return "scheduled";
}

/**
 * Strip a cancellation/postponement marker from a title once status is
 * captured in the field — "Asia On The Creek - CANCELLED" and
 * "CANCELLED: Asia On The Creek" both become "Asia On The Creek". The
 * status badge carries the meaning; the title shouldn't shout it too.
 * Handles a trailing marker, a leading marker, and a parenthetical.
 */
const MARKER = "cancell?ed|canceled|postponed|rescheduled";
export function stripStatusMarker(title: string): string {
  let t = (title ?? "").trim();
  // Trailing: "... - CANCELLED", "... (CANCELLED)", "... — Postponed."
  t = t.replace(new RegExp(`[\\s—–·|:-]+\\(?(${MARKER})\\)?\\.?\\s*$`, "i"), "");
  // Leading: "CANCELLED: ...", "(CANCELLED) ...", "CANCELLED - ..."
  t = t.replace(new RegExp(`^\\(?(${MARKER})\\)?[\\s—–·|:-]+`, "i"), "");
  // A bare parenthetical anywhere: "Art Walk (CANCELLED) downtown"
  t = t.replace(new RegExp(`\\s*\\((${MARKER})\\)\\s*`, "i"), " ");
  return t.trim();
}

/** Human label for a status badge. Null for the normal case. */
export function statusLabel(status: EventStatus): string | null {
  if (status === "cancelled") return "Cancelled";
  if (status === "postponed") return "Postponed";
  return null;
}

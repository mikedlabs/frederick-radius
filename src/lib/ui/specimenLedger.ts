/**
 * The "specimen ledger" — the single mono data row under a place's serif
 * name on a Specimen card / popup (the chosen "clever card" treatment).
 * It reads like a field-guide plate caption: a few terse, tabular facts
 * separated by middots — "Open · til 6pm · $$" — not a paragraph.
 *
 * Pure and now-injectable so it unit-tests without wall-clock flake, the
 * same pattern as scrubTime / getOpenStatus. Surfaces render the cells;
 * they never format hours themselves.
 */
import type { Place } from "@/data/places";
import { getOpenStatus, formatTime } from "@/lib/hours";

/** A single fact in the ledger. `tone` lets the surface color the open
 *  state (green when open, warning when closing, muted otherwise) while
 *  keeping every other cell neutral — semantic, not decorative. */
export type LedgerCell = {
  text: string;
  tone: "open" | "soon" | "closed" | "muted";
};

/** "$", "$$"… from a 1–4 price band. Null when unpriced so the caller can
 *  omit the cell rather than render an empty one. */
export function priceLabel(band?: 1 | 2 | 3 | 4): string | null {
  return band ? "$".repeat(band) : null;
}

/**
 * The open-status cell, in the ledger's terse voice:
 *   open        → "Open · til 6pm"   (or "Open 24h")
 *   closing     → "Til 6pm"          (warning tone — the "hurry" cell)
 *   closed      → "Closed"           (with reopen day when known)
 *   unverified  → "Hours unconfirmed"
 *   unknown     → null (no cell; we don't invent a fact)
 */
export function openCell(place: Place, now: Date = new Date()): LedgerCell | null {
  const status = getOpenStatus(
    place.hours,
    { verified: place.hours_verified ?? place.is_verified },
    now,
  );
  switch (status.state) {
    case "open":
      return {
        text: status.allDay ? "Open 24h" : `Open · til ${formatTime(status.closesAt)}`,
        tone: "open",
      };
    case "closing-soon":
      return { text: `Til ${formatTime(status.closesAt)}`, tone: "soon" };
    case "closed":
      return { text: "Closed", tone: "closed" };
    case "unverified":
      return { text: "Hours unconfirmed", tone: "muted" };
    default:
      return null;
  }
}

/**
 * Assemble the whole ledger row for a place: open cell, then price. Order
 * is fixed (status first — it's the "can I go now?" answer), muted cells
 * trail. Returns [] when nothing factual is known, so the caller can drop
 * the row entirely instead of rendering an empty rule.
 */
export function specimenLedger(place: Place, now: Date = new Date()): LedgerCell[] {
  const cells: LedgerCell[] = [];
  const open = openCell(place, now);
  if (open) cells.push(open);
  const price = priceLabel(place.price_band);
  if (price) cells.push({ text: price, tone: "muted" });
  return cells;
}

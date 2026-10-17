import type { DaypartPick } from "@/lib/loaders/daypartPicks";

export const HOURS_NOT_CONFIRMED = "Hours not confirmed";

const HEDGING = /\blikely\b|\bprobably\b|\bmay\b|check hours/i;

/** Opening soon is a confirmed-hours transition, never a guessed door time. */
export function isConfirmedOpeningSoon(
  place: DaypartPick | null | undefined,
): place is DaypartPick {
  return place?.confidence === "confirmed";
}

/** Keep the site's existing clock token ("4pm", "5:30pm") from a hours fact. */
export function daypartOpeningTime(fact: string | null | undefined): string | null {
  const text = fact?.trim();
  if (!text) return null;
  const match =
    text.match(/^Opens soon\s*[·-]\s*(.+)$/i) ||
    text.match(/^Opens at\s+(.+)$/i) ||
    text.match(/^Opens\s+(.+)$/i);
  const time = match?.[1]?.replace(/\.$/, "").trim();
  return time || null;
}

/** Hours line for Today place cards. Confirmed opening times become "Opens 4pm".
 * Unconfirmed hours never guess a time or say likely / check hours. */
export function daypartPlaceFact(place: Pick<DaypartPick, "confidence" | "fact">): string {
  if (place.confidence === "confirmed") {
    const time = daypartOpeningTime(place.fact);
    if (time) return `Opens ${time}`;
    const fact = place.fact?.trim();
    if (fact && !HEDGING.test(fact)) return fact;
    return "Open now";
  }
  return HOURS_NOT_CONFIRMED;
}

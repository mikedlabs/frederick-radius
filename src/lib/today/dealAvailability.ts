import { happyHourStatus } from "@/lib/happyHour";

export type DealAvailability = {
  state: "now" | "later" | "today" | "earlier";
  label: string;
  when: string;
  rank: number;
};

/**
 * Turn the already-distilled display hours from today's deals into an honest
 * availability label. The shared schedule parser only makes a live claim when
 * it can understand a real range (or "All day"); a single or missing time
 * keeps the deliberately softer "Today" label.
 */
export function todayDealAvailability(
  hours: string | undefined,
  weekday: string,
  now: Date,
): DealAvailability {
  if (!hours) {
    return { state: "today", label: "Today", when: "Time not listed", rank: 2 };
  }

  const status = happyHourStatus(`${weekday} ${hours}`, now);
  if (status.state === "now") {
    return { state: "now", label: "Available now", when: hours, rank: 0 };
  }
  if (status.state === "today") {
    return { state: "later", label: "Later today", when: hours, rank: 1 };
  }
  if (status.state === "other") {
    return { state: "earlier", label: "Earlier today", when: hours, rank: 3 };
  }
  return { state: "today", label: "Today", when: hours, rank: 2 };
}

/**
 * Keep only deals whose parsed window includes right now. Day-matched deals
 * with a later, earlier, single, or missing time still belong in the Today's
 * specials list, but must not contribute to an "On now" claim.
 */
export function dealsAvailableNow<T extends { hours?: string }>(
  deals: T[],
  weekday: string,
  now: Date,
): T[] {
  return deals.filter((deal) => todayDealAvailability(deal.hours, weekday, now).state === "now");
}

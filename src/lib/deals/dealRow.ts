/**
 * Client-safe shape for one source-checked deal.
 *
 * Keep this module free of data and loader imports. The deals page builds rows
 * on the server, while the interactive browser only needs this serializable
 * shape and the two selected-day accessors below.
 */
export type DealRow = {
  slug: string;
  name: string;
  town?: string;
  category?: string;
  photo?: string;
  /** Backward-compatible full display offer, with leading day + hours removed. */
  offer: string;
  /** Short scan headline distilled without replacing the complete offer. */
  headline: string;
  /** A source-stated restriction lifted from the offer, when present. */
  terms?: string;
  /** Complete cleaned public offer before any selected-day narrowing. */
  fullOffer: string;
  /** Selected-day display copy. Unrelated weekday clauses are excluded. */
  offerByDay?: Partial<Record<number, string>>;
  /** Selected-day time labels. Mixed schedules stay separate here. */
  hoursByDay?: Partial<Record<number, string>>;
  /** Shared run-time only. Undefined when timing differs by weekday. */
  hours?: string;
  /** Weekday indices (0=Sun) named in the deal text. Empty = a standing
   * special with no fixed day, shown honestly on its own shelf. */
  days: number[];
  source_url?: string;
  verified: string | null;
  confidence: string;
};

/** Selected-day offer with a safe fallback for standing or legacy rows. */
export function dealOfferForDay(row: DealRow, day: number): string {
  return row.offerByDay?.[day] ?? row.offer;
}

/** Selected-day timing with a safe fallback for standing or legacy rows. */
export function dealHoursForDay(
  row: DealRow,
  day: number,
): string | undefined {
  return row.hoursByDay?.[day] ?? row.hours;
}

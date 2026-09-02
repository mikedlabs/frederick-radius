import {
  GREAT_FREDERICK_FAIR_2026_END_DATE,
  GREAT_FREDERICK_FAIR_2026_START_DATE,
} from "@/lib/fair/schedule";
import { easternDayKey } from "@/lib/tz";

export const TODAY_FAIR_PROMOTION_START_DATE = "2026-09-02" as const;
export const TODAY_FAIR_PROMOTION_SLUG =
  "great-frederick-fair-2026" as const;
export const TODAY_FAIR_PROMOTION_HREF =
  `/moments/${TODAY_FAIR_PROMOTION_SLUG}#now` as const;

export type TodayFairPromotionPhase = "planning" | "fair-day";

/**
 * Keep the Fair doorway on Today for the full campaign, using Frederick's
 * civil day rather than the server's UTC date. It retires after the Fair's
 * final Eastern calendar day; /today's five-minute ISR is the only lag.
 */
export function todayFairPromotionPhase(
  now: Date,
): TodayFairPromotionPhase | null {
  const day = easternDayKey(now);

  if (
    day < TODAY_FAIR_PROMOTION_START_DATE ||
    day > GREAT_FREDERICK_FAIR_2026_END_DATE
  ) {
    return null;
  }

  return day < GREAT_FREDERICK_FAIR_2026_START_DATE
    ? "planning"
    : "fair-day";
}

import { todaysDeals, EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";
import TodaysDealsStack from "@/components/today/TodaysDealsStack";

/**
 * Today's Deals — the VERIFIED day-of-week specials running today (the Field
 * Notes moat on the front door). Server component: it loads the verified
 * specials and hands them to the client TodaysDealsStack, which presents them
 * as an Apple-Wallet DECK (overlapping passes that fan open with a spring).
 * Self-hides when nothing runs today (honest empty).
 */
export default function TodaysDeals({ now, limit = 6 }: { now: Date; limit?: number }) {
  const deals = todaysDeals(now, limit);
  if (deals.length === 0) return null;
  // The almanac date numeral — derived Eastern here, never in render, so it
  // can't drift from EASTERN_WEEKDAY's timezone.
  const dayNum = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", day: "numeric",
  }).format(now);
  return (
    <TodaysDealsStack deals={deals} weekday={EASTERN_WEEKDAY(now)} dayNum={dayNum} />
  );
}

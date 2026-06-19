import { todaysDeals, EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";
import TodaysDealsStack from "@/components/today/TodaysDealsStack";

/**
 * Today's Deals — the VERIFIED day-of-week specials running today (the Field
 * Notes moat on the front door). Server component: it loads the verified
 * specials and hands them to TodaysDealsStack, which presents them as rich,
 * photo-forward cards with an embossed gold denomination figure.
 * Self-hides when nothing runs today (honest empty).
 */
export default function TodaysDeals({ now, limit = 6 }: { now: Date; limit?: number }) {
  const deals = todaysDeals(now, limit);
  if (deals.length === 0) return null;
  return <TodaysDealsStack deals={deals} weekday={EASTERN_WEEKDAY(now)} />;
}

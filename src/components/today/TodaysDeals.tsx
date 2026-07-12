import { todaysDeals, EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";
import { getDbDealsToday, mergeTodaysDeals } from "@/lib/loaders/fieldNotesDb";
import TodaysDealsStack from "@/components/today/TodaysDealsStack";

/**
 * Today's Deals — the VERIFIED day-of-week specials running today (the Field
 * Notes moat on the front door). Server component: it loads the verified
 * specials and hands them to TodaysDealsStack, which presents them as rich,
 * photo-forward cards with an embossed gold denomination figure.
 * Self-hides when nothing runs today (honest empty).
 *
 * Deals come from TWO sources merged into one deck: the committed
 * field-notes.json (the seed) plus owner-added rows from the field_notes table
 * (edited on /admin/field-notes, so a deal can be added from a phone and go
 * live today). A DB deal for a place wins over its JSON deal.
 */
export default async function TodaysDeals({ now, limit = 6 }: { now: Date; limit?: number }) {
  const jsonDeals = todaysDeals(now, limit);
  const dbDeals = await getDbDealsToday(now, limit);
  const deals = mergeTodaysDeals(jsonDeals, dbDeals, limit);
  if (deals.length === 0) return null;
  return <TodaysDealsStack deals={deals} weekday={EASTERN_WEEKDAY(now)} />;
}

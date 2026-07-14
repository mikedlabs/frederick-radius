import { EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";
import { getMergedTodaysDeals } from "@/lib/loaders/fieldNotesDb";
import TodaysDealsStack from "@/components/today/TodaysDealsStack";

/**
 * Today's Deals — the VERIFIED day-of-week specials running today (the Field
 * Notes moat on the front door). Server component: it loads the verified
 * specials and hands them to TodaysDealsStack, which presents the most useful
 * four as a scan-first ledger with a path to the full weekly browser.
 * Self-hides when nothing runs today (honest empty).
 *
 * Deals come from TWO sources merged into one list: the committed
 * field-notes.json (the seed) plus owner-added rows from the field_notes table
 * (edited on /admin/field-notes, so a deal can be added from a phone and go
 * live today). A DB deal for a place wins over its JSON deal.
 */
export default async function TodaysDeals({
  now,
  limit = Number.MAX_SAFE_INTEGER,
}: {
  now: Date;
  limit?: number;
}) {
  const deals = await getMergedTodaysDeals(now, limit);
  if (deals.length === 0) return null;
  return <TodaysDealsStack deals={deals} weekday={EASTERN_WEEKDAY(now)} now={now} />;
}

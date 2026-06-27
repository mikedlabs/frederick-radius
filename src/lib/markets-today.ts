import { getFrederickMdMarkets, type MdMarket } from "@/lib/integrations/mdFarmersMarkets";
import MD_MARKETS_RAW from "@/data/farmers-markets.json";

/**
 * "Farmers markets open today" — the AUTHORITATIVE Maryland list, filtered to
 * today's weekday. We use the MD list directly rather than the place-name join
 * (which only confidently matches a couple of our place records) so the count is
 * complete and honest: only markets MD publishes with a real recurring day +
 * hours appear, never a guess. Self-hides when none today.
 *
 * STAYS FRESH WITHOUT A CRON: a Vercel cron can't rewrite the committed JSON
 * (read-only FS), so instead we read the LIVE MD feed (getFrederickMdMarkets is
 * already weekly-cached by Next's data cache, so it auto-refreshes and costs ~0
 * per render), and fall back to the committed snapshot only if the live fetch is
 * empty (network/feed hiccup). Result: always current, never empty.
 */
const SNAPSHOT = MD_MARKETS_RAW as MdMarket[];

/** Markets whose recurring day matches `now`'s Eastern weekday. Pure (markets
 *  passed in) so it's unit-tested without the data file or network. */
export function marketsOpenOn(markets: MdMarket[], now: Date): MdMarket[] {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(now);
  return markets.filter((m) => m.day && m.hours && m.day.toLowerCase() === weekday.toLowerCase());
}

/** The live MD market set (weekly-cached), falling back to the committed
 *  snapshot when the feed returns nothing — so it self-refreshes yet never
 *  goes empty. */
export async function loadMarkets(): Promise<MdMarket[]> {
  const live = await getFrederickMdMarkets();
  return live.length > 0 ? live : SNAPSHOT;
}

/** Today's open markets, from the auto-refreshing live feed (snapshot fallback). */
export async function marketsOpenToday(now: Date = new Date()): Promise<MdMarket[]> {
  return marketsOpenOn(await loadMarkets(), now);
}

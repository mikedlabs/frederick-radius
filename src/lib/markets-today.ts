import type { MdMarket } from "@/lib/integrations/mdFarmersMarkets";
import MD_MARKETS_RAW from "@/data/farmers-markets.json";

/**
 * "Farmers markets open today" — read straight from the official Maryland
 * snapshot (src/data/farmers-markets.json, via build:farmers-markets), filtered
 * to today's weekday. We use the AUTHORITATIVE MD list directly rather than the
 * place-name join (which only confidently matches a couple of our place records)
 * so the count is complete and honest: only markets MD publishes with a real
 * recurring day + hours appear, never a guess. Self-hides when none today.
 */
const MD_MARKETS = MD_MARKETS_RAW as MdMarket[];

/** Markets whose recurring day matches `now`'s Eastern weekday. Pure (snapshot
 *  passed in) so it's unit-tested without the data file. */
export function marketsOpenOn(markets: MdMarket[], now: Date): MdMarket[] {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(now);
  return markets.filter((m) => m.day && m.hours && m.day.toLowerCase() === weekday.toLowerCase());
}

/** Today's open markets from the committed MD snapshot. */
export function marketsOpenToday(now: Date = new Date()): MdMarket[] {
  return marketsOpenOn(MD_MARKETS, now);
}

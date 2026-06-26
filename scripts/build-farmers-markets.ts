/**
 * build-farmers-markets.ts — snapshot the official MD farmers-market schedule.
 *
 * src/lib/integrations/mdFarmersMarkets.ts already fetches the keyless Maryland
 * Socrata dataset (fpk6-yugb) filtered to the 9 Frederick County markets, with
 * the real market_day / market_hours / address / website. It was written but
 * never wired into any surface. Rather than fetch that at request time on every
 * /category/market render, this snapshots it ONCE into a committed JSON — the
 * same boundary-data discipline the rest of the app uses (places-client.json,
 * places-amenities.json) — and the loader joins it by normalized name.
 *
 * The sandbox can't reach Socrata, so the committed file ships as [] and this is
 * a no-op until run. Run when you want to refresh the schedule (rarely changes):
 *   npm run build:farmers-markets
 *   npm run build:client-places   # so the market_day/hours reach map + search
 *
 * HONEST: only the day/hours/address/website Maryland publishes are stored; the
 * source's stale season dates are deliberately omitted (see the integration's
 * header). A market with no confident name match simply gets no schedule.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getFrederickMdMarkets } from "../src/lib/integrations/mdFarmersMarkets";

const OUT = resolve(process.cwd(), "src/data/farmers-markets.json");

async function main() {
  const markets = await getFrederickMdMarkets();
  if (markets.length === 0) {
    console.warn("No markets returned (network blocked, or the dataset moved). Leaving the file unchanged.");
    return;
  }
  writeFileSync(OUT, JSON.stringify(markets, null, 0));
  console.log(`wrote ${OUT} — ${markets.length} Frederick County markets`);
  console.log("Next: npm run build:client-places");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

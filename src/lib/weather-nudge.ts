import { isActivelyWet } from "./weather-verdict";
import { COLLECTION_BY_SLUG } from "@/data/collections";

/**
 * Weather nudge — the ACTION half of the weather signal. Where weatherVerdict /
 * NowIntel DESCRIBE the conditions ("Wet out, an indoor kind of day"), this maps
 * an adverse hour to a concrete field move: duck into the Rainy-Day collection.
 *
 * Honest + conservative ("finding not telling"): it fires only on genuinely
 * adverse readings (storm, snow, active rain, hard cold, hard heat) and returns
 * null on an ordinary hour, so the masthead stays calm. The thresholds and the
 * storm/snow tests MIRROR weather-verdict.ts EXACTLY so this can never contradict
 * the verdict line a few rows below (it reuses the exported isActivelyWet for the
 * over-claim-prone rain case, and copies the rest with line citations).
 *
 * Indoor-only by design: a clear+mild day has no honest single collection to
 * point at (there is no parks/outdoors collection), so a pleasant day simply
 * self-hides rather than nag.
 */
export type WeatherNudge = {
  kind: "indoor";
  /** Short calm lead, NOT a repeat of the verdict sentence. */
  lead: string;
  /** Link label (the collection title). */
  cta: string;
  href: string;
  collectionSlug: string;
};

// Mirror of weather-verdict.ts so the two never disagree.
const STORM = /thunder|t-?storm|severe/i; // weather-verdict.ts:56
const SNOW = /snow|sleet|flurr|wintry|ice/i; // weather-verdict.ts:57
const COLD_F = 38; // weather-verdict.ts:139
const HOT_F = 89; // weather-verdict.ts:142

export type NudgeInput = { temp: number; shortForecast: string; precipNow: number };

export function weatherNudge(input: NudgeInput): WeatherNudge | null {
  const { temp, shortForecast, precipNow } = input;
  const rainy = COLLECTION_BY_SLUG["rainy-day-frederick"];
  if (!rainy) return null; // collection renamed/removed: self-hide, never a 404

  // Worst-first adverse window: storm or snow text, active rain, or extreme temp.
  const adverse =
    STORM.test(shortForecast) ||
    SNOW.test(shortForecast) ||
    isActivelyWet(shortForecast, precipNow) ||
    temp <= COLD_F ||
    temp >= HOT_F;
  if (!adverse) return null;

  return {
    kind: "indoor",
    lead: "Weather to duck.",
    cta: "Rainy day Frederick",
    href: "/collections/rainy-day-frederick",
    collectionSlug: "rainy-day-frederick",
  };
}

import "server-only";
import { unstable_cache } from "next/cache";
import { after } from "next/server";
import type { NwsForecast } from "@/lib/integrations/nws";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import { easternDayKey } from "@/lib/tz";
import { todayForecastRange } from "./forecast-range";

type SavedHigh = { day: string; highF: number; issuedAt: string };

function validHigh(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -80 && value <= 140;
}

function validIssuance(value: unknown, day: string, now: Date): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i.test(value)) return false;
  const issued = new Date(value);
  return Number.isFinite(issued.getTime()) && issued <= now && easternDayKey(issued) === day;
}

// One shared Frederick entry per Eastern day. The first successful fill
// is an earlier official forecast, never a replacement for a new direct read.
async function dayHigh(day: string, seed: SavedHigh | null): Promise<SavedHigh> {
  return unstable_cache(async () => {
    // A cold evening read cannot create an empty entry.
    if (!seed) throw new Error("No retained daytime forecast");
    return seed;
  }, ["frederick-nws-daytime-high-v1", day], { revalidate: 2 * 86400 })();
}

export async function frederickForecastRange(forecast: NwsForecast | null, now: Date) {
  const range = todayForecastRange(forecast?.daily ?? [], now);
  const highF = validHigh(range.highF) ? range.highF : null;
  const direct = { highF, lowF: range.lowF, retainedHighIssuedAt: null as string | null };
  const day = easternDayKey(now);
  if (range.highF !== null) {
    const issuedAt = forecast?.dailyAsOf;
    if (highF !== null && validIssuance(issuedAt, day, now)) {
      const warm = dayHigh(day, { day, highF, issuedAt }).catch(() => undefined);
      // Keep the optional write alive after the response on a serverless host.
      // The direct result also works outside a request that supports after().
      try { after(warm); } catch { /* Optional cache warming. */ }
    }
    return direct;
  }
  // Only supplement an official forecast that still supplies tonight's low.
  if (range.lowF === null) return direct;
  const saved = await withDeadlineFallback<SavedHigh | null>(dayHigh(day, null), 150, null);
  if (saved?.day !== day || !validHigh(saved.highF) || !validIssuance(saved.issuedAt, day, now)) return direct;
  return { ...range, highF: saved.highF, retainedHighIssuedAt: saved.issuedAt };
}

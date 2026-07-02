/**
 * Maryland DNR trout stocking — Frederick County waters.
 *
 * The DNR stocking dashboard is backed by an open JSON API (discovered from
 * the page source; no key): RecentStockings returns the season's rows
 * statewide. Frederick has marquee stocked waters — Carroll Creek itself,
 * Cunningham Falls Lake, Owens/Fishing/Friends Creeks, Frank Bentz Pond —
 * and stockings land near-daily during the spring and fall runs. No other
 * local app surfaces this (data audit, new-source #1).
 *
 * Seasonal by design: mid-summer the feed's newest rows are months old and
 * every consumer should render nothing. Fail-soft [] on any trouble.
 */
const API = "https://webapps02.dnr.state.md.us/DNRTroutStockingAPI/api/RecentStockings";

export type TroutStocking = {
  location: string;
  fish: string;
  species: string;
  regulations: string;
  /** ISO date (the feed's ActivityDate, midnight-anchored). */
  date: string;
};

type Raw = {
  LOCATION?: string;
  County?: string;
  NumOfFish?: string;
  Species?: string;
  RegulationDetails?: string;
  ActivityDate?: string;
};

export async function getFrederickStockings(withinDays = 14, now: Date = new Date()): Promise<TroutStocking[]> {
  try {
    const res = await fetch(API, {
      headers: { accept: "application/json" },
      // Stockings post daily in season; 6h keeps us current without
      // leaning on a small state server.
      next: { revalidate: 21_600 },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Raw[];
    if (!Array.isArray(rows)) return [];
    const floor = now.getTime() - withinDays * 86_400_000;
    return rows
      .filter((r) => r.County === "Frederick" && r.LOCATION && r.ActivityDate)
      .map((r) => ({
        location: r.LOCATION!.trim(),
        fish: (r.NumOfFish ?? "").trim(),
        species: (r.Species ?? "").trim(),
        regulations: (r.RegulationDetails ?? "").trim(),
        date: r.ActivityDate!,
      }))
      .filter((r) => {
        const t = Date.parse(r.date);
        return Number.isFinite(t) && t >= floor && t <= now.getTime() + 86_400_000;
      })
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 8);
  } catch {
    return [];
  }
}

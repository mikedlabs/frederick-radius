import { FAIR_DAY_PATH } from "./plan-status";

export const FAIR_LAYOUT_NAVIGATION_EVENT = "fr:fair-layout-navigation";
export const FAIR_BOOTH_SELECTION_HISTORY_KEY = "__radiusFairBoothSelection";

/** A replacement of a directly opened share must not make Close leave the page. */
export function fairBoothSelectionHasBackEntry(currentBooth: string | null, historyState: unknown): boolean {
  return !currentBooth || Boolean(historyState && typeof historyState === "object" &&
    (historyState as Record<string, unknown>)[FAIR_BOOTH_SELECTION_HISTORY_KEY] === true);
}
export type FairLayoutRoute = {
  view: "grounds" | "booths";
  floor: string;
  booth: string | null;
  query: string;
};

export function readFairLayoutRoute(href: string): FairLayoutRoute {
  const params = new URL(href, "https://frederickradius.app").searchParams;
  const floor = params.get("floor") ?? "9566";
  const booth = params.get("booth");
  return {
    view: params.get("layout") === "booths" && !params.has("vendor") && !params.has("meet") ? "booths" : "grounds",
    floor: /^\d{1,8}$/.test(floor) ? floor : "9566",
    booth: booth && /^\d{1,8}:\d{1,16}$/.test(booth) ? booth : null,
    query: (params.get("bq") ?? "").slice(0, 120),
  };
}

/** Keep private visit parameters out of public booth links. */
export function fairBoothShareUrl(origin: string, floor: string, booth: string): string {
  if (!/^\d{1,8}$/.test(floor) || !/^\d{1,8}:\d{1,16}$/.test(booth) || !booth.startsWith(`${floor}:`)) {
    throw new Error("Invalid Fair booth selection.");
  }
  const url = new URL(FAIR_DAY_PATH, origin);
  url.searchParams.set("layout", "booths");
  url.searchParams.set("floor", floor);
  url.searchParams.set("booth", booth);
  url.hash = "fair-map";
  return url.toString();
}

export function clearFairLayoutParams(url: URL): void {
  for (const key of ["layout", "floor", "booth", "bq"]) url.searchParams.delete(key);
}

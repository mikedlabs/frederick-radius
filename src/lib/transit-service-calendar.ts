import { easternDayKey } from "@/lib/tz";

export const COUNTY_TRANSIT_BULLETIN_URL =
  "https://www.frederickcountymd.gov/DocumentCenter/View/376188/102026-November-2026-Monthly-Digest";
export const MARC_HOLIDAY_URL = "https://www.mta.maryland.gov/marc-holiday-service";

const cancellation = {
  kind: "cancelled",
  text: "Frederick County Transit has cancelled all service on Thursday, November 26 and Friday, November 27, 2026.",
} as const;

const saturday = {
  kind: "modified",
  text: "On Saturday, November 28, 2026, Connector buses run a holiday schedule from 7:15 a.m. to 7 p.m. Shuttles follow their regular Saturday schedules.",
} as const;

export const BRUNSWICK_CANCELLATION =
  "The MARC Brunswick Line has no service on November 26 or 27.";

/** Dated rider publications take precedence over conflicting regular GTFS trips. */
export function countyTransitException(day: string | null) {
  if (day === "2026-11-26" || day === "2026-11-27") return cancellation;
  if (day === "2026-11-28") return saturday;
  return null;
}

export function transitBulletinForDisplay(day: string) {
  if (day >= "2026-11-23" && day <= "2026-11-27") {
    return { county: [cancellation.text, saturday.text], rail: BRUNSWICK_CANCELLATION };
  }
  if (day === "2026-11-28") return { county: [saturday.text], rail: null };
  return null;
}

export function brunswickCancelled(day: string | null): boolean {
  return day === "2026-11-26" || day === "2026-11-27";
}

// Exact instants avoid repeated time-zone conversions for large live stop feeds.
const CLOSED_FROM = Date.parse("2026-11-26T00:00:00-05:00");
const SATURDAY = Date.parse("2026-11-28T00:00:00-05:00");
const CONNECTORS_START = Date.parse("2026-11-28T07:15:00-05:00");
const CONNECTORS_END = Date.parse("2026-11-28T19:00:00-05:00");
const SUNDAY = Date.parse("2026-11-29T00:00:00-05:00");

export function countyServiceCancelled(atMs: number, gtfsStartDate?: string | null): boolean {
  return (atMs >= CLOSED_FROM && atMs < SATURDAY) ||
    gtfsStartDate === "20261126" || gtfsStartDate === "20261127";
}

export function countyRidePermitted(atMs: number, shuttle: boolean): boolean {
  if (atMs < CLOSED_FROM || atMs >= SUNDAY) return true;
  if (atMs < SATURDAY) return false;
  return shuttle || (atMs >= CONNECTORS_START && atMs <= CONNECTORS_END);
}

export function requestedHolidayTransitDay(query: string, requestedDate: string | null, now: Date): string | null {
  const today = easternDayKey(now);
  if (!/\bthanksgiving\b/i.test(query)) return requestedDate ?? today;

  const year = query.match(/\b(20\d{2})\b/)?.[1];
  if (year ? year !== "2026" : today < "2026-11-01" || today > "2026-11-28") return null;
  if (/\b(?:saturday|two days) after thanksgiving\b/i.test(query)) return "2026-11-28";
  if (/\b(?:day|friday) after thanksgiving\b/i.test(query)) return "2026-11-27";
  return countyTransitException(requestedDate) ? requestedDate : "2026-11-26";
}

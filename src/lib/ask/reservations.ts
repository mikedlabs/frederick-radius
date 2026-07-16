import type { LngLat } from "@/lib/geo";

const RESERVATION_RE = /\b(?:open\s*table|opentable|reserv(?:e|ed|ing|ation|ations)?|book(?:ing)?(?:\s+(?:a|the))?\s+table|make\s+(?:a\s+)?(?:res|rez|rev))\b/i;
const CLOCK_RE = /\b(?:at|for)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i;

export type ReservationRequest = {
  requested: boolean;
  timeLabel: string | null;
};

export function parseReservationRequest(query: string): ReservationRequest {
  const clock = query.match(CLOCK_RE);
  const hour = clock ? Number(clock[1]) : NaN;
  const minute = clock?.[2] ?? "00";
  const meridiem = clock?.[3]?.toUpperCase().replaceAll(".", "") ?? null;
  const timeLabel = Number.isInteger(hour) && hour >= 1 && hour <= 12 && meridiem
    ? `${hour}:${minute} ${meridiem}`
    : null;

  return {
    requested: RESERVATION_RE.test(query),
    timeLabel,
  };
}

/**
 * Remove booking instructions before local place retrieval. Without this,
 * words such as "open", "table", "make", and a clock time become noisy
 * search terms and can outrank the actual food request.
 */
export function cleanReservationSearchQuery(query: string): string {
  return query
    .replace(/\b(?:use|check|try|search|open)?\s*(?:open\s*table|opentable)(?:\s+to)?\b/gi, " ")
    .replace(/\b(?:make|book|reserve)(?:\s+(?:me|us))?\s+(?:a\s+)?(?:reservation|table|res|rez|rev)\b/gi, " ")
    .replace(/\b(?:reservation|reservations|booking)\b/gi, " ")
    .replace(new RegExp(CLOCK_RE.source, "gi"), " ")
    .replace(/\b(?:tonight|this\s+evening)\b/gi, " ")
    .replace(/\b(?:i\s+want|i(?:'d|\s+would)\s+like|can\s+you|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** OpenTable search handoff. Live availability and booking stay on OpenTable. */
export function openTableSearchUrl(query: string, origin?: LngLat | null): string {
  const center = origin ?? { lng: -77.4105, lat: 39.4143 };
  const params = new URLSearchParams({
    term: query || "restaurants Frederick MD",
    covers: "2",
    latitude: String(center.lat),
    longitude: String(center.lng),
  });
  return `https://www.opentable.com/s?${params.toString()}`;
}

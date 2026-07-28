import type { LngLat } from "@/lib/geo";
import { parseAskDateTime } from "@/lib/ask/time";

const RESERVATION_RE = /\b(?:open\s*table|opentable|reserv(?:e|ed|ing|ation|ations)?|book(?:ing)?(?:\s+(?:a|the))?\s+table|make\s+(?:a\s+)?(?:res|rez|rev))\b/i;
const CLOCK_RE = /\b(?:at|for|around|by)\s*\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i;

export type ReservationRequest = {
  requested: boolean;
  timeLabel: string | null;
  dateKey: string | null;
  dateLabel: string | null;
  dateTime: string | null;
  partySize: number | null;
};

export function parseReservationRequest(query: string, now = new Date()): ReservationRequest {
  const parsed = parseAskDateTime(query, now);
  const partyMatch = query.match(
    /\b(?:party\s+of|table\s+for|reservation\s+for)\s+(\d{1,2})\b|\bfor\s+(\d{1,2})\s+(?:people|persons?|guests?|adults?)\b/i,
  );
  const partySize = Number(partyMatch?.[1] ?? partyMatch?.[2] ?? NaN);

  return {
    requested: RESERVATION_RE.test(query),
    timeLabel: parsed.timeLabel,
    dateKey: parsed.dateKey,
    dateLabel: parsed.dateLabel,
    dateTime: parsed.instant?.toISOString() ?? null,
    partySize: Number.isInteger(partySize) && partySize >= 1 && partySize <= 20 ? partySize : null,
  };
}

/**
 * Remove booking instructions before local place retrieval. Without this,
 * words such as "open", "table", "make", and a clock time become noisy
 * search terms and can outrank the actual food request.
 */
export function cleanReservationSearchQuery(query: string): string {
  return query
    .replace(
      /\b(?:can\s+you\s+|please\s+)?(?:book|reserve)\s+(?:it|one|that)(?:\s+(?:on|through|with))?\s*(?:open\s*table|opentable)?\b/gi,
      " ",
    )
    .replace(/\b(?:use|check|try|search|open)?\s*(?:open\s*table|opentable)(?:\s+to)?\b/gi, " ")
    .replace(/\b(?:make|book|reserve)(?:\s+(?:me|us))?\s+(?:a\s+)?(?:reservation|table|res|rez|rev)\b/gi, " ")
    .replace(/\b(?:reservation|reservations|booking)\b/gi, " ")
    .replace(new RegExp(CLOCK_RE.source, "gi"), " ")
    .replace(/\b(?:party\s+of|table\s+for|for)\s+\d{1,2}\s*(?:people|persons?|guests?|adults?)?\b/gi, " ")
    .replace(/\b(?:today|tonight|tomorrow|this\s+(?:morning|afternoon|evening))\b/gi, " ")
    .replace(/\b(?:this\s+|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, " ")
    .replace(/\b(?:i\s+want|i(?:'d|\s+would)\s+like|can\s+you|please)\b/gi, " ")
    .replace(/^\s*(?:and|then|so)\b|\b(?:and|then|so)\b\s*$/gi, " ")
    .replace(/[,.!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type OpenTableSearchOptions = {
  dateKey?: string | null;
  timeLabel?: string | null;
  partySize?: number | null;
};

/** OpenTable search handoff. Live availability and booking stay on OpenTable. */
export function openTableSearchUrl(
  query: string,
  origin?: LngLat | null,
  options: OpenTableSearchOptions = {},
): string {
  const center = origin ?? { lng: -77.4105, lat: 39.4143 };
  const params = new URLSearchParams({
    term: query || "restaurants Frederick MD",
    covers: String(options.partySize ?? 2),
    latitude: String(center.lat),
    longitude: String(center.lng),
  });
  if (options.dateKey && options.timeLabel) {
    const match = options.timeLabel.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
    if (match) {
      const raw = Number(match[1]);
      const hour = raw % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
      params.set("dateTime", `${options.dateKey}T${String(hour).padStart(2, "0")}:${match[2]}:00`);
    }
  }
  return `https://www.opentable.com/s?${params.toString()}`;
}

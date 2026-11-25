import type { EventWithMeta } from "@/lib/loaders/events";

export const FROSTY_FRIDAY = {
  slug: "frosty-friday-2026-11-27",
  startsAt: "2026-11-27T14:00:00.000Z",
  title: "Frosty Friday",
  url: "https://downtownfrederick.org/frostyfriday/",
  endsAt: "2026-11-28T02:00:00.000Z",
} as const;

// The syndicated Nov 27 listing gave a one-hour end. The venue publishes 8–10 PM Eastern.
export const TENTH_WARD_CONCERT = {
  slug: "live-music-at-tenth-ward-distilling-co-2026-11-27",
  title: "Live Music with the Brahman Noodles",
  url: "https://www.tenthwarddistilling.com/event/live-music-with-the-brahman-noodles/",
  syndicatedUrl: "https://downtownfrederick.org/vm-event/like-music-at-tenth-ward-distilling-co_2026-11-27-20-00/",
  startsAt: "2026-11-28T01:00:00.000Z",
  endsAt: "2026-11-28T03:00:00.000Z",
} as const;

export function isTenthWardConcert(event: Pick<EventWithMeta, "starts_at" | "source_url">): boolean {
  return Date.parse(event.starts_at) === Date.parse(TENTH_WARD_CONCERT.startsAt)
    && (event.source_url === TENTH_WARD_CONCERT.syndicatedUrl || event.source_url === TENTH_WARD_CONCERT.url);
}

export function applyVenueTimeCorrection(event: EventWithMeta): EventWithMeta {
  if (!isTenthWardConcert(event) || Date.parse(event.ends_at) !== Date.parse("2026-11-28T02:00:00Z")) return event;
  return { ...event, title: TENTH_WARD_CONCERT.title, ends_at: TENTH_WARD_CONCERT.endsAt, source_url: TENTH_WARD_CONCERT.url };
}

export type HolidayPickStatus = "unconfirmed" | "scheduled" | "withdrawn";
export type HolidayGuideStatus = Record<string, HolidayPickStatus>;

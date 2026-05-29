import RAW from "@/data/venue-events.json" with { type: "json" };

/**
 * Venue events — produced by the extraction agent
 * (scripts/ingest-venue-events.ts) for venues whose lineups live only on
 * their own site (The Banyan, The Derby, Sky Stage…). Read side: feeds
 * the events surfaces + the "ask Frederick" answer engine. Each row
 * carries source + fetchedAt so the UI can show provenance + freshness.
 * Starts empty; never fabricated.
 */

export type VenueEvent = {
  title: string;
  starts_at: string;
  ends_at?: string;
  description?: string;
  price?: string;
  ticket_url?: string;
  venue_slug: string;
  venue_name: string;
  category?: string;
  source: { url: string; fetchedAt: string };
};

const DATA = RAW as unknown as VenueEvent[];

/** All ingested venue events. */
export function venueEvents(): VenueEvent[] {
  return DATA;
}

/** Future venue events, soonest first. */
export function upcomingVenueEvents(now: Date = new Date()): VenueEvent[] {
  const t = now.getTime();
  return DATA.filter((e) => {
    const ms = Date.parse(e.starts_at);
    return Number.isFinite(ms) && ms >= t - 3_600_000;
  }).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/**
 * Eventbrite organizer registry (data brief, Phase 4, item 4).
 *
 * Public event SEARCH on Eventbrite was retired in 2020, but the
 * organizer and venue endpoints still work. The product's path is a
 * curated config of Frederick organizers (farms, breweries, nonprofits,
 * venues) whose events we poll directly. This file IS that table.
 *
 * It ships empty on purpose: organizer ids are owner-curated human work
 * (Phase 4 is parallel), and inventing ids would fabricate sources. Add
 * entries here and, with EVENTBRITE_TOKEN set, the adapter starts
 * polling them on the next deploy. Find an id from an organizer's
 * Eventbrite page (eventbrite.com/o/<name>-<id>) or the org's API.
 *
 * Keep the list to roughly 20 to 30 active Frederick organizers, per the
 * brief. Each entry's `label` is for the admin board only; the adapter
 * keys off `id`.
 */

export type EventbriteOrganizer = {
  /** The numeric organizer id from the organizer's Eventbrite URL. */
  id: string;
  /** Human label for the data-health board. */
  label: string;
};

export const EVENTBRITE_ORGANIZERS: EventbriteOrganizer[] = [
  // The Frederick Center — the county's LGBTQ+ community hub. Their ticketed
  // fundraisers (drag bingo at partner breweries, Pride events) publish on
  // Eventbrite; the id is from eventbrite.com/o/7792694675 (verified via the
  // "Beach, Please! Drag Bingo" listing, Jul 2026). Their non-ticketed
  // programming comes in via config/venue-sources.json instead.
  { id: "7792694675", label: "The Frederick Center" },
];

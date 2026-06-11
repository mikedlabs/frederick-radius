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
  // Example shape (commented, not polled):
  // { id: "1234567890", label: "Some Frederick Brewery" },
];

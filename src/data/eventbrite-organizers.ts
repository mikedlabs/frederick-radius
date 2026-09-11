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

  // Fetch-verified 2026-07-12 (data sweep). Each id was confirmed off the
  // organizer's Eventbrite discovery slug with real upcoming Frederick MD
  // events. These stay inert until EVENTBRITE_TOKEN is set, then poll live.
  // Highest-volume first:
  { id: "23372239397", label: "Rockwell Brewery" }, // ~15 upcoming: live music at the Riverside taproom
  { id: "8484127057", label: "FAC's Sky Stage" }, // Frederick Arts Council's open-air venue, summer concert series
  { id: "38476008843", label: "Next Stop Comedy (Steinhardt Brewing)" }, // recurring monthly stand-up downtown
  { id: "121464436672", label: "Promo Circus" }, // local producer of charity/community events (Frederick Feud)
  { id: "3482068041", label: "Downtown Frederick Partnership" }, // confirm-with-token
  { id: "33442321971", label: "Heritage Frederick" }, // Historical Society; confirm-with-token
  { id: "8484125043", label: "Frederick Arts Council" }, // parent org; confirm-with-token
  { id: "29278930821", label: "Curious Iguana" }, // downtown independent bookstore author events; confirm-with-token
  // FCPL's Eventbrite (27209956677) is deliberately OMITTED — the library's
  // flagship LibraryCalendar iCal already covers its programs; adding the
  // Eventbrite channel would double-count.
];

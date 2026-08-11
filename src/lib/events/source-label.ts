import type { Event } from "@/data/events";

/**
 * Human names for the event adapters that survive into the normalized Event
 * contract. Keep this at the source boundary so compact clients do not need to
 * ship or recreate the full feed registry just to explain one event.
 */
const EVENT_SOURCE_LABELS: Record<Event["source"], string> = {
  seed: "Frederick Radius editorial",
  manual: "Frederick Radius editorial",
  dfp: "Downtown Frederick Partnership",
  celebrate: "Celebrate Frederick",
  county: "Frederick County Government",
  hood: "Hood College",
  "visit-frederick": "Visit Frederick",
  weinberg: "Weinberg Center for the Arts",
  delaplaine: "Delaplaine Arts Center",
  fcpl: "Frederick County Public Libraries",
  fcvfra: "Frederick County Volunteer Fire & Rescue Association",
  "city-frederick": "City of Frederick",
  fair: "The Great Frederick Fair",
  "mount-airy": "Town of Mount Airy",
  thurmont: "Town of Thurmont",
  parks: "Frederick County Parks & Recreation",
  "heritage-frederick": "Heritage Frederick",
  monocacy: "Monocacy Brewing",
  msd: "Maryland School for the Deaf",
  mdcc: "Maryland Deaf Community Center",
  "mount-st-marys": "Mount St. Mary's University",
  isf: "Islamic Society of Frederick",
  elc: "Evangelical Lutheran Church",
  "civil-war-med": "National Museum of Civil War Medicine",
  "maryland-ensemble": "Maryland Ensemble Theatre",
  catoctin: "Catoctin Land Trust",
  fcc: "Frederick Community College",
  ticketmaster: "Ticketmaster",
  bandsintown: "Bandsintown",
  seatgeek: "SeatGeek",
  eventbrite: "Eventbrite",
  "venue-extract": "Official venue page",
  "frederick-keys": "Frederick Keys",
};

export function eventSourceLabel(
  source: Event["source"],
  organizer?: string | null,
): string {
  if (source === "venue-extract") {
    const venue = organizer?.replace(/\s+/g, " ").trim();
    if (venue) return venue.slice(0, 120);
  }
  return EVENT_SOURCE_LABELS[source];
}

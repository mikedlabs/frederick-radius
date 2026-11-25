import { feedStatuses } from "@/lib/integrations/feed-registry";

export type TicketingSources = {
  ticketmaster: boolean;
  bandsintown: boolean;
  seatgeek: boolean;
  eventbrite: boolean;
};

/** Which ticketing sources are switched on, read from the feed registry so
 * this page and the admin feed list cannot disagree. These four are every
 * keyed feed that can add rows to the board. Configuration only: a
 * configured source can still be down. */
export function ticketingSourcesOn(): TicketingSources {
  const { keyed } = feedStatuses();
  const on = (name: string) => keyed.some((feed) => feed.name === name && feed.configured);
  return {
    ticketmaster: on("Ticketmaster"),
    bandsintown: on("Bandsintown"),
    seatgeek: on("SeatGeek"),
    eventbrite: on("Eventbrite"),
  };
}

/**
 * The sentence under the Events board that says where listings come from.
 *
 * It names a ticketing source only while that source is switched on, and it
 * covers every one that can add rows: Ticketmaster, Bandsintown, SeatGeek
 * and Eventbrite. The
 * footer used to be fixed text that credited Ticketmaster and Bandsintown
 * while neither was configured in production (Nov 9, 2026), and it left out
 * the publishers that supplied the board that day: the library, Downtown
 * Frederick Partnership, the colleges and the venue calendars.
 */
export function eventSourceStatement({
  ticketmaster,
  bandsintown,
  seatgeek,
  eventbrite,
}: TicketingSources): string {
  const sentences = [
    "Event listings come from Frederick County Public Libraries, Downtown Frederick Partnership, Celebrate Frederick, county and municipal calendars, local colleges, community organizations, and venue calendars such as the Weinberg Center.",
  ];
  if (ticketmaster) {
    sentences.push("Ticketmaster adds ticketed concerts and Frederick Keys home games.");
  }
  if (bandsintown) {
    sentences.push("Bandsintown adds touring dates for tracked artists.");
  }
  if (seatgeek) {
    sentences.push("SeatGeek adds ticketed concerts and shows.");
  }
  if (eventbrite) {
    sentences.push("Eventbrite adds events from a reviewed list of organizers.");
  }
  sentences.push("Live feeds are checked about every 15 minutes.");
  return sentences.join(" ");
}

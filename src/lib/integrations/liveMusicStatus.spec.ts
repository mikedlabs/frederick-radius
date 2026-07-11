import { describe, expect, it } from "vitest";
import { normalizeTicketmaster } from "@/lib/integrations/ticketmaster";
import { normalizeBandsintown } from "@/lib/integrations/bandsintown";

/**
 * UX-11: the cancelled/postponed lane must cover EVERY feed, not just
 * iCal. These lock the Ticketmaster/Bandsintown status derivation:
 * structured status code first, title sniff fallback, marker stripped
 * from the display title once status carries the meaning.
 */

const tmEvent = (over: Record<string, unknown> = {}) => ({
  _embedded: {
    events: [
      {
        id: "abc1",
        name: "Silent Disco at the Creek",
        url: "https://tm.example/e/abc1",
        dates: { start: { dateTime: "2026-08-01T23:00:00Z" } },
        _embedded: {
          venues: [
            {
              name: "Carroll Creek Amphitheater",
              city: { name: "Frederick" },
              location: { latitude: "39.4143", longitude: "-77.4105" },
            },
          ],
        },
        ...over,
      },
    ],
  },
});

describe("ticketmaster status lane", () => {
  it("defaults to scheduled", () => {
    const [ev] = normalizeTicketmaster(tmEvent());
    expect(ev.status).toBe("scheduled");
  });

  it("trusts the structured cancelled code", () => {
    const [ev] = normalizeTicketmaster(
      tmEvent({ dates: { start: { dateTime: "2026-08-01T23:00:00Z" }, status: { code: "cancelled" } } }),
    );
    expect(ev.status).toBe("cancelled");
  });

  it("maps postponed but keeps rescheduled on the calendar", () => {
    const postponed = normalizeTicketmaster(
      tmEvent({ dates: { start: { dateTime: "2026-08-01T23:00:00Z" }, status: { code: "postponed" } } }),
    )[0];
    expect(postponed.status).toBe("postponed");
    // "rescheduled" means dates.start already holds the NEW date — the
    // show is on; killing its actions would be the opposite mistake.
    const rescheduled = normalizeTicketmaster(
      tmEvent({ dates: { start: { dateTime: "2026-08-01T23:00:00Z" }, status: { code: "rescheduled" } } }),
    )[0];
    expect(rescheduled.status).toBe("scheduled");
  });

  it("falls back to the title sniff and strips the marker", () => {
    const [ev] = normalizeTicketmaster(tmEvent({ name: "CANCELLED: Silent Disco at the Creek" }));
    expect(ev.status).toBe("cancelled");
    expect(ev.title).toBe("Silent Disco at the Creek");
  });
});

describe("bandsintown status lane", () => {
  const bitEvent = (over: Record<string, unknown> = {}) => [
    {
      id: "77",
      url: "https://bit.example/e/77",
      datetime: "2026-08-01T20:00:00",
      venue: { name: "Cafe 611", latitude: 39.4143, longitude: -77.4105, city: "Frederick" },
      ...over,
    },
  ];

  it("defaults to scheduled and shows the curated artist name", () => {
    const [ev] = normalizeBandsintown(bitEvent(), "The Plate Scrapers");
    expect(ev.status).toBe("scheduled");
    expect(ev.title).toBe("The Plate Scrapers");
  });

  it("sniffs the feed-side title for a cancellation", () => {
    const [ev] = normalizeBandsintown(bitEvent({ title: "POSTPONED - new date TBA" }), "The Plate Scrapers");
    expect(ev.status).toBe("postponed");
    // Display title is the artist, so nothing to strip.
    expect(ev.title).toBe("The Plate Scrapers");
  });
});

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventWithMeta } from "@/lib/loaders/events";
import KeysHomeGames from "@/components/sports/KeysHomeGames";
import { isKeysEvent, isKeysHomeGame, keysOpponent, keysTicketUrl, KEYS_TICKETS_URL } from "./keysEvent";

describe("isKeysEvent — recognizes Keys and stadium-related events", () => {
  it("matches on the Stats-API source", () => {
    expect(isKeysEvent({ source: "frederick-keys", title: "Anything", venue_name: null })).toBe(true);
  });

  it("matches on the Nymeo Field / Harry Grove venue, however spelled", () => {
    expect(isKeysEvent({ venue_name: "Nymeo Field at Harry Grove Stadium" })).toBe(true);
    expect(isKeysEvent({ venue_name: "Harry Grove Stadium" })).toBe(true);
    expect(isKeysEvent({ venue_name: "harry  grove" })).toBe(true);
  });

  it("matches on a Keys title from either feed", () => {
    expect(isKeysEvent({ title: "Frederick Keys vs. Brooklyn Cyclones" })).toBe(true);
    expect(isKeysEvent({ title: "Keys vs Wilmington Blue Rocks" })).toBe(true);
  });

  it("does NOT match a non-Keys event at another venue", () => {
    expect(isKeysEvent({ title: "Alive @ Five", venue_name: "Carroll Creek Amphitheater", source: "ical" })).toBe(false);
    expect(isKeysEvent({ title: "Locksmith key workshop", venue_name: "The Maker Space" })).toBe(false);
  });

  it("is null-safe", () => {
    expect(isKeysEvent(null)).toBe(false);
    expect(isKeysEvent(undefined)).toBe(false);
    expect(isKeysEvent({})).toBe(false);
  });
});

describe("keysOpponent — parses the opponent from either side of the matchup", () => {
  it("pulls the opponent when the Keys lead", () => {
    expect(keysOpponent("Frederick Keys vs. Brooklyn Cyclones")).toBe("Brooklyn Cyclones");
  });

  it("pulls the opponent when the Keys trail", () => {
    expect(keysOpponent("Brooklyn Cyclones vs Frederick Keys")).toBe("Brooklyn Cyclones");
  });

  it("handles 'vs' without a period", () => {
    expect(keysOpponent("Keys vs Wilmington Blue Rocks")).toBe("Wilmington Blue Rocks");
  });

  it("returns null for a non-matchup title", () => {
    expect(keysOpponent("Frederick Keys Fireworks Night")).toBeNull();
    expect(keysOpponent("")).toBeNull();
    expect(keysOpponent(null)).toBeNull();
  });
});

describe("keysTicketUrl", () => {
  it("prefers a curated ticket_url", () => {
    expect(
      keysTicketUrl({ ticket_url: "https://example.test/game", source_url: "https://www.ticketmaster.com/x" }),
    ).toBe("https://example.test/game");
  });

  it("uses the row's Ticketmaster event page when there is no ticket_url", () => {
    expect(keysTicketUrl({ source_url: "https://www.ticketmaster.com/frederick-keys-tickets/123" })).toBe(
      "https://www.ticketmaster.com/frederick-keys-tickets/123",
    );
  });

  it("falls back to the box office for schedule-feed rows", () => {
    expect(keysTicketUrl({ source_url: "https://www.milb.com/frederick/schedule" })).toBe(KEYS_TICKETS_URL);
    expect(keysTicketUrl({})).toBe(KEYS_TICKETS_URL);
  });
});


const HOME_VENUE = "Nymeo Field at Harry Grove Stadium";

describe("isKeysHomeGame — requires actual baseball home-game evidence", () => {
  it("rejects the observed Construction Career Days listing without changing broad stadium discovery", () => {
    const event = { title: "2026 Construction Career Days", venue_name: HOME_VENUE, source: "ticketmaster" };
    expect(isKeysEvent(event)).toBe(true);
    expect(isKeysHomeGame(event)).toBe(false);
  });

  it("accepts actual home matchups, including a promotion attached to a matchup", () => {
    for (const title of [
      "Frederick Keys vs. Brooklyn Cyclones",
      "Keys vs Wilmington Blue Rocks",
      "Brooklyn Cyclones vs Frederick Keys",
      "Frederick Keys vs. Salem Red Sox - Postgame Concert",
    ]) {
      expect(isKeysHomeGame({ title, venue_name: HOME_VENUE })).toBe(true);
    }
  });

  it("preserves promotion-titled games verified by the home-only schedule source or explicit game description", () => {
    expect(isKeysHomeGame({ title: "Fireworks Night", source: "frederick-keys" })).toBe(true);
    expect(isKeysHomeGame({
      title: "Fireworks Night", venue_name: HOME_VENUE,
      description: "The Frederick Keys play a home game with fireworks after the final out.",
    })).toBe(true);
    expect(isKeysHomeGame({ title: "Frederick Keys Fireworks Night", venue_name: HOME_VENUE }))
      .toBe(false);
  });

  it.each([
    "2026 Construction Career Days", "Frederick Keys Concert", "Frederick Keys Baseball Camp",
    "Frederick Keys Stadium Tour", "Frederick Keys Fan Fest", "Frederick Keys vs. Salem Watch Party",
  ])("keeps %s out of the home-game list", (title) => {
    expect(isKeysHomeGame({ title, venue_name: HOME_VENUE, source: "ticketmaster" })).toBe(false);
  });

  it("does not turn an away matchup or an unknown venue into a home game", () => {
    expect(isKeysHomeGame({ title: "Frederick Keys at Brooklyn Cyclones", venue_name: "Maimonides Park" })).toBe(false);
    expect(isKeysHomeGame({ title: "Brooklyn Cyclones vs Frederick Keys", venue_name: "Maimonides Park" })).toBe(false);
    expect(isKeysHomeGame({ title: "Frederick Keys vs. Brooklyn Cyclones" })).toBe(false);
  });

  it("fails closed on missing or ambiguous game evidence", () => {
    expect(isKeysHomeGame(null)).toBe(false);
    expect(isKeysHomeGame(undefined)).toBe(false);
    expect(isKeysHomeGame({ venue_name: HOME_VENUE })).toBe(false);
    expect(isKeysHomeGame({ title: "A baseball game", venue_name: HOME_VENUE })).toBe(false);
  });
});

function gameFixture(patch: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "frederick-keys-vs-brooklyn-2027-06-01",
    title: "Frederick Keys vs. Brooklyn Cyclones",
    description: "",
    starts_at: "2027-06-01T23:00:00.000Z",
    ends_at: "2027-06-02T02:00:00.000Z",
    timezone: "America/New_York",
    venue_name: HOME_VENUE,
    address: "21 Stadium Dr, Frederick, MD",
    geom: { lng: -77.4179, lat: 39.408 },
    municipality: "frederick",
    category: "sports",
    audience: [],
    is_free: false,
    source: "ticketmaster",
    is_verified: true,
    source_id: "fixture-game",
    source_url: "https://www.ticketmaster.com/fixture-game",
    license: "Fixture only",
    confidence: "verified",
    first_seen_at: "2027-05-01T12:00:00.000Z",
    last_verified_at: "2027-05-01T12:00:00.000Z",
    geo_confidence: "exact_address",
    category_name: "Sports",
    municipality_name: "Frederick",
    ...patch,
  };
}

function homeGamesMarkup(events: EventWithMeta[], degraded = false) {
  return KeysHomeGames({
    eventsPromise: Promise.resolve({
      unified: events,
      publicEvents: events.filter((event) => !event.status || event.status === "scheduled"),
      sourceHealth: { degraded, unavailable: degraded ? ["fixture-feed"] : [] },
    }),
    now: new Date("2027-05-31T12:00:00.000Z"),
  }).then(renderToStaticMarkup);
}

describe("Keys home-games section", () => {
  const careerDay = gameFixture({
    slug: "2026-construction-career-days",
    title: "2026 Construction Career Days",
    starts_at: "2027-06-01T11:00:00.000Z",
    ends_at: "2027-06-01T17:00:00.000Z",
  });

  it("renders only the actual game, never the career fair as a 7 AM first pitch or game-ticket target", async () => {
    const events = [careerDay, gameFixture()];
    const html = await homeGamesMarkup(events);
    expect(html).not.toContain("Construction Career Days");
    expect(html).not.toContain("7:00 AM");
    expect(html).not.toContain(`/events/${careerDay.slug}`);
    expect(html).toContain("vs Brooklyn Cyclones");
    expect(html).toContain("First pitch 7:00 PM");
    expect(html.match(/aria-label="Get tickets for /g)).toHaveLength(1);
    expect(events).toHaveLength(2);
    expect(events[0]).toBe(careerDay);
  });

  it.each(["cancelled", "postponed"] as const)("retains the actual %s game from the full assembly", async (status) => {
    const html = await homeGamesMarkup([careerDay, gameFixture({ status })]);
    expect(html).toContain(status === "cancelled" ? "Cancelled. Check the official schedule." : "Postponed. Check the official schedule.");
    expect(html).toContain("vs Brooklyn Cyclones");
    expect(html).not.toContain("First pitch");
    expect(html).not.toContain("Construction Career Days");
  });

  it.each([false, true])("keeps an honest no-game fallback when source degraded is %s", async (degraded) => {
    const html = await homeGamesMarkup([careerDay], degraded);
    expect(html).toContain(degraded ? "The schedule feed is catching up." : "No upcoming home games are on the schedule right now.");
    expect(html).toContain("See the Keys schedule");
    expect(html).not.toContain("First pitch");
    expect(html).not.toContain("Get tickets");
  });
});

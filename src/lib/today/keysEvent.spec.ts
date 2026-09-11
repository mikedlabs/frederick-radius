import { describe, it, expect } from "vitest";
import { isKeysEvent, keysOpponent, keysTicketUrl, KEYS_TICKETS_URL } from "./keysEvent";

describe("isKeysEvent — recognizes Frederick Keys home games", () => {
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

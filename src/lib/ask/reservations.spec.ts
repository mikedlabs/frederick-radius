import { describe, expect, it } from "vitest";
import { cleanReservationSearchQuery, openTableSearchUrl, parseReservationRequest } from "./reservations";

describe("reservation requests", () => {
  it("recognizes natural shorthand and extracts a readable time", () => {
    expect(parseReservationRequest("use OpenTable to make a rev for 7:30pm tonight")).toMatchObject({
      requested: true,
      timeLabel: "7:30 PM",
    });
  });

  it("keeps the meal request while removing booking noise", () => {
    expect(cleanReservationSearchQuery("i want a steak dinner tonight use open table to make a rev for 7:30pm tonight"))
      .toBe("a steak dinner");
  });

  it("does not send a dangling connector to OpenTable", () => {
    expect(cleanReservationSearchQuery("I want a steak dinner tonight and use OpenTable for 7:30 PM"))
      .toBe("a steak dinner");
  });

  it("removes a natural book-it-on-OpenTable instruction and punctuation", () => {
    expect(
      cleanReservationSearchQuery(
        "I want a steak dinner tonight at 7:30. Can you book it on OpenTable?",
      ),
    ).toBe("a steak dinner");
  });

  it("builds a location-aware handoff without claiming live availability", () => {
    const url = new URL(openTableSearchUrl("a steak dinner", { lng: -77.4109, lat: 39.4137 }));
    expect(url.hostname).toBe("www.opentable.com");
    expect(url.pathname).toBe("/s");
    expect(url.searchParams.get("term")).toBe("a steak dinner");
    expect(url.searchParams.get("latitude")).toBe("39.4137");
    expect(url.searchParams.get("longitude")).toBe("-77.4109");
  });

  it("captures date, time, and party size for a booking handoff", () => {
    const now = new Date("2026-07-18T18:00:00.000Z");
    const request = parseReservationRequest(
      "Book a table for 4 tomorrow at 7:30 PM",
      now,
    );
    expect(request).toMatchObject({
      requested: true,
      dateKey: "2026-07-19",
      timeLabel: "7:30 PM",
      partySize: 4,
    });
    const url = new URL(openTableSearchUrl("steak dinner", null, request));
    expect(url.searchParams.get("covers")).toBe("4");
    expect(url.searchParams.get("dateTime")).toBe("2026-07-19T19:30:00");
  });
});

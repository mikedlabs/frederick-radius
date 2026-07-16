import { describe, expect, it } from "vitest";
import { cleanReservationSearchQuery, openTableSearchUrl, parseReservationRequest } from "./reservations";

describe("reservation requests", () => {
  it("recognizes natural shorthand and extracts a readable time", () => {
    expect(parseReservationRequest("use OpenTable to make a rev for 7:30pm tonight")).toEqual({
      requested: true,
      timeLabel: "7:30 PM",
    });
  });

  it("keeps the meal request while removing booking noise", () => {
    expect(cleanReservationSearchQuery("i want a steak dinner tonight use open table to make a rev for 7:30pm tonight"))
      .toBe("a steak dinner");
  });

  it("builds a location-aware handoff without claiming live availability", () => {
    const url = new URL(openTableSearchUrl("a steak dinner", { lng: -77.4109, lat: 39.4137 }));
    expect(url.hostname).toBe("www.opentable.com");
    expect(url.pathname).toBe("/s");
    expect(url.searchParams.get("term")).toBe("a steak dinner");
    expect(url.searchParams.get("latitude")).toBe("39.4137");
    expect(url.searchParams.get("longitude")).toBe("-77.4109");
  });
});

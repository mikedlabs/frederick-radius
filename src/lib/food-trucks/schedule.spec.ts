import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFoodTruckSchedule,
  matchFoodTruckSlug,
  parseCelebrateFrederickSchedule,
  parseGrilledCheesePleaseSchedule,
  parseMonocacyBrewingSchedule,
  parseSpringfieldManorSchedule,
  parseSteinhardtSchedule,
} from "./schedule";

describe("food-truck schedule sources", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the official Celebrate Frederick date and vendor links", () => {
    const html = `
      <table>
        <tr><th>Date</th><th>Vendor 1</th><th>Vendor 2</th><th>Vendor 3</th></tr>
        <tr>
          <td><strong>July 26, 2026</strong></td>
          <td><a href="https://snow.example/">Snowball Waterfalls</a></td>
          <td><a href="https://taco.example/?a=1&amp;b=2">Taco Joint Food Truck</a></td>
          <td><a href="https://in10sebbq.com">In10se BBQ</a></td>
        </tr>
      </table>`;

    const stops = parseCelebrateFrederickSchedule(html);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      sourceId: "celebrate-frederick",
      startsAt: "2026-07-26T23:00:00.000Z",
      endsAt: "2026-07-27T00:30:00.000Z",
      venueName: "Baker Park Bandshell",
      venuePlaceSlug: "baker-park-bandshell",
      lat: 39.4162082,
      lng: -77.4152966,
      confidence: "organizer",
    });
    expect(stops[0].vendors.map((vendor) => vendor.name)).toEqual([
      "Snowball Waterfalls",
      "Taco Joint Food Truck",
      "In10se BBQ",
    ]);
    expect(stops[0].vendors[2].slug).toBe("in10se-bbq");
    expect(stops[0].vendors[1].url).toBe("https://taco.example/?a=1&b=2");
  });

  it("parses Springfield Manor's all-day entries and time prefix", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Springfield Manor//Calendar//EN",
      "BEGIN:VEVENT",
      "UID:bbq-tech-20260724",
      "DTSTAMP:20260701T120000Z",
      "DTSTART;VALUE=DATE:20260724",
      "SUMMARY:5-9 BBQ Tech Food Truck",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:three-daughters-20260726",
      "DTSTAMP:20260701T120000Z",
      "DTSTART;VALUE=DATE:20260726",
      "SUMMARY:12-6 Three Daughters Truck",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const stops = parseSpringfieldManorSchedule(ics);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({
      sourceId: "springfield-manor",
      startsAt: "2026-07-24T21:00:00.000Z",
      endsAt: "2026-07-25T01:00:00.000Z",
      municipality: "Thurmont",
      venuePlaceSlug: "springfield-manor-thurmont",
      lat: 39.5589667,
      lng: -77.4346912,
    });
    expect(stops[1].vendors[0]).toMatchObject({
      name: "Three Daughters",
      slug: "three-daughters",
    });
  });

  it("keeps a vendor-owned calendar entry tied to its published location", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Grilled Cheese Please//Calendar//EN",
      "BEGIN:VEVENT",
      "UID:gcp-test",
      "DTSTAMP:20260701T120000Z",
      "DTSTART:20260725T160000Z",
      "DTEND:20260725T200000Z",
      "SUMMARY:Grilled Cheese Please at the market",
      "LOCATION:123 Market St\\, Frederick\\, MD",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const stops = parseGrilledCheesePleaseSchedule(ics);
    expect(stops).toHaveLength(1);
    expect(stops[0].vendors[0].slug).toBe("grilled-cheese-please");
    expect(stops[0].sourceId).toBe("grilled-cheese-please");
    expect(stops[0].venueName).toContain("123 Market St");
  });

  it("parses Steinhardt's food-truck collection without trusting placeholder map coordinates", () => {
    const payload = JSON.stringify({
      upcoming: [
        {
          id: "df26-20260729",
          title: "DF 26 Mexican Food",
          startDate: Date.parse("2026-07-29T18:00:00.000Z"),
          endDate: Date.parse("2026-07-29T22:00:00.000Z"),
          fullUrl: "/food-trucks-1/df-26-mexican-food",
          excerpt: '<p><a href="https://www.facebook.com/df26/">DF 26</a></p>',
          location: {
            markerLat: 40.7207559,
            markerLng: -74.0007613,
          },
        },
        {
          id: "broken",
          title: "Missing date",
        },
      ],
    });

    const stops = parseSteinhardtSchedule(payload);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      sourceId: "steinhardt-brewing",
      title: "DF 26 Mexican Food at Steinhardt Brewing",
      startsAt: "2026-07-29T18:00:00.000Z",
      endsAt: "2026-07-29T22:00:00.000Z",
      venueName: "Steinhardt Brewing Company",
      address: "340 E Patrick St Suite 100-102, Frederick, MD 21701",
      municipality: "Frederick",
      venuePlaceSlug: "steinhardt-brewing-company-frederick",
      lat: 39.4130741,
      lng: -77.403639,
      sourceName: "Steinhardt Brewing Company",
      sourceUrl: "https://www.steinhardtbrewing.com/food-trucks-1/df-26-mexican-food",
      confidence: "venue",
    });
    expect(stops[0].vendors[0]).toMatchObject({
      name: "DF 26 Mexican Food",
      url: "https://www.facebook.com/df26/",
    });
  });

  it("keeps only explicitly named food-truck events from Monocacy's mixed calendar", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Monocacy Brewing Company//Calendar//EN",
      "BEGIN:VEVENT",
      "UID:alley-wagon-20260727",
      "DTSTAMP:20260722T223103Z",
      "DTSTART:20260727T200000Z",
      "DTEND:20260728T000000Z",
      "SUMMARY:Mon/Tues Food Truck: The Alley Wagon",
      "LOCATION:MD",
      "CATEGORIES:Food Trucks",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:trivia-20260729",
      "DTSTAMP:20260722T223103Z",
      "DTSTART:20260729T230000Z",
      "DTEND:20260730T010000Z",
      "SUMMARY:Trivia Night",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const stops = parseMonocacyBrewingSchedule(ics);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      sourceId: "monocacy-brewing",
      title: "The Alley Wagon at Monocacy Brewing",
      startsAt: "2026-07-27T20:00:00.000Z",
      endsAt: "2026-07-28T00:00:00.000Z",
      venueName: "Monocacy Brewing Company",
      address: "1781 N Market St, Frederick, MD 21701",
      venuePlaceSlug: "monocacy-brewing-frederick",
      lat: 39.4402298,
      lng: -77.398855,
      sourceName: "Monocacy Brewing Company",
      sourceUrl: "https://monocacybrewing.com/events/",
      confidence: "venue",
    });
    expect(stops[0].vendors[0]).toMatchObject({
      name: "The Alley Wagon",
      slug: "the-alley-wagon",
    });
  });

  it("fails closed on malformed Steinhardt data and vague Monocacy events", () => {
    expect(parseSteinhardtSchedule("not json")).toEqual([]);
    expect(parseSteinhardtSchedule(JSON.stringify({ upcoming: "not an array" }))).toEqual([]);
    expect(parseMonocacyBrewingSchedule([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:vague-food-truck-event",
      "DTSTART:20260727T200000Z",
      "SUMMARY:Food Truck:",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"))).toEqual([]);
  });

  it("reports the two official feeds independently in source health", async () => {
    const steinhardt = JSON.stringify({
      upcoming: [{
        id: "three-daughters-20260729",
        title: "Three Daughters",
        startDate: Date.parse("2026-07-29T18:00:00.000Z"),
        endDate: Date.parse("2026-07-29T22:00:00.000Z"),
      }],
    });
    const monocacy = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:alley-wagon-20260730",
      "DTSTAMP:20260722T223103Z",
      "DTSTART:20260730T200000Z",
      "DTEND:20260731T010000Z",
      "SUMMARY:Wed/Thurs Food Truck: The Alley Wagon",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("steinhardtbrewing.com")) return new Response(steinhardt);
      if (url.includes("monocacybrewing.com")) return new Response(monocacy);
      if (url.includes("celebratefrederick.com")) return new Response("<table></table>");
      return new Response("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR");
    });

    const snapshot = await buildFoodTruckSchedule(new Date("2026-07-27T16:00:00.000Z"));
    expect(snapshot.sources.find((source) => source.id === "steinhardt-brewing")).toMatchObject({
      ok: true,
      count: 1,
    });
    expect(snapshot.sources.find((source) => source.id === "monocacy-brewing")).toMatchObject({
      ok: true,
      count: 1,
    });
    expect(snapshot.stops.map((stop) => stop.sourceName)).toEqual([
      "Steinhardt Brewing Company",
      "Monocacy Brewing Company",
    ]);
  });

  it("marks a malformed HTTP 200 payload as a failed source", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("steinhardtbrewing.com")) {
        return new Response(JSON.stringify({ error: "upstream format changed" }));
      }
      if (url.includes("celebratefrederick.com")) {
        return new Response("<table></table>");
      }
      return new Response(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR",
      );
    });

    const snapshot = await buildFoodTruckSchedule(
      new Date("2026-07-27T16:00:00.000Z"),
    );
    expect(
      snapshot.sources.find((source) => source.id === "steinhardt-brewing"),
    ).toMatchObject({
      ok: false,
      count: 0,
      error: "The source returned an unrecognized payload",
    });
  });

  it("does not use loose matching that could attach the wrong business", () => {
    expect(matchFoodTruckSlug("Blues Pizza Food Truck")).toBeUndefined();
    expect(matchFoodTruckSlug("Blues BBQ")).toBe("blues-bbq");
    expect(matchFoodTruckSlug("Three Daughters Truck")).toBe("three-daughters");
    expect(matchFoodTruckSlug("D's Delights Food Truck")).toBe("ds-delights");
    expect(matchFoodTruckSlug("Gravel & Grind")).toBe("gravel-and-grind");
    expect(matchFoodTruckSlug("Bub-B-Que")).toBe("bub-b-que");
  });
});

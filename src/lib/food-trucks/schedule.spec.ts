import { describe, expect, it } from "vitest";
import {
  matchFoodTruckSlug,
  parseCelebrateFrederickSchedule,
  parseGrilledCheesePleaseSchedule,
  parseSpringfieldManorSchedule,
} from "./schedule";

describe("food-truck schedule sources", () => {
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
      startsAt: "2026-07-26T23:00:00.000Z",
      endsAt: "2026-07-27T00:30:00.000Z",
      venueName: "Baker Park Bandshell",
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
      startsAt: "2026-07-24T21:00:00.000Z",
      endsAt: "2026-07-25T01:00:00.000Z",
      municipality: "Thurmont",
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
    expect(stops[0].venueName).toContain("123 Market St");
  });

  it("does not use loose matching that could attach the wrong business", () => {
    expect(matchFoodTruckSlug("Blues Pizza Food Truck")).toBeUndefined();
    expect(matchFoodTruckSlug("Blues BBQ")).toBe("blues-bbq");
    expect(matchFoodTruckSlug("Three Daughters Truck")).toBe("three-daughters");
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizeVenueEventDateTime,
  normalizeVenueEventTimes,
} from "../scripts/lib/venue-event-time";
import venueEvents from "../src/data/venue-events.json";
import venueSourceInventory from "../src/data/venue-event-source-inventory.json";

const WEINBERG_VENUES = new Set(["weinberg-center", "new-spire"]);

describe("venue event time normalization", () => {
  it("attaches the real Eastern offset to naive summer and winter clocks", () => {
    expect(normalizeVenueEventDateTime("2026-08-08T19:30:00")).toBe(
      "2026-08-08T19:30:00-04:00",
    );
    expect(normalizeVenueEventDateTime("2026-12-08T19:30")).toBe(
      "2026-12-08T19:30-05:00",
    );
  });

  it("keeps valid explicit instants and normalizes compact offsets", () => {
    expect(normalizeVenueEventDateTime("2026-08-08T23:30:00Z")).toBe(
      "2026-08-08T23:30:00Z",
    );
    expect(normalizeVenueEventDateTime("2026-08-08 19:30-0400")).toBe(
      "2026-08-08T19:30-04:00",
    );
  });

  it("rejects date-only starts, rolled dates, and impossible DST wall times", () => {
    expect(normalizeVenueEventDateTime("2026-08-08")).toBeNull();
    expect(normalizeVenueEventDateTime("2026-02-30T19:30")).toBeNull();
    expect(normalizeVenueEventDateTime("2026-03-08T02:30")).toBeNull();
    expect(normalizeVenueEventDateTime("2026-13-01T19:30-05:00")).toBeNull();
    expect(
      normalizeVenueEventTimes({ title: "Show", starts_at: "2026-08-08" }),
    ).toBeNull();
  });

  it("drops an invalid optional end without discarding a valid start", () => {
    expect(
      normalizeVenueEventTimes({
        title: "Show",
        starts_at: "2026-08-08T19:30",
        ends_at: "2026-02-30T20:00",
      }),
    ).toEqual({
      title: "Show",
      starts_at: "2026-08-08T19:30-04:00",
    });
  });

  it.each(["", "   ", null, 42])(
    "normalizes an unusable optional end to absent: %j",
    (endsAt) => {
      const event = {
        title: "Show",
        starts_at: "2026-08-08T19:30",
        ends_at: endsAt,
      } as Parameters<typeof normalizeVenueEventTimes>[0];

      expect(normalizeVenueEventTimes(event)).toEqual({
        title: "Show",
        starts_at: "2026-08-08T19:30-04:00",
      });
    },
  );

  it("rejects ambiguous fall-back wall clocks unless the offset is explicit", () => {
    expect(normalizeVenueEventDateTime("2026-11-01T01:30")).toBeNull();
    expect(normalizeVenueEventDateTime("2026-11-01T01:30-04:00")).toBe(
      "2026-11-01T01:30-04:00",
    );
    expect(normalizeVenueEventDateTime("2026-11-01T01:30-05:00")).toBe(
      "2026-11-01T01:30-05:00",
    );
  });

  it("accepts the first valid clocks after both DST transitions", () => {
    expect(normalizeVenueEventDateTime("2026-03-08T03:30")).toBe(
      "2026-03-08T03:30-04:00",
    );
    expect(normalizeVenueEventDateTime("2026-11-01T02:30")).toBe(
      "2026-11-01T02:30-05:00",
    );
  });

  it.each([
    ["public artifact", venueEvents],
    ["recoverable source inventory", venueSourceInventory],
  ])(
    "keeps every Weinberg/New Spire time explicit and Eastern in the %s",
    (_name, rows) => {
      const ownedRows = rows.filter((row) =>
        WEINBERG_VENUES.has(row.venue_slug),
      );
      expect(ownedRows.length).toBeGreaterThan(0);

      for (const row of ownedRows) {
        for (const value of [row.starts_at, row.ends_at]) {
          if (!value) continue;
          expect(value).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
          const wallClock = value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "");
          expect(normalizeVenueEventDateTime(wallClock)).toBe(value);
        }
      }
    },
  );
});

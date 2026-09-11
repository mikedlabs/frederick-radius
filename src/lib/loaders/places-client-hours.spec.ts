import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import HOURS_RAW from "@/data/places-client-hours.json" with { type: "json" };
import PLACES_RAW from "@/data/places-client.json" with { type: "json" };
import type { Hours } from "@/data/places";

type HoursRow = {
  slug: string;
  hours: Hours;
  hours_verified: true;
  hours_updated_at?: string;
  hours_policy_strict: boolean;
};

type ClientPlaceRow = {
  slug: string;
  hours?: Hours;
  hours_verified?: boolean;
  hours_updated_at?: string;
  hours_policy_strict?: boolean;
};

describe("map time-scrubber hours payload", () => {
  it("contains only the compact fields AppMap needs", () => {
    const rows = HOURS_RAW as HoursRow[];
    expect(Array.isArray(rows)).toBe(true);

    for (const row of rows) {
      expect(row.slug).toEqual(expect.any(String));
      expect(row.slug.length).toBeGreaterThan(0);
      expect(row.hours).toEqual(expect.any(Object));
      expect(row.hours_verified).toBe(true);
      expect(row.hours_policy_strict).toEqual(expect.any(Boolean));
      expect(Object.keys(row).sort()).toEqual(
        [
          "hours",
          "hours_policy_strict",
          "hours_updated_at",
          "hours_verified",
          "slug",
        ].filter((key) => key !== "hours_updated_at" || row.hours_updated_at !== undefined),
      );
    }
  });

  it("is generated from the public client catalog without photo data", () => {
    const hoursRows = HOURS_RAW as HoursRow[];
    const places = PLACES_RAW as unknown as ClientPlaceRow[];
    const placeBySlug = new Map(places.map((place) => [place.slug, place]));
    const publishableSchedules = places.filter(
      (place) => place.hours && place.hours_verified,
    );

    expect(hoursRows).toHaveLength(publishableSchedules.length);

    for (const row of hoursRows) {
      const place = placeBySlug.get(row.slug);
      expect(place, row.slug).toBeDefined();
      expect(row.hours, row.slug).toEqual(place?.hours);
      expect(row.hours_updated_at, row.slug).toBe(place?.hours_updated_at);
      expect(row.hours_policy_strict, row.slug).toBe(place?.hours_policy_strict);
    }

    const serialized = JSON.stringify(hoursRows);
    expect(serialized).not.toContain("google_photo_url");
    expect(serialized.length).toBeLessThan(JSON.stringify(places).length / 2);
  });

  it("keeps AppMap off the photo-rich client catalog", () => {
    const appMap = readFileSync(
      new URL("../../components/map/AppMap.tsx", import.meta.url),
      "utf8",
    );

    expect(appMap).toContain(
      'import("@/lib/loaders/places-client-hours")',
    );
    expect(appMap).not.toMatch(
      /import\(["']@\/lib\/loaders\/places-client["']\)/,
    );
    expect(appMap).not.toContain("@/data/places-client.json");
  });
});

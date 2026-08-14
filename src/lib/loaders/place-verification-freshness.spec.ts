import { describe, expect, it } from "vitest";
import type { DayOfWeek, Hours, Place } from "@/data/places";
import ENRICHMENT from "@/data/places-enrichment.json" with { type: "json" };
import {
  decoratePlace,
  decoratePlaceForClientArtifact,
  publicPlaces,
} from "./places";

describe("place verification freshness", () => {
  it("uses the row's actual Google enrichment timestamp", () => {
    const enrichment = ENRICHMENT as Record<
      string,
      { enriched_at?: string }
    >;
    const place = publicPlaces().find(
      (candidate) => enrichment[candidate.slug]?.enriched_at,
    );
    expect(place).toBeDefined();

    const decorated = decoratePlace(place!);
    expect(decorated.last_verified_at).toBe(
      enrichment[place!.slug].enriched_at,
    );
  });

  it("keeps a stored schedule stable after its live freshness window expires", () => {
    const nearRefresh = new Date("2026-08-11T12:00:00.000Z");
    const longAfterRefresh = new Date("2030-08-11T12:00:00.000Z");
    const place = publicPlaces().find((candidate) => {
      const artifact = decoratePlaceForClientArtifact(candidate, nearRefresh);
      return Boolean(artifact.hours && artifact.hours_updated_at);
    });
    expect(place).toBeDefined();

    const near = decoratePlaceForClientArtifact(place!, nearRefresh);
    const later = decoratePlaceForClientArtifact(place!, longAfterRefresh);
    const liveLater = decoratePlace(place!, undefined, longAfterRefresh);

    expect(later.hours, place!.slug).toEqual(near.hours);
    expect(later.hours_updated_at, place!.slug).toBe(near.hours_updated_at);
    expect(later.hours_verified, place!.slug).toBe(true);
    expect(liveLater.hours, place!.slug).toBeUndefined();
    expect(liveLater.hours_verified, place!.slug).toBe(false);
  });

  it("never packages an unreviewed near-24-hour schedule", () => {
    const days: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const allDayHours = Object.fromEntries(
      days.map((day) => [day, [{ open: "00:00", close: "00:00" }]]),
    ) as Hours;
    const place: Place = {
      slug: "unreviewed-all-day-test-place",
      name: "Unreviewed all-day test place",
      category: "food",
      short_blurb: "Test fixture",
      address: "1 Test Street",
      city: "Frederick",
      state: "MD",
      postal_code: "21701",
      municipality: "Frederick",
      geom: { lng: -77.4105, lat: 39.4143 },
      is_verified: true,
      feature_score: 0,
      source: "manual",
      updated_at: "2026-08-11T12:00:00.000Z",
      hours: allDayHours,
      hours_verified: true,
      hours_updated_at: "2026-08-11T12:00:00.000Z",
    };

    const artifact = decoratePlaceForClientArtifact(
      place,
      new Date("2026-08-12T12:00:00.000Z"),
    );

    expect(artifact.hours).toBeUndefined();
    expect(artifact.hours_verified).toBe(false);
  });
});

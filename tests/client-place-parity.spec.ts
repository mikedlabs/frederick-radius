import { describe, expect, it } from "vitest";
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import { decoratePlace, publicPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { clientPlaces } from "@/lib/loaders/places-client";
import { hoursFreshnessEnforced } from "@/lib/hours-freshness";

type ClientRow = PlaceCardData & { hours_policy_strict?: boolean };

describe("server/client place inventory parity", () => {
  const server = publicPlaces().map((place) => decoratePlace(place));
  const client = CLIENT_RAW as unknown as ClientRow[];

  it("ships exactly the canonical public slugs", () => {
    expect(client.map((place) => place.slug).sort()).toEqual(
      server.map((place) => place.slug).sort(),
    );
  });

  it("stamps the same hours policy and materialized schedules as the server build", () => {
    const serverBySlug = new Map(server.map((place) => [place.slug, place]));
    for (const place of client) {
      expect(place.hours_policy_strict, place.slug).toBe(hoursFreshnessEnforced());
    }
    // Exercise the runtime client boundary, not the raw build artifact. A
    // schedule can cross the seven-day freshness boundary while a deployment
    // is live; places-client deliberately suppresses it at read time.
    for (const place of clientPlaces()) {
      const serverPlace = serverBySlug.get(place.slug);
      expect(Boolean(place.hours_verified && place.hours), place.slug).toBe(
        Boolean(serverPlace?.hours_verified && serverPlace.hours),
      );
    }
  });
});

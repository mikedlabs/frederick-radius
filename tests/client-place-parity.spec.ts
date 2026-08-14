import { describe, expect, it } from "vitest";
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import {
  decoratePlace,
  decoratePlaceForClientArtifact,
  publicPlaces,
  type PlaceCardData,
} from "@/lib/loaders/places";
import { clientPlaces } from "@/lib/loaders/places-client";
import { hoursFreshnessEnforced } from "@/lib/hours-freshness";
import { hasReviewRequiredExtendedWindow } from "@/lib/hours-visitability";

type ClientRow = PlaceCardData & { hours_policy_strict?: boolean };

describe("server/client place inventory parity", () => {
  const server = publicPlaces().map((place) => decoratePlace(place));
  const client = CLIENT_RAW as unknown as ClientRow[];

  it("ships exactly the canonical public slugs", () => {
    expect(client.map((place) => place.slug).sort()).toEqual(
      server.map((place) => place.slug).sort(),
    );
  });

  it("stamps the hours policy and enforces server parity at runtime", () => {
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

  it("materializes ordinary stored schedules independently of the build wall clock", () => {
    const farFuture = new Date("2100-01-01T12:00:00.000Z");
    const storedBySlug = new Map(
      publicPlaces().map((place) => {
        const decorated = decoratePlaceForClientArtifact(place, farFuture);
        return [place.slug, decorated] as const;
      }),
    );

    for (const place of client) {
      const stored = storedBySlug.get(place.slug);
      if (hasReviewRequiredExtendedWindow(place.hours)) {
        // Current, explicitly reviewed near-24-hour schedules may ship, but
        // must disappear once that human review expires. They are the one
        // intentional exception to wall-clock-stable artifact materialization.
        expect(stored?.hours, place.slug).toBeUndefined();
        expect(stored?.hours_verified, place.slug).toBe(false);
        continue;
      }
      expect(place.hours, place.slug).toEqual(stored?.hours);
      expect(place.hours_verified, place.slug).toBe(
        stored?.hours_verified ?? false,
      );
      expect(place.hours_updated_at, place.slug).toBe(
        stored?.hours_updated_at,
      );
    }
  });
});

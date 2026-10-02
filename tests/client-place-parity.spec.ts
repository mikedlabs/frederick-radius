import { describe, expect, it } from "vitest";
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import { decoratePlace, publicPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { clientPlaces } from "@/lib/loaders/places-client";
import { resolveCommerceLinks } from "@/lib/commerce/links";
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

  it("ships Beans' source-reviewed menu and order links through the canonical override contract", () => {
    const slug = "beans-in-the-belfry-brunswick";
    const expected = ["menu", "order"].map((type) => ({
      type, provider: "square", source: "curated",
      url: "https://beans-in-the-belfry-103792.square.site/",
    }));
    for (const dataset of [server, client]) {
      const beans = dataset.find((place) => place.slug === slug)!;
      const links = resolveCommerceLinks(beans);
      expect(links).toEqual(expect.arrayContaining(expected.map((link) => expect.objectContaining(link))));
      expect(links.filter((link) => link.url === expected[0].url)).toHaveLength(2);
      expect(links.every((link) => !link.is_verified)).toBe(true);
    }
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

import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../tests/fixtures/steinhardt-squarespace.json" with { type: "json" };
import { fetchSquarespaceVenueEvents } from "./squarespace-live";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("fetchSquarespaceVenueEvents feed images", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("attaches Steinhardt's own Squarespace photographs to venue events", async () => {
    vi.setSystemTime(new Date(1792188000627 - 60 * 60 * 1000));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        const body = url.includes("steinhardtbrewing.com")
          ? fixture
          : { upcoming: [] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const events = await fetchSquarespaceVenueEvents(90);
    const steinhardt = events.filter(
      (event) => event.venue_slug === "steinhardt-brewing-company-frederick",
    );
    expect(steinhardt.length).toBe(33);
    expect(steinhardt.filter((event) => event.hero_image)).toHaveLength(27);
    expect(
      steinhardt.find((event) => event.title.includes("Haunted Haloween"))
        ?.hero_image,
    ).toMatch(/haunted\+steinhardt\+LS\.png$/);
    expect(
      steinhardt.find((event) => event.title === "Mahjong")?.hero_image,
    ).toBeUndefined();
  });
});

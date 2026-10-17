import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/live-music-venues", () => ({
  LIVE_MUSIC_SQUARESPACE_VENUES: [
    { slug: "rockwell", squarespace: "https://www.rockwell.example/events" },
  ],
}));

vi.mock("@/lib/loaders/places-client", () => ({
  clientPlaceBySlug: () => ({ name: "Rockwell Brewery" }),
}));

import { fetchSquarespaceVenueEventsResult } from "./squarespace-live";

const SHOW_START = Date.parse("2026-11-01T23:00:00.000Z");
const SHOW_END = Date.parse("2026-11-02T01:00:00.000Z");

describe("squarespace-live", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T18:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back to items[] when upcoming is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(
          JSON.stringify({
            upcoming: [],
            items: [
              {
                title: "Friday Night Band",
                startDate: SHOW_START,
                endDate: SHOW_END,
                excerpt: "<p>Live on the patio.</p>",
                fullUrl: "/events/friday-night-band",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await fetchSquarespaceVenueEventsResult(60);
    expect(result.state).toBe("ok");
    expect(result.items).toEqual([
      expect.objectContaining({
        title: "Friday Night Band",
        starts_at: new Date(SHOW_START).toISOString(),
        ends_at: new Date(SHOW_END).toISOString(),
        venue_name: "Rockwell Brewery",
        ticket_url: "https://www.rockwell.example/events/friday-night-band",
        description: "Live on the patio.",
        category: "music",
      }),
    ]);
  });

  it("strips Squarespace block CSS from body when excerpt is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                title: "Acoustic Set",
                startDate: SHOW_START,
                endDate: SHOW_END,
                excerpt: "",
                body:
                  "<style>.sqs-block{color:red}</style><p>A quiet patio set with no cover.</p>",
                fullUrl: "/events/acoustic-set",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await fetchSquarespaceVenueEventsResult(60);
    expect(result.items[0]?.description).toBe("A quiet patio set with no cover.");
  });

  it("fails soft on a non-JSON Squarespace page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response("<html>login wall</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(fetchSquarespaceVenueEventsResult(60)).resolves.toEqual({
      items: [],
      state: "failed",
    });
  });
});

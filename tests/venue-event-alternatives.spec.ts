import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collect,
  type Method,
  type VenueCollectDependencies,
  type VenueSource,
} from "../scripts/ingest-venue-events";
import { promoteVenueInventory } from "../scripts/lib/venue-event-promotion";
import { emptyVenueSourceState } from "../scripts/lib/venue-source-state";

const PRIMARY_URL = "https://venue.example/events";
const ALTERNATIVE_URL = "https://venue.example/calendar";

function venue(method: Method): VenueSource {
  return {
    slug: "test-venue",
    name: "Test Venue",
    method,
    urls: [PRIMARY_URL, ALTERNATIVE_URL],
  };
}

function dependencies(
  overrides: Partial<VenueCollectDependencies>,
): VenueCollectDependencies {
  return {
    fetchPageSnapshot: async () => null,
    fetchSquarespaceEventsResult: async () => ({
      status: "failure",
      events: [],
    }),
    extractTextEvents: async () => null,
    extractImageEvents: async () => null,
    ...overrides,
  };
}

const modelReady = async () => true;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("venue source alternatives", () => {
  it("does not replace last-known-good rows when one feed is empty and another fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await collect(
      venue("feed"),
      emptyVenueSourceState(),
      modelReady,
      true,
      dependencies({
        fetchSquarespaceEventsResult: async (url) =>
          url === PRIMARY_URL
            ? { status: "success", events: [] }
            : { status: "failure", events: [] },
      }),
    );
    const retained = { id: "known-good", venue_slug: "test-venue" };
    const inventory = new Map([[retained.id, retained]]);

    promoteVenueInventory({
      inventory,
      venueSlug: "test-venue",
      status: result.status,
      rows: [],
      keyOf: (row) => row.id,
    });

    expect(result.status).toBe("failed");
    expect([...inventory.values()]).toEqual([retained]);
  });

  it("accepts an empty feed inventory when every alternative verifies empty", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await collect(
      venue("feed"),
      emptyVenueSourceState(),
      modelReady,
      false,
      dependencies({
        fetchSquarespaceEventsResult: async () => ({
          status: "success",
          events: [],
        }),
      }),
    );

    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
  });

  it.each(["render", "fetch"] as const)(
    "does not accept a partially verified empty %s alternative set",
    async (method) => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      const result = await collect(
        venue(method),
        emptyVenueSourceState(),
        modelReady,
        true,
        dependencies({
          fetchPageSnapshot: async (url) => ({
            text:
              url === PRIMARY_URL
                ? "No upcoming events."
                : "Calendar could not be interpreted.",
            links: [],
            requestedUrl: url,
            finalUrl: url,
          }),
          extractTextEvents: async (_instructions, content) =>
            content === "No upcoming events." ? [] : null,
        }),
      );

      expect(result.status).toBe("failed");
      expect(result.events).toEqual([]);
    },
  );

  it.each(["render", "fetch"] as const)(
    "accepts an empty %s inventory only after verifying every alternative",
    async (method) => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      const result = await collect(
        venue(method),
        emptyVenueSourceState(),
        modelReady,
        false,
        dependencies({
          fetchPageSnapshot: async (url) => ({
            text: "No upcoming events.",
            links: [],
            requestedUrl: url,
            finalUrl: url,
          }),
          extractTextEvents: async () => [],
        }),
      );

      expect(result.status).toBe("complete");
      expect(result.events).toEqual([]);
    },
  );
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveEventsBySlugs = vi.fn();

vi.mock("@/lib/loaders/eventsBySlugs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/loaders/eventsBySlugs")
  >("@/lib/loaders/eventsBySlugs");
  return { ...actual, resolveEventsBySlugs };
});

const { GET } = await import("./route");

function get(slugs: string): Promise<Response> {
  return GET(
    new Request(
      `http://localhost/api/events/by-slugs?slugs=${encodeURIComponent(slugs)}`,
    ),
  );
}

describe("GET /api/events/by-slugs", () => {
  beforeEach(() => {
    resolveEventsBySlugs.mockReset();
    resolveEventsBySlugs.mockResolvedValue([]);
  });

  it("hands the normalized slug set to the loader", async () => {
    await get(" b-event ,a-event,b-event");

    expect(resolveEventsBySlugs).toHaveBeenCalledWith(["b-event", "a-event"]);
  });

  it("answers an empty request without a lookup, and caches that answer long", async () => {
    const response = await GET(
      new Request("http://localhost/api/events/by-slugs"),
    );

    expect(resolveEventsBySlugs).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ events: [] });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("rejects unusable slugs before any lookup runs", async () => {
    const response = await get("constructor,prototype,Not A Slug");

    expect(resolveEventsBySlugs).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ events: [] });
  });

  it("keeps a resolved set on a short edge window", async () => {
    // Events get cancelled and rescheduled, so a saved deck must not be able
    // to serve a stale row for as long as the place equivalent may.
    const response = await get("a-event");

    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
  });
});

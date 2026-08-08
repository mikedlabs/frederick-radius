import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveEventsBySlugs = vi.fn();

vi.mock("@/lib/loaders/eventsBySlugs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/loaders/eventsBySlugs")
  >("@/lib/loaders/eventsBySlugs");
  return { ...actual, resolveEventsBySlugs };
});

const { GET, POST } = await import("./route");

function get(slugs: string): Promise<Response> {
  return GET(
    new Request(
      `http://localhost/api/events/by-slugs?slugs=${encodeURIComponent(slugs)}`,
    ),
  );
}

function post(
  body: string,
  headers: Record<string, string> = { "Content-Type": "application/json" },
): Promise<Response> {
  return POST(
    new Request("http://localhost/api/events/by-slugs", {
      method: "POST",
      headers,
      body,
    }),
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

describe("POST /api/events/by-slugs", () => {
  beforeEach(() => {
    resolveEventsBySlugs.mockReset();
    resolveEventsBySlugs.mockResolvedValue([]);
  });

  it("hands a normalized JSON slug list to the same loader", async () => {
    const response = await post(
      JSON.stringify({ slugs: [" b-event ", "a-event", "b-event", 12] }),
    );

    expect(response.status).toBe(200);
    expect(resolveEventsBySlugs).toHaveBeenCalledWith(["b-event", "a-event"]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("accepts the largest valid batch inside the body ceiling", async () => {
    const slugs = Array.from(
      { length: 100 },
      (_, i) => `event-${String(i).padStart(3, "0")}-${"x".repeat(190)}`,
    );
    const response = await post(JSON.stringify({ slugs }));

    expect(response.status).toBe(200);
    expect(resolveEventsBySlugs).toHaveBeenCalledWith(slugs);
  });

  it("rejects an oversized body before lookup", async () => {
    const response = await post(JSON.stringify({ slugs: [] }), {
      "Content-Type": "application/json",
      "Content-Length": String(25 * 1024),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body-too-large" });
    expect(resolveEventsBySlugs).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON, body shape, and media type without lookup", async () => {
    expect((await post("{")).status).toBe(400);
    expect((await post(JSON.stringify({ slugs: "a-event" }))).status).toBe(400);
    expect((await post(JSON.stringify({ slugs: ["a-event"] }), {
      "Content-Type": "text/plain",
    })).status).toBe(415);
    expect(resolveEventsBySlugs).not.toHaveBeenCalled();
  });
});

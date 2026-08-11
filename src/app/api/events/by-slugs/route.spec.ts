import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveEventsBySlugsWithStatus = vi.fn();
const isRateLimited = vi.fn();

vi.mock("@/lib/loaders/eventsBySlugs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/loaders/eventsBySlugs")
  >("@/lib/loaders/eventsBySlugs");
  return { ...actual, resolveEventsBySlugsWithStatus };
});

vi.mock("@/lib/origin-check", async () => {
  const actual = await vi.importActual<typeof import("@/lib/origin-check")>(
    "@/lib/origin-check",
  );
  return { ...actual, isRateLimited };
});

const { GET, POST } = await import("./route");

function get(
  slugs: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return GET(
    new Request(
      `http://localhost/api/events/by-slugs?slugs=${encodeURIComponent(slugs)}`,
      { headers },
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
    isRateLimited.mockReset();
    isRateLimited.mockResolvedValue(false);
    resolveEventsBySlugsWithStatus.mockReset();
    resolveEventsBySlugsWithStatus.mockResolvedValue({
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: [],
      missingSlugs: [],
      degraded: false,
    });
  });

  it("hands the normalized slug set to the loader", async () => {
    await get(" b-event ,a-event,b-event");

    expect(resolveEventsBySlugsWithStatus).toHaveBeenCalledWith(["b-event", "a-event"]);
  });

  it("answers an empty request without a lookup, and caches that answer long", async () => {
    const response = await GET(
      new Request("http://localhost/api/events/by-slugs"),
    );

    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: [],
      missingSlugs: [],
      degraded: false,
    });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("rejects unusable slugs before any lookup runs", async () => {
    const response = await get("constructor,prototype,Not A Slug");

    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: [],
      missingSlugs: [],
      degraded: false,
    });
  });

  it("keeps a resolved set on a short edge window", async () => {
    // Events get cancelled and rescheduled, so a saved deck must not be able
    // to serve a stale row for as long as the place equivalent may.
    const response = await get("a-event");

    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
  });

  it("blocks a foreign browser read before rate limiting or archive work", async () => {
    const response = await get("a-event", {
      Referer: "https://example.net/hotlink",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(isRateLimited).not.toHaveBeenCalled();
    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
  });

  it("rate-limits an anonymous read before archive work", async () => {
    isRateLimited.mockResolvedValue(true);

    const response = await get("a-event", {
      Referer: "http://localhost/saved",
      "X-Real-IP": "203.0.113.25",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
  });

  it("does not put a degraded read into the shared cache", async () => {
    resolveEventsBySlugsWithStatus.mockResolvedValue({
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: ["a-event"],
      missingSlugs: [],
      degraded: true,
    });

    const response = await get("a-event");

    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("POST /api/events/by-slugs", () => {
  beforeEach(() => {
    isRateLimited.mockReset();
    isRateLimited.mockResolvedValue(false);
    resolveEventsBySlugsWithStatus.mockReset();
    resolveEventsBySlugsWithStatus.mockResolvedValue({
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: [],
      missingSlugs: [],
      degraded: false,
    });
  });

  it("hands a normalized JSON slug list to the same loader", async () => {
    const response = await post(
      JSON.stringify({ slugs: [" b-event ", "a-event", "b-event", 12] }),
    );

    expect(response.status).toBe(200);
    expect(resolveEventsBySlugsWithStatus).toHaveBeenCalledWith(["b-event", "a-event"]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("accepts the largest valid batch inside the body ceiling", async () => {
    const slugs = Array.from(
      { length: 100 },
      (_, i) => `event-${String(i).padStart(3, "0")}-${"x".repeat(190)}`,
    );
    const response = await post(JSON.stringify({ slugs }));

    expect(response.status).toBe(200);
    expect(resolveEventsBySlugsWithStatus).toHaveBeenCalledWith(slugs);
  });

  it("rejects a foreign POST read before parsing its body", async () => {
    const response = await post(JSON.stringify({ slugs: ["a-event"] }), {
      "Content-Type": "application/json",
      Origin: "https://example.net",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
  });

  it("rate-limits POST hydration before parsing or source work", async () => {
    isRateLimited.mockResolvedValue(true);

    const response = await post(JSON.stringify({ slugs: ["a-event"] }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before lookup", async () => {
    const response = await post(JSON.stringify({ slugs: [] }), {
      "Content-Type": "application/json",
      "Content-Length": String(25 * 1024),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body-too-large" });
    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON, body shape, and media type without lookup", async () => {
    expect((await post("{")).status).toBe(400);
    expect((await post(JSON.stringify({ slugs: "a-event" }))).status).toBe(400);
    expect((await post(JSON.stringify({ slugs: ["a-event"] }), {
      "Content-Type": "text/plain",
    })).status).toBe(415);
    expect(resolveEventsBySlugsWithStatus).not.toHaveBeenCalled();
  });
});

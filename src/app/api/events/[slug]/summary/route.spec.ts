import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveEventPageBySlug: vi.fn(),
  isOperationalEventResolutionError: vi.fn(),
}));

vi.mock("@/lib/loaders/eventResolver", () => ({
  resolveEventPageBySlug: mocks.resolveEventPageBySlug,
  isOperationalEventResolutionError: mocks.isOperationalEventResolutionError,
}));

import { GET } from "./route";

function request(slug = "admissions-drop-in-day-2026-08-03") {
  return GET(
    new Request(`https://frederickradius.app/api/events/${slug}/summary`),
    { params: Promise.resolve({ slug }) },
  );
}

describe("GET /api/events/[slug]/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOperationalEventResolutionError.mockReturnValue(false);
  });

  it("uses the same resolver as the valid full event detail route", async () => {
    const event = {
      slug: "admissions-drop-in-day-2026-08-03",
      title: "Admissions Drop-In Day",
    };
    mocks.resolveEventPageBySlug.mockResolvedValue({
      kind: "archive",
      event,
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ event });
    expect(mocks.resolveEventPageBySlug).toHaveBeenCalledWith(event.slug);
  });

  it("returns 404 only after the bounded page resolver proves a miss", async () => {
    mocks.resolveEventPageBySlug.mockResolvedValue(null);

    const response = await request("missing-event");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("keeps an operational miss retryable instead of caching a false 404", async () => {
    const failure = new Error("provider timed out");
    mocks.resolveEventPageBySlug.mockRejectedValue(failure);
    mocks.isOperationalEventResolutionError.mockReturnValue(true);

    const response = await request();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toEqual({
      error: "temporarily_unavailable",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveEventPageBySlug: vi.fn(),
  isOperationalEventResolutionError: vi.fn(),
  clientPlaceBySlug: vi.fn(),
  noticeForEvent: vi.fn(),
}));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaceBySlug: mocks.clientPlaceBySlug }));
vi.mock("@/lib/events/notices", () => ({ noticeForEvent: mocks.noticeForEvent }));

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
    mocks.clientPlaceBySlug.mockReturnValue(null);
    mocks.noticeForEvent.mockReturnValue(null);
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

  it("joins a resolved venue and owner cancellation exactly as the full page does", async () => {
    const event = { slug: "concert", venue_place_slug: "amphitheater", geo_confidence: "area", status: "scheduled" };
    const geom = { lng: -77.4087, lat: 39.4126 };
    mocks.resolveEventPageBySlug.mockResolvedValue({ kind: "seed", event });
    mocks.clientPlaceBySlug.mockReturnValue({ geom });
    mocks.noticeForEvent.mockReturnValue({ status: "cancelled" });
    const response = await request("concert");
    expect((await response.json()).event).toMatchObject({ geom, geo_confidence: "venue_match", status: "cancelled" });
  });

  it("does not give an online event the physical venue coordinate", async () => {
    mocks.resolveEventPageBySlug.mockResolvedValue({ kind: "archive", event: { slug: "online", attendance_mode: "online", venue_place_slug: "amphitheater" } });
    const response = await request("online");
    expect((await response.json()).event).not.toHaveProperty("geom");
    expect(mocks.clientPlaceBySlug).not.toHaveBeenCalled();
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  photoUrl: vi.fn(),
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/data/places-enrichment.json", () => ({
  default: {
    first: {
      photo_names: ["places/ChIJtripwire/photos/one"],
      photo_attributions: [{
        photo_name: "places/ChIJtripwire/photos/one",
        google_maps_uri: "https://www.google.com/maps/photos/one",
        authors: [],
      }],
    },
    second: {
      photo_names: ["places/ChIJtripwire/photos/two"],
      photo_attributions: [{
        photo_name: "places/ChIJtripwire/photos/two",
        google_maps_uri: "https://www.google.com/maps/photos/two",
        authors: [],
      }],
    },
  },
}));
vi.mock("@/lib/integrations/google-places", () => ({
  photoUrl: mocks.photoUrl,
}));
vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import { photoTripwire } from "./tripwires";

describe("Google photo tripwire daily budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", "");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.photoUrl.mockImplementation((name: string) =>
      `https://places.googleapis.test/${encodeURIComponent(name)}`,
    );
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses one shared photo reservation for the daily rotating probe", async () => {
    await expect(photoTripwire(2)).resolves.toEqual([]);

    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 1_500);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("reports an exhausted allowance instead of a false green check", async () => {
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", "7");
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 7 });

    await expect(photoTripwire(2)).resolves.toEqual([
      expect.objectContaining({
        source: "google-photos",
        kind: "provider_budget_exhausted",
      }),
    ]);

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 7);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reports the unavailable budget store instead of a false green check", async () => {
    mocks.reserveDailyUsage.mockResolvedValue(null);

    await expect(photoTripwire(2)).resolves.toEqual([
      expect.objectContaining({
        source: "google-photo-budget",
        kind: "infrastructure_unavailable",
      }),
    ]);

    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

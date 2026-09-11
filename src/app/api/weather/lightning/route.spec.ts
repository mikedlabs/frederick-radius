import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOfficialLightningSnapshot: vi.fn(),
  buildFrederickLightningMapUrl: vi.fn(),
}));

vi.mock("@/lib/live/officialSignals", () => ({
  getOfficialLightningSnapshot: mocks.getOfficialLightningSnapshot,
}));

vi.mock("@/lib/integrations/nowcoast-lightning", () => ({
  buildFrederickLightningMapUrl: mocks.buildFrederickLightningMapUrl,
}));

import { GET } from "./route";

const FRAME_AT = "2026-07-28T16:00:00.000Z";

function lightningSnapshot({
  available,
  stale,
  latestFrameAt,
}: {
  available: boolean;
  stale: boolean;
  latestFrameAt: string | null;
}) {
  return {
    available,
    stale,
    capability: latestFrameAt
      ? {
          latestFrameAt,
          densityWindowMinutes: 15,
          horizontalResolutionKm: 8,
        }
      : null,
  };
}

describe("GET /api/weather/lightning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.buildFrederickLightningMapUrl.mockReturnValue(
      "https://nowcoast.noaa.gov/example.png",
    );
  });

  it("returns only a current NOAA density frame and never labels it as strike pins", async () => {
    mocks.getOfficialLightningSnapshot.mockResolvedValue(
      lightningSnapshot({
        available: true,
        stale: false,
        latestFrameAt: FRAME_AT,
      }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    );
    expect(mocks.buildFrederickLightningMapUrl).toHaveBeenCalledWith({
      width: 1_024,
      height: 1_024,
      time: FRAME_AT,
    });
    await expect(response.json()).resolves.toEqual({
      available: true,
      frameAt: FRAME_AT,
      imageUrl: "https://nowcoast.noaa.gov/example.png",
      densityWindowMinutes: 15,
      horizontalResolutionKm: 8,
      individualStrikes: false,
      source: "NOAA nowCOAST",
    });
  });

  it.each([
    ["stale", true, true, FRAME_AT],
    ["unavailable", false, false, FRAME_AT],
    ["missing a frame", true, false, null],
  ])(
    "fails closed when the lightning product is %s",
    async (_label, available, stale, latestFrameAt) => {
      mocks.getOfficialLightningSnapshot.mockResolvedValue(
        lightningSnapshot({ available, stale, latestFrameAt }),
      );

      const response = await GET();
      const body = await response.json();

      expect(body).toMatchObject({
        available: false,
        imageUrl: null,
        individualStrikes: false,
      });
      expect(mocks.buildFrederickLightningMapUrl).not.toHaveBeenCalled();
    },
  );
});

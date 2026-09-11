import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFrederickLightningMapUrl,
  getNowCoastLightningResult,
  NOWCOAST_LIGHTNING_DATASET,
  parseNowCoastLightningCapabilities,
} from "./nowcoast-lightning";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const CAPABILITIES = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0">
  <Service><Title>Lightning Detection</Title></Service>
  <Capability><Layer>
    <Title>Lightning Detection</Title>
    <Layer queryable="1">
      <Name>ldn_lightning_strike_density</Name>
      <Title>Lightning Strike Density Data</Title>
      <Dimension name="time" default="2026-07-28T15:45:00Z" units="ISO8601">
        2026-07-28T15:15:00.000Z,2026-07-28T15:30:00.000Z,2026-07-28T15:45:00.000Z
      </Dimension>
      <Style><Name>lightning_density</Name></Style>
    </Layer>
  </Layer></Capability>
</WMS_Capabilities>`;

describe("NOAA nowCOAST lightning capabilities", () => {
  it("exposes current density metadata without modeling individual strikes", () => {
    const capability = parseNowCoastLightningCapabilities(CAPABILITIES, {
      now: new Date("2026-07-28T16:00:00.000Z"),
      retrievedAt: "2026-07-28T16:00:00.000Z",
    });

    expect(capability).toMatchObject({
      layerName: "ldn_lightning_strike_density",
      title: "Lightning Strike Density Data",
      latestFrameAt: "2026-07-28T15:45:00.000Z",
      status: "current",
      individualStrikes: false,
      densityWindowMinutes: 15,
      horizontalResolutionKm: 8,
      approximateUpdateMinutes: 15,
      provenance: {
        publisher: "NOAA nowCOAST / NWS Ocean Prediction Center",
        confidence: "official",
      },
    });
    expect(capability?.frameTimes).toHaveLength(3);
    expect(NOWCOAST_LIGHTNING_DATASET.individualStrikes).toBe(false);
  });

  it("marks old frames stale and rejects missing target-layer metadata", () => {
    expect(
      parseNowCoastLightningCapabilities(CAPABILITIES, {
        now: new Date("2026-07-28T18:00:00.000Z"),
      })?.status,
    ).toBe("stale");
    expect(
      parseNowCoastLightningCapabilities(
        "<WMS_Capabilities><Layer><Name>other</Name></Layer></WMS_Capabilities>",
      ),
    ).toBeNull();
  });

  it("builds a county-bounded WMS image request and clamps image size", () => {
    const url = new URL(
      buildFrederickLightningMapUrl({
        width: 9_999,
        height: 0,
        time: "2026-07-28T15:45:00.000Z",
      }),
    );

    expect(url.searchParams.get("LAYERS")).toBe(
      "ldn_lightning_strike_density",
    );
    expect(url.searchParams.get("CRS")).toBe("CRS:84");
    expect(url.searchParams.get("BBOX")).toBe(
      "-77.7,39.265,-77.15,39.745",
    );
    expect(url.searchParams.get("WIDTH")).toBe("2048");
    expect(url.searchParams.get("HEIGHT")).toBe("1");
    expect(url.searchParams.get("TIME")).toBe(
      "2026-07-28T15:45:00.000Z",
    );
  });
});

describe("NOAA nowCOAST lightning availability", () => {
  it("returns stale metadata as available without calling it current", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(CAPABILITIES)),
    );

    await expect(
      getNowCoastLightningResult({
        now: new Date("2026-07-28T18:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      available: true,
      stale: true,
      capability: { status: "stale", individualStrikes: false },
    });
  });

  it("aborts a stalled capabilities request and fails soft", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );

    const pending = getNowCoastLightningResult({ deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toMatchObject({
      capability: null,
      available: false,
    });
    expect(signal?.aborted).toBe(true);
  });
});

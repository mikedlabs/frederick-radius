import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadMapLayers,
  resetMapLayersRequest,
} from "./mapLayersClient";

afterEach(() => {
  resetMapLayersRequest();
  vi.unstubAllGlobals();
});

describe("mapLayersClient", () => {
  it("deduplicates optional context requests in one map session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          amenities: [
            {
              id: "water-1",
              kind: "water",
              name: "Drinking fountain",
              lng: -77.41,
              lat: 39.41,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      loadMapLayers(),
      loadMapLayers(),
    ]);

    expect(first.amenities).toHaveLength(1);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/map/layers?groups=context",
      expect.any(Object),
    );
  });

  it("exposes a failed request and keeps the group retryable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sourceHealth: {
              context: { status: "current", unavailable: [] },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMapLayers()).resolves.toMatchObject({
      amenities: [],
      sourceHealth: {
        context: {
          status: "unavailable",
          unavailable: ["Map data service"],
        },
      },
    });
    await expect(loadMapLayers()).resolves.toMatchObject({
      amenities: [],
      sourceHealth: {
        context: { status: "current", unavailable: [] },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/map/layers?groups=context",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not request a specialist group until it is explicitly named", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadMapLayers(["context"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await loadMapLayers(["outdoors"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/map/layers?groups=outdoors",
      expect.any(Object),
    );
  });

  it("keeps a partial group retryable without discarding useful data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            trailLines: { type: "FeatureCollection", features: [] },
            cemeteries: [{ id: "one", name: "One", approximate: false, lng: -77.4, lat: 39.4 }],
            sourceHealth: {
              outdoors: {
                status: "partial",
                unavailable: ["County trails"],
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            trailLines: { type: "FeatureCollection", features: [] },
            cemeteries: [],
            sourceHealth: {
              outdoors: { status: "current", unavailable: [] },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const partial = await loadMapLayers(["outdoors"]);
    expect(partial.cemeteries).toHaveLength(1);
    expect(partial.sourceHealth.outdoors?.status).toBe("partial");

    const recovered = await loadMapLayers(["outdoors"]);
    expect(recovered.cemeteries).toEqual([]);
    expect(recovered.sourceHealth.outdoors?.status).toBe("current");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/map/layers?groups=outdoors",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps stale-good group data when a degraded retry becomes unavailable", async () => {
    const cemetery = {
      id: "historic-one",
      name: "Historic cemetery",
      approximate: false,
      lng: -77.4,
      lat: 39.4,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cemeteries: [cemetery],
            sourceHealth: {
              outdoors: {
                status: "partial",
                unavailable: ["County trails"],
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sourceHealth: {
              outdoors: {
                status: "unavailable",
                unavailable: ["County trails", "Historic cemeteries"],
              },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const partial = await loadMapLayers(["outdoors"]);
    expect(partial.cemeteries).toEqual([cemetery]);

    const unavailable = await loadMapLayers(["outdoors"]);
    expect(unavailable.cemeteries).toEqual([cemetery]);
    expect(unavailable.sourceHealth.outdoors).toEqual({
      status: "unavailable",
      unavailable: ["County trails", "Historic cemeteries"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

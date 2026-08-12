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

  it("clears a failed request so a later navigation can recover", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMapLayers()).rejects.toThrow("returned 503");
    await expect(loadMapLayers()).resolves.toMatchObject({ amenities: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadMapPlaces,
  resetMapPlacesRequest,
  warmMapPlaces,
} from "./mapPlacesClient";

const validPayload = {
  generatedAt: "2026-08-11T16:00:00.000Z",
  places: [
    {
      slug: "gravel-and-grind-frederick",
      name: "Gravel & Grind",
      category: "coffee",
      geom: { lng: -77.4108, lat: 39.4143 },
      open_status: { state: "unknown" },
    },
  ],
};

afterEach(() => {
  resetMapPlacesRequest();
  vi.unstubAllGlobals();
});

describe("mapPlacesClient", () => {
  it("deduplicates warmup and consumer requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    warmMapPlaces();
    const payload = await loadMapPlaces();

    expect(payload.places[0]?.slug).toBe("gravel-and-grind-frederick");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears a failed request so retry can recover", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validPayload), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMapPlaces()).rejects.toThrow("returned 503");
    await expect(loadMapPlaces()).resolves.toMatchObject(validPayload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed rows rather than drawing bad coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generatedAt: validPayload.generatedAt,
            places: [{ slug: "bad", name: "Bad", geom: { lng: null, lat: 1 } }],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(loadMapPlaces()).rejects.toThrow("malformed");
  });
});

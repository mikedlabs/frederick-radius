import { describe, expect, it } from "vitest";
import { readFairPhotoViewerMessage, samplePhotoLights, FAIR_PHOTO_MAX_SPLATS } from "./photo-viewer";

describe("Fair photo viewer messages", () => {
  const source = {} as Window;
  const origin = "https://frederickradius.app";
  const ready = { type: "radius:fair-photo", version: 1, status: "ready" };
  it("accepts only the mounted same-origin viewer's exact status message", () => {
    expect(readFairPhotoViewerMessage({ origin, source, data: ready }, origin, source)).toEqual(ready);
    expect(readFairPhotoViewerMessage({ origin: "https://other.test", source, data: ready }, origin, source)).toBeNull();
    expect(readFairPhotoViewerMessage({ origin, source: {} as Window, data: ready }, origin, source)).toBeNull();
    expect(readFairPhotoViewerMessage({ origin, source, data: ready }, origin, null)).toBeNull();
    expect(readFairPhotoViewerMessage({ origin, source, data: { ...ready, url: "https://other.test" } }, origin, source)).toBeNull();
    expect(readFairPhotoViewerMessage({ origin, source, data: { ...ready, version: 2 } }, origin, source)).toBeNull();
  });
  it("allows only bounded fallback reasons", () => {
    const error = { ...ready, status: "error", reason: "webgl" };
    expect(readFairPhotoViewerMessage({ origin, source, data: error }, origin, source)).toEqual(error);
    expect(readFairPhotoViewerMessage({ origin, source, data: { ...error, reason: "private data" } }, origin, source)).toBeNull();
  });
});

describe("real photo light sampling", () => {
  it("keeps the actual positions and color, ignoring dark and transparent pixels", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba.set([255, 32, 16, 255], 0);
    rgba.set([2, 2, 2, 255], 8);
    rgba.set([255, 255, 255, 0], 32);
    expect(samplePhotoLights(rgba, 4, 4)).toEqual([{ x: 0.125, y: 0.125, red: 1, green: 32 / 255, blue: 16 / 255, brightness: 1 }]);
  });
  it("caps work even if a caller asks for more and rejects malformed dimensions", () => {
    const rgba = new Uint8ClampedArray(320 * 180 * 4).fill(255);
    expect(samplePhotoLights(rgba, 320, 180, 999_999)).toHaveLength(FAIR_PHOTO_MAX_SPLATS);
    expect(samplePhotoLights(rgba, 320, 180, 3)).toHaveLength(3);
    expect(samplePhotoLights(rgba, 0, 180)).toEqual([]);
    expect(samplePhotoLights(rgba, 320, 180.5)).toEqual([]);
  });
});

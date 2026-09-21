import { describe, expect, it } from "vitest";
import { boothViewBox, constrainBoothCamera, fitBoothAreaCamera, fitBoothCamera, focusBoothCamera, MAX_BOOTH_ZOOM, panBoothCamera, zoomBoothCamera } from "./fair-booth-camera";

describe("Fair booth image-space camera", () => {
  const map = { width: 1600, height: 1920 };
  const viewport = { width: 700, height: 600 };

  it("fits every edge without cropping at wide and narrow sizes", () => {
    for (const size of [viewport, { width: 320, height: 350 }]) {
      const box = boothViewBox(map, size, fitBoothCamera(map));
      expect(box.x).toBeLessThanOrEqual(0);
      expect(box.y).toBeLessThanOrEqual(0);
      expect(box.x + box.width).toBeGreaterThanOrEqual(map.width);
      expect(box.y + box.height).toBeGreaterThanOrEqual(map.height);
    }
  });

  it("keeps the image-space point beneath the zoom anchor fixed", () => {
    const before = { x: 800, y: 960, zoom: 3 };
    const anchor = { x: 450, y: 350 };
    const after = zoomBoothCamera(map, viewport, before, 1.5, anchor);
    const point = (camera: typeof before) => {
      const box = boothViewBox(map, viewport, camera);
      return { x: box.x + anchor.x / viewport.width * box.width, y: box.y + anchor.y / viewport.height * box.height };
    };
    expect(point(after).x).toBeCloseTo(point(before).x);
    expect(point(after).y).toBeCloseTo(point(before).y);
  });

  it("constrains dragging and zooming without losing the map", () => {
    expect(zoomBoothCamera(map, viewport, fitBoothCamera(map), 100).zoom).toBe(MAX_BOOTH_ZOOM);
    expect(zoomBoothCamera(map, viewport, fitBoothCamera(map), 0.1)).toEqual(fitBoothCamera(map));
    const camera = panBoothCamera(map, viewport, { x: 800, y: 960, zoom: 4 }, 50_000, -50_000);
    const box = boothViewBox(map, viewport, camera);
    expect(box.x).toBe(0);
    expect(box.y + box.height).toBe(map.height);
    expect(constrainBoothCamera(map, viewport, { x: -900, y: 99999, zoom: 1 })).toEqual(fitBoothCamera(map));
  });

  it("focuses the actual center of a top-left rotated source booth", () => {
    const camera = focusBoothCamera(map, viewport, { x: 800, y: 900, width: 100, height: 40, rotationDeg: 90 });
    expect(camera.x).toBeCloseTo(780);
    expect(camera.y).toBeCloseTo(950);
    expect(camera.zoom).toBeGreaterThan(1);
  });

  it("fits nonzero content bounds without reintroducing the document header", () => {
    const content = { x: 60, y: 420, width: 1480, height: 1420 };
    expect(fitBoothCamera(content)).toEqual({ x: 800, y: 1130, zoom: 1 });
    const camera = panBoothCamera(content, viewport, { x: 800, y: 1100, zoom: 3 }, 50000, 50000);
    const box = boothViewBox(content, viewport, camera);
    expect(box.x).toBeCloseTo(60);
    expect(box.y).toBeCloseTo(420);
    const area = { x: 650, y: 900, width: 250, height: 200 };
    const focused = boothViewBox(content, viewport, fitBoothAreaCamera(content, viewport, area));
    expect(focused.x).toBeLessThanOrEqual(area.x);
    expect(focused.y).toBeLessThanOrEqual(area.y);
    expect(focused.x + focused.width).toBeGreaterThanOrEqual(area.x + area.width);
    expect(focused.y + focused.height).toBeGreaterThanOrEqual(area.y + area.height);
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  MAP_CAMERA_DURATION_MS,
  mapCameraDuration,
} from "@/lib/motion";

function setMotionPreferences({
  reduce = false,
  saveData = false,
}: {
  reduce?: boolean;
  saveData?: boolean;
}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && reduce,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: { saveData },
  });
}

describe("map camera motion budget", () => {
  beforeEach(() => setMotionPreferences({}));

  it("uses one bounded pace for each camera intent", () => {
    expect(mapCameraDuration("nudge")).toBe(MAP_CAMERA_DURATION_MS.nudge);
    expect(mapCameraDuration("focus")).toBe(MAP_CAMERA_DURATION_MS.focus);
    expect(mapCameraDuration("reframe")).toBe(MAP_CAMERA_DURATION_MS.reframe);
    expect(mapCameraDuration("journey")).toBe(MAP_CAMERA_DURATION_MS.journey);
    expect(Math.max(...Object.values(MAP_CAMERA_DURATION_MS))).toBeLessThan(800);
  });

  it("makes every camera move instant for reduced-motion viewers", () => {
    setMotionPreferences({ reduce: true });

    for (const pace of Object.keys(MAP_CAMERA_DURATION_MS) as Array<
      keyof typeof MAP_CAMERA_DURATION_MS
    >) {
      expect(mapCameraDuration(pace)).toBe(0);
    }
  });

  it("makes every camera move instant when Save-Data is active", () => {
    setMotionPreferences({ saveData: true });

    for (const pace of Object.keys(MAP_CAMERA_DURATION_MS) as Array<
      keyof typeof MAP_CAMERA_DURATION_MS
    >) {
      expect(mapCameraDuration(pace)).toBe(0);
    }
  });
});

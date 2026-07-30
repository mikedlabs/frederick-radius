import { describe, expect, it } from "vitest";
import { resolveMapLocationSeed } from "./mapLocationSeed";

const downtown = { lng: -77.4105, lat: 39.4143 };

describe("resolveMapLocationSeed", () => {
  it("uses a fresh county fix for ranking without moving a protected camera", () => {
    expect(resolveMapLocationSeed(downtown, false)).toEqual({
      ranking: downtown,
      camera: null,
    });
  });

  it("shares the fix with the camera when the route opts in", () => {
    expect(resolveMapLocationSeed(downtown, true)).toEqual({
      ranking: downtown,
      camera: downtown,
    });
  });

  it("opens a clean map around an already-consented cached fix", () => {
    const cached = { ...downtown, preferMapCamera: true };
    expect(resolveMapLocationSeed(cached, false)).toEqual({
      ranking: cached,
      camera: cached,
    });
  });

  it("rejects an out-of-county cache for both uses", () => {
    expect(
      resolveMapLocationSeed(
        { lng: -76.6122, lat: 39.2904, preferMapCamera: true },
        true,
      ),
    ).toEqual({
      ranking: null,
      camera: null,
    });
  });
});

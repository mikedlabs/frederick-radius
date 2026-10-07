import { afterEach, describe, expect, it } from "vitest";
import { MINI_MAP_ZOOM, miniMapSource } from "./miniMapSource";

const ENV_KEYS = [
  "MAPBOX_STATIC_MAPS_ENABLED",
  "MAPBOX_STATIC_DAILY_REQUEST_CAP",
  "MAPBOX_SERVER_TOKEN",
] as const;

describe("miniMapSource", () => {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  function configure(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    for (const key of ENV_KEYS) {
      const value = env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it("falls back to the owned basemap in the default configuration", () => {
    configure({});
    expect(miniMapSource()).toBe("owned-basemap");
  });

  it.each([
    ["the switch is off", { MAPBOX_STATIC_MAPS_ENABLED: "0", MAPBOX_STATIC_DAILY_REQUEST_CAP: "25", MAPBOX_SERVER_TOKEN: "pk.test" }],
    ["the daily cap is zero", { MAPBOX_STATIC_MAPS_ENABLED: "1", MAPBOX_STATIC_DAILY_REQUEST_CAP: "0", MAPBOX_SERVER_TOKEN: "pk.test" }],
    ["the server token is blank", { MAPBOX_STATIC_MAPS_ENABLED: "1", MAPBOX_STATIC_DAILY_REQUEST_CAP: "25", MAPBOX_SERVER_TOKEN: "  " }],
    ["the server token is missing", { MAPBOX_STATIC_MAPS_ENABLED: "1", MAPBOX_STATIC_DAILY_REQUEST_CAP: "25" }],
  ])("keeps the owned basemap when %s", (_reason, env) => {
    configure(env);
    expect(miniMapSource()).toBe("owned-basemap");
  });

  it("uses the paid static image only when switch, cap, and token are all present", () => {
    configure({
      MAPBOX_STATIC_MAPS_ENABLED: "1",
      MAPBOX_STATIC_DAILY_REQUEST_CAP: "25",
      MAPBOX_SERVER_TOKEN: "pk.test",
    });
    expect(miniMapSource()).toBe("static-image");
  });

  it("frames the block at the same zoom the Open map handoff uses", () => {
    expect(MINI_MAP_ZOOM).toBeGreaterThanOrEqual(15.5);
    expect(MINI_MAP_ZOOM).toBeLessThanOrEqual(16);
  });
});

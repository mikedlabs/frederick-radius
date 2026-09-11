import { describe, expect, it } from "vitest";
import { resolveBeaconWindow, MAX_BEACON_HOURS, DEFAULT_BEACON_HOURS } from "@/lib/food-trucks/beaconWindow";

/**
 * The server-side expiry cap. This is the write-side half of the honest-expiry
 * guarantee: whatever the request asks for, the beacon always starts now and
 * always ends inside a sane, bounded window.
 */

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-07-20T18:00:00.000Z");

describe("resolveBeaconWindow", () => {
  it("always starts the window now", () => {
    const { startedAt } = resolveBeaconWindow(NOW, new Date(NOW.getTime() + 2 * HOUR).toISOString());
    expect(startedAt.getTime()).toBe(NOW.getTime());
  });

  it("honors a real future 'until' within the cap", () => {
    const until = new Date(NOW.getTime() + 3 * HOUR).toISOString();
    const { expiresAt } = resolveBeaconWindow(NOW, until);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + 3 * HOUR);
  });

  it("caps an 'until' that is further out than the maximum", () => {
    const until = new Date(NOW.getTime() + 20 * HOUR).toISOString();
    const { expiresAt } = resolveBeaconWindow(NOW, until);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + MAX_BEACON_HOURS * HOUR);
  });

  it("falls back to the default window when 'until' is missing", () => {
    const { expiresAt } = resolveBeaconWindow(NOW, undefined);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + DEFAULT_BEACON_HOURS * HOUR);
  });

  it("falls back to the default window when 'until' is already in the past", () => {
    const until = new Date(NOW.getTime() - HOUR).toISOString();
    const { expiresAt } = resolveBeaconWindow(NOW, until);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + DEFAULT_BEACON_HOURS * HOUR);
  });

  it("falls back to the default window for a malformed 'until'", () => {
    const { expiresAt } = resolveBeaconWindow(NOW, "not a date");
    expect(expiresAt.getTime()).toBe(NOW.getTime() + DEFAULT_BEACON_HOURS * HOUR);
    expect(resolveBeaconWindow(NOW, 12345).expiresAt.getTime()).toBe(NOW.getTime() + DEFAULT_BEACON_HOURS * HOUR);
  });

  it("never returns an expiry that is not strictly after now", () => {
    for (const until of [undefined, "not a date", new Date(NOW.getTime() - 5 * HOUR).toISOString(), new Date(NOW.getTime() + 100 * HOUR).toISOString()]) {
      expect(resolveBeaconWindow(NOW, until).expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });
});

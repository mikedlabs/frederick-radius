import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefersReducedData,
  prefersReducedMotion,
  shouldLimitLiveEffects,
} from "./motion";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("live effect budget", () => {
  it("honors the operating-system reduced-motion preference", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal("navigator", {});

    expect(prefersReducedMotion()).toBe(true);
    expect(shouldLimitLiveEffects()).toBe(true);
  });

  it("honors the browser Save-Data signal", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("navigator", {
      connection: { saveData: true },
    });

    expect(prefersReducedData()).toBe(true);
    expect(shouldLimitLiveEffects()).toBe(true);
  });
});

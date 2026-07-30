import { afterEach, describe, expect, it, vi } from "vitest";
import {
  haptic,
  isPhoneFeedbackEnabled,
  phoneFeedbackSupport,
  setPhoneFeedbackEnabled,
} from "./haptics";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPreference(value: string | null) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => value,
    },
  });
}

describe("phone feedback preference", () => {
  it("keeps existing feedback on until this device opts out", () => {
    stubPreference(null);
    expect(isPhoneFeedbackEnabled()).toBe(true);
  });

  it("silences vibration when this device turns feedback off", () => {
    const vibrate = vi.fn();
    stubPreference("off");
    vi.stubGlobal("navigator", { vibrate });

    haptic("success");

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("uses the vibration path when the browser exposes it", () => {
    const vibrate = vi.fn();
    stubPreference("on");
    vi.stubGlobal("navigator", { vibrate });

    expect(phoneFeedbackSupport()).toBe("vibration");
    haptic("success");

    expect(vibrate).toHaveBeenCalledWith([10, 60, 10]);
  });

  it("honors an in-memory opt-out when localStorage is blocked", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("CustomEvent", vi.fn());
    vi.stubGlobal("navigator", { vibrate });

    setPhoneFeedbackEnabled(false);
    haptic("warning");

    expect(isPhoneFeedbackEnabled()).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();

    // Leave the module singleton in its default-on state for later tests.
    setPhoneFeedbackEnabled(true);
  });
});

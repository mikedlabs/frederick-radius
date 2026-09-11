import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The tactile layer is wired into ~47 surfaces, so haptic() must pick the
 * right feedback path per device and never throw inside a tap handler. This
 * is the path-selection guard: Android uses the real Vibration pattern; iOS
 * (no Vibration API) falls back to the hidden `switch` Taptic bridge and
 * reuses one element; everything else is a clean no-op. The actual buzz can
 * only be felt on a device — this pins the branching that decides which one
 * runs.
 *
 * Globals are hand-faked via vi.stubGlobal so the DOM path exercises without
 * a jsdom environment. The module singleton is reset per test with a fresh
 * dynamic import.
 */

async function freshHaptic() {
  vi.resetModules();
  return (await import("@/lib/haptics")).haptic;
}

function iosGlobals({
  active = true,
  version = "17_4",
}: {
  active?: boolean;
  version?: string;
} = {}) {
  const click = vi.fn();
  const setAttribute = vi.fn();
  const input = { type: "", tabIndex: 0, style: { cssText: "" }, setAttribute, click };
  const createElement = vi.fn(() => input);
  const appendChild = vi.fn();
  vi.stubGlobal("navigator", {
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15`,
    maxTouchPoints: 5,
    userActivation: { isActive: active },
  });
  vi.stubGlobal("document", { createElement, body: { appendChild } });
  return { input, createElement, appendChild, click, setAttribute };
}

afterEach(() => vi.unstubAllGlobals());

describe("haptic", () => {
  it("uses the Vibration API with the mapped pattern on Android", async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userAgent: "Mozilla/5.0 (Linux; Android 14)" });
    const haptic = await freshHaptic();
    haptic("medium");
    expect(vibrate).toHaveBeenCalledWith(14);
  });

  it("passes the multi-pulse array through for success on Android", async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userAgent: "Android" });
    const haptic = await freshHaptic();
    haptic("success");
    expect(vibrate).toHaveBeenCalledWith([10, 60, 10]);
  });

  it("falls back to the iOS switch bridge when there is no Vibration API", async () => {
    const { createElement, appendChild, click, setAttribute } = iosGlobals();
    const haptic = await freshHaptic();
    haptic("success");
    expect(createElement).toHaveBeenCalledWith("input");
    expect(setAttribute).toHaveBeenCalledWith("switch", "");
    expect(setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("reuses one hidden switch across taps (no DOM churn)", async () => {
    const { createElement, appendChild, click } = iosGlobals();
    const haptic = await freshHaptic();
    haptic("light");
    haptic("light");
    haptic("heavy");
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(3);
  });

  it("does not claim a scheduled iOS cue outside an active user gesture", async () => {
    const { click } = iosGlobals({ active: false });
    const haptic = await freshHaptic();
    expect(haptic("warning")).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("does not expose the switch bridge on iOS versions before 17.4", async () => {
    iosGlobals({ version: "17_3" });
    vi.resetModules();
    const { phoneFeedbackSupport } = await import("@/lib/haptics");
    expect(phoneFeedbackSupport()).toBe("none");
  });

  it("no-ops without throwing when neither vibrate nor iOS is present", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    const haptic = await freshHaptic();
    expect(() => haptic("light")).not.toThrow();
  });

  it("no-ops without throwing when navigator is undefined (SSR)", async () => {
    vi.stubGlobal("navigator", undefined);
    const haptic = await freshHaptic();
    expect(() => haptic()).not.toThrow();
  });
});

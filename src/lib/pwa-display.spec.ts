import { describe, expect, it } from "vitest";
import {
  canOfferInstallAutomatically,
  isInstallCooldownActive,
  isInstallPromptSuppressedPath,
  isIosDevice,
} from "./pwa-display";

describe("iOS platform detection", () => {
  it("recognizes the usual iPhone and iPad user agents", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe(true);
  });

  it("recognizes iPadOS when it presents itself as a touch-capable Mac", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 0)).toBe(false);
  });

  it("does not classify ordinary desktop and Android browsers as iOS", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe(false);
  });
});

describe("install prompt policy", () => {
  it("waits for a return session and actual interaction", () => {
    expect(canOfferInstallAutomatically(1, 20)).toBe(false);
    expect(canOfferInstallAutomatically(2, 1)).toBe(false);
    expect(canOfferInstallAutomatically(2, 2)).toBe(true);
  });

  it("treats only a valid future timestamp as an active cooldown", () => {
    const now = Date.parse("2026-07-22T14:00:00Z");
    expect(isInstallCooldownActive(now + 1, now)).toBe(true);
    expect(isInstallCooldownActive(now, now)).toBe(false);
    expect(isInstallCooldownActive("never", now)).toBe(false);
  });

  it("stays off focused routes and pages with persistent action docks", () => {
    expect(isInstallPromptSuppressedPath("/map")).toBe(true);
    expect(isInstallPromptSuppressedPath("/ask")).toBe(true);
    expect(isInstallPromptSuppressedPath("/ask/breakfast")).toBe(true);
    expect(isInstallPromptSuppressedPath("/places/gravel-and-grind-frederick")).toBe(true);
    expect(isInstallPromptSuppressedPath("/events/alive-at-five")).toBe(true);
    expect(isInstallPromptSuppressedPath("/places")).toBe(false);
    expect(isInstallPromptSuppressedPath("/today")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  isInstallPromptSuppressedPath,
  isIosDevice,
  isIosSafariUserAgent,
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

describe("iOS Safari detection", () => {
  const safari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

  it("recognizes Safari", () => {
    expect(isIosSafariUserAgent(safari)).toBe(true);
  });

  it.each([
    `${safari} [FBAN/FBIOS;FBAV/500.0]`,
    `${safari} Instagram 340.0.0`,
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0.0 Mobile/15E148 Safari/604.1",
  ])("does not give Safari-only directions to %s", (userAgent) => {
    expect(isIosSafariUserAgent(userAgent)).toBe(false);
  });
});

describe("install prompt policy", () => {
  it("stays off focused routes and pages with persistent action docks", () => {
    expect(isInstallPromptSuppressedPath("/map")).toBe(true);
    expect(isInstallPromptSuppressedPath("/ask")).toBe(true);
    expect(isInstallPromptSuppressedPath("/ask/breakfast")).toBe(true);
    expect(isInstallPromptSuppressedPath("/places/gravel-and-grind-frederick")).toBe(true);
    expect(isInstallPromptSuppressedPath("/events/alive-at-five")).toBe(true);
    expect(isInstallPromptSuppressedPath("/fair")).toBe(true);
    expect(
      isInstallPromptSuppressedPath(
        "/moments/great-frederick-fair-2026",
      ),
    ).toBe(true);
    expect(isInstallPromptSuppressedPath("/places")).toBe(false);
    // /today flipped to suppressed. It was the ONLY focused surface left
    // unprotected, so the panel opened over the landing shelf ten seconds into
    // a first visit, while the person was reading the answer they came for.
    // Installing is still reachable from Saved, Compass and Settings, so what
    // this removes is the interruption, not the capability.
    expect(isInstallPromptSuppressedPath("/today")).toBe(true);
  });
});

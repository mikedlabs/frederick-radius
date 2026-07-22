import { describe, it, expect } from "vitest";
import { plausibleConfig } from "@/lib/analytics";

describe("plausibleConfig — privacy-first, production only", () => {
  it("is null outside production", () => {
    expect(plausibleConfig()).toBeNull();
    expect(plausibleConfig({})).toBeNull();
    expect(plausibleConfig({ production: false })).toBeNull();
    expect(plausibleConfig({ production: false, src: "https://x/js" })).toBeNull();
  });

  it("uses Frederick Radius's current site-specific script by default", () => {
    expect(plausibleConfig({ production: true })).toEqual({
      src: "https://plausible.io/js/pa-wWMBaYS8AxxZglTw8l0Hs.js",
    });
  });

  it("honors the current site-specific or proxied script URL", () => {
    expect(
      plausibleConfig({ production: true, src: "https://plausible.io/js/pa-ABC123.js" }),
    ).toEqual({
      src: "https://plausible.io/js/pa-ABC123.js",
    });
  });

  it("trims whitespace and ignores a blank src override", () => {
    expect(plausibleConfig({ production: true, src: "   " })).toEqual({
      src: "https://plausible.io/js/pa-wWMBaYS8AxxZglTw8l0Hs.js",
    });
  });
});

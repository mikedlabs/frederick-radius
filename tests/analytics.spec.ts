import { describe, it, expect } from "vitest";
import { plausibleConfig } from "@/lib/analytics";

describe("plausibleConfig — privacy-first, off by default", () => {
  it("is null with no domain (inert in dev/preview)", () => {
    expect(plausibleConfig()).toBeNull();
    expect(plausibleConfig({})).toBeNull();
    expect(plausibleConfig({ domain: "" })).toBeNull();
    expect(plausibleConfig({ domain: "   " })).toBeNull();
    expect(plausibleConfig({ domain: null })).toBeNull();
    expect(plausibleConfig({ domain: undefined, src: "https://x/js" })).toBeNull();
  });

  it("uses the hosted script by default when a domain is set", () => {
    expect(plausibleConfig({ domain: "frederickradius.app" })).toEqual({
      src: "https://plausible.io/js/script.js",
      domain: "frederickradius.app",
    });
  });

  it("honors a self-hosted/proxied src for data ownership", () => {
    expect(
      plausibleConfig({ domain: "frederickradius.app", src: "https://frederickradius.app/js/p.js" }),
    ).toEqual({
      src: "https://frederickradius.app/js/p.js",
      domain: "frederickradius.app",
    });
  });

  it("trims whitespace and ignores a blank src override", () => {
    expect(plausibleConfig({ domain: "  frederickradius.app  ", src: "   " })).toEqual({
      src: "https://plausible.io/js/script.js",
      domain: "frederickradius.app",
    });
  });
});

import { describe, expect, it } from "vitest";
import { isBetaExempt } from "./proxy";

describe("beta wall exemptions", () => {
  it.each(["/privacy", "/privacy/", "/terms", "/terms/"])(
    "keeps consent destination %s reachable before unlock",
    (pathname) => {
      expect(isBetaExempt(pathname)).toBe(true);
    },
  );

  it("preserves the existing beta, API, and static-file exemptions", () => {
    expect(isBetaExempt("/beta")).toBe(true);
    expect(isBetaExempt("/api/beta/email")).toBe(true);
    expect(isBetaExempt("/manifest.webmanifest")).toBe(true);
  });

  it("opens the shareable food-truck board and operator surfaces", () => {
    expect(isBetaExempt("/food-trucks")).toBe(true);
    expect(isBetaExempt("/food-trucks/claim")).toBe(true);
    expect(isBetaExempt("/food-trucks/out")).toBe(true);
    expect(
      isBetaExempt(
        "/submit/place",
        new URLSearchParams({ category: "food-truck" }),
      ),
    ).toBe(true);
  });

  it("does not open the general place-submission form", () => {
    expect(isBetaExempt("/submit/place")).toBe(false);
    expect(
      isBetaExempt(
        "/submit/place",
        new URLSearchParams({ category: "coffee" }),
      ),
    ).toBe(false);
  });

  it("opens the NFC tap endpoint so a card can grant its own access", () => {
    expect(isBetaExempt("/j/a3kq-7mtp")).toBe(true);
    expect(isBetaExempt("/j/frederick-market")).toBe(true);
    // The bare /j prefix is only exempt WITH a code segment; there is no /j page.
    expect(isBetaExempt("/j")).toBe(false);
  });

  it("does not open ordinary app routes", () => {
    expect(isBetaExempt("/today")).toBe(false);
    expect(isBetaExempt("/places/privacy-cafe")).toBe(false);
    // Opening the exact public board must not blanket-open future nested pages.
    expect(isBetaExempt("/food-trucks/some-truck")).toBe(false);
  });
});

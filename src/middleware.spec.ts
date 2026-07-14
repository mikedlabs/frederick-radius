import { describe, expect, it } from "vitest";
import { isBetaExempt } from "./middleware";

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

  it("does not open ordinary app routes", () => {
    expect(isBetaExempt("/today")).toBe(false);
    expect(isBetaExempt("/places/privacy-cafe")).toBe(false);
  });
});

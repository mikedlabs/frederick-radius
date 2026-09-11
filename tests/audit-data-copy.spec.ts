import { describe, expect, it } from "vitest";
import { decisionCopyCounts, type CoveragePlace } from "@/lib/quality/coverage";
import { isDirectoryTemplateBlurb } from "../scripts/lib/audit-copy";

describe("audit-data directory-template detection", () => {
  it("does not call a specific sentence ending in a place name a template", () => {
    const place: CoveragePlace = {
      slug: "specific-source-backed-copy",
      name: "Specific Source-Backed Copy",
      short_blurb:
        "House-made pasta and Italian entrees are served in Urbana.",
    };

    // This is the sentence shape the old audit regex misclassified.
    expect(/^[\w &/'-]+ in [\w .'-]+\.$/.test(place.short_blurb ?? "")).toBe(true);
    expect(
      isDirectoryTemplateBlurb(place, decisionCopyCounts([place])),
    ).toBe(false);
  });

  it("still catches the shared release gate's generic directory copy", () => {
    const place: CoveragePlace = {
      slug: "directory-template",
      name: "Directory Template",
      short_blurb: "Restaurants in Frederick. Click here to learn more.",
    };

    expect(
      isDirectoryTemplateBlurb(place, decisionCopyCounts([place])),
    ).toBe(true);
  });
});

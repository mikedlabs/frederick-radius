import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderCandidateReviewSummary,
  reviewCandidate,
} from "../scripts/review-description-candidates";

const ROOT = process.cwd();
const place = (name: string) => ({ slug: "x", name });
const site = { kind: "business_website", url: "https://example.com/" };

describe("description candidate pre-flight", () => {
  it("passes specific, sourced copy in the Radius voice", () => {
    expect(reviewCandidate(
      "bakehouse",
      "Bakehouse makes croissants, pastries, and baked goods from a storefront in Downtown Frederick.",
      place("Bakehouse"),
      site,
    ).flags).toEqual([]);
  });

  it("flags company-wide scope, a missing subject, and missing source evidence", () => {
    expect(reviewCandidate(
      "cloud-jammer",
      "Cloud Jammer sells vape products across multiple locations in Pennsylvania and Maryland.",
      place("Cloud Jammer"),
      site,
    ).flags).toContain("describes the company, not this location");
    expect(reviewCandidate(
      "mackies",
      "Serves Texas-style, slow-smoked barbecue, including baby back ribs and brisket.",
      place("Mackies Southern BBQ"),
      site,
    ).flags).toContain("blurb does not name the place");
    expect(reviewCandidate(
      "bakehouse",
      "Bakehouse makes croissants, pastries, and baked goods from a storefront in Downtown Frederick.",
      place("Bakehouse"),
      undefined,
    ).flags).toContain("no source URL");
  });

  it("applies the existing voice rules", () => {
    const result = reviewCandidate(
      "bakehouse",
      "Bakehouse is a hidden gem nestled in the heart of Downtown Frederick.",
      place("Bakehouse"),
      site,
    );
    expect(result.flags.some((flag) => flag.startsWith("voice:"))).toBe(true);
  });

  it("reports without changing the registry", () => {
    const path = join(ROOT, "src/data/descriptions.json");
    const before = readFileSync(path, "utf8");
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/review-description-candidates.ts"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
    );
    expect(readFileSync(path, "utf8")).toBe(before);
  }, 120_000);
});

describe("description candidate GitHub summary", () => {
  it("separates flagged candidates from the collapsed clean queue", () => {
    const summary = renderCandidateReviewSummary([
      {
        slug: "clean-place",
        name: "Clean Place",
        blurb: "Clean Place serves a specific local specialty in Frederick.",
        flags: [],
      },
      {
        slug: "needs-review",
        name: "Needs Review",
        blurb: "Needs Review has locations nationwide.",
        flags: ["describes the company, not this location"],
      },
    ]);

    expect(summary).toContain("**2 pending:** 1 mechanically clean; 1 need closer review.");
    expect(summary).toContain("| Needs Review | describes the company, not this location |");
    expect(summary).toContain("<summary>1 mechanically clean candidates</summary>");
    expect(summary).toContain("**Clean Place** (`clean-place`)");
    expect(summary).toContain("Every candidate still requires source and editorial review");
  });
});

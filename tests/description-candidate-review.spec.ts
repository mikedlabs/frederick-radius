import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewCandidate } from "../scripts/review-description-candidates";

const ROOT = process.cwd();
const place = (name: string) => ({ slug: "x", name });
const site = { kind: "business_website", url: "https://example.com/" };

/**
 * The pre-flight sorts pending description candidates so an editor reads the
 * judgement calls instead of all 51. Its value depends entirely on the sort
 * being right, and the two ways it can be wrong are opposite:
 *
 *   - flagging good copy, which buries the queue again
 *   - passing a claim the source does not support, which is the whole reason
 *     a human gate exists
 */
describe("description candidate pre-flight", () => {
  it("passes a sourced, specific sentence in the house voice", () => {
    const r = reviewCandidate(
      "bakehouse",
      "Bakehouse makes croissants, pastries, and baked goods from a storefront in Downtown Frederick.",
      place("Bakehouse"),
      site,
    );
    expect(r.flags).toEqual([]);
  });

  /**
   * The regression that made this tool useless on first run. Both parameters
   * of isDescriptionMechanicallySafe and classifyDescription are `string`, so
   * calling them (description, name) instead of (name, description) type-checks
   * cleanly and silently condemns real copy: the blurb gets read as a name and
   * the name as a description, which is under the 25-character floor. It
   * reported 42 of 51 good candidates as scraped directory copy.
   */
  it("does not condemn good copy by reading the name as the description", () => {
    for (const [name, blurb] of [
      ["Colonial Jewelers", "Colonial Jewelers is a fourth-generation Frederick business offering custom jewelry design, engagement and wedding jewelry, and repair services."],
      ["Bentztown", "Bentztown is a restaurant and bar with live music, cocktails, bourbon, and Southern-inspired food."],
      ["BK Juices", "BK Juices serves juices, smoothies, and juice cleanses."],
    ] as const) {
      const r = reviewCandidate("x", blurb, place(name), site);
      expect(r.flags, `${name}: ${r.flags.join(", ")}`).toEqual([]);
    }
  });

  it("flags a sentence describing the company rather than this listing", () => {
    const r = reviewCandidate(
      "cloud-jammer",
      "Cloud Jammer sells vape products including e-juice and accessories across multiple locations in Pennsylvania and Maryland since 2014.",
      place("Cloud Jammer"),
      site,
    );
    expect(r.flags).toContain("describes the company, not this location");
  });

  it("flags copy that never names its subject", () => {
    const r = reviewCandidate(
      "mackies",
      "Serves Texas-style, slow-smoked barbecue, including baby back ribs and brisket.",
      place("Mackies Southern BBQ"),
      site,
    );
    expect(r.flags).toContain("blurb does not name the place");
  });

  it("applies the repo's own voice lint, not a second opinion", () => {
    const r = reviewCandidate(
      "x",
      "Bakehouse is a hidden gem nestled in the heart of Downtown Frederick.",
      place("Bakehouse"),
      site,
    );
    expect(r.flags.some((f) => f.startsWith("voice:"))).toBe(true);
  });

  it("flags an unsourced candidate", () => {
    const r = reviewCandidate(
      "x",
      "Bakehouse makes croissants, pastries, and baked goods from a storefront in Downtown Frederick.",
      place("Bakehouse"),
      undefined,
    );
    expect(r.flags).toContain("no source url");
  });

  /**
   * The pre-flight is read-only. It first shipped importing a helper from
   * build-description-candidates.ts, whose bare `main()` call ran the whole
   * generator on import and wrote three new candidates into the registry -
   * a reporting command silently mutating reviewed data.
   */
  it("reports without touching the registry", () => {
    const path = join(ROOT, "src/data/descriptions.json");
    const before = readFileSync(path, "utf8");
    execFileSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/review-description-candidates.ts"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    expect(readFileSync(path, "utf8")).toBe(before);
  }, 120_000);
});

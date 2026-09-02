import { describe, expect, it } from "vitest";
import {
  enrichPlacesLiveCommand,
  type EnrichPlacesCommandScope,
} from "../scripts/lib/enrich-places-command";

const DEFAULT_SCOPE: EnrichPlacesCommandScope = {
  slugs: null,
  needsEnrichment: false,
  dfpThin: false,
  all: false,
};

describe("enrich places reviewed live command", () => {
  it.each([
    {
      scope: DEFAULT_SCOPE,
      expected: "npm run enrich -- --live --confirm --limit 7",
    },
    {
      scope: { ...DEFAULT_SCOPE, slugs: ["gravel-and-grind", "cafe-nola"] },
      expected:
        "npm run enrich -- --slug gravel-and-grind,cafe-nola --live --confirm --limit 7",
    },
    {
      scope: { ...DEFAULT_SCOPE, needsEnrichment: true },
      expected:
        "npm run enrich -- --needs-enrichment --live --confirm --limit 7",
    },
    {
      scope: { ...DEFAULT_SCOPE, dfpThin: true },
      expected: "npm run enrich -- --dfp-thin --live --confirm --limit 7",
    },
    {
      scope: { ...DEFAULT_SCOPE, all: true },
      expected: "npm run enrich -- --all --live --confirm --limit 7",
    },
  ])("preserves the reviewed $expected scope", ({ scope, expected }) => {
    expect(enrichPlacesLiveCommand(scope, 7)).toBe(expected);
  });

  it("refuses conflicting scopes instead of printing a broader command", () => {
    expect(() =>
      enrichPlacesLiveCommand(
        { ...DEFAULT_SCOPE, needsEnrichment: true, all: true },
        7,
      ),
    ).toThrow("exactly one reviewed scope");
  });
});

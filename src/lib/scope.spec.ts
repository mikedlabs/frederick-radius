import { describe, expect, it } from "vitest";
import {
  parseScope,
  scopeTownSlug,
  scopeToParam,
  scopeCentroid,
  scopeLabel,
  scopeInSentence,
  effectiveOriginSlug,
  resolveServerTownRankingContext,
  resolveDecisionContext,
  NEAR_ME_BENEFIT,
  WHOLE_COUNTY_LABEL,
  type Scope,
} from "./scope";

describe("parseScope", () => {
  it("accepts the two non-town scopes", () => {
    expect(parseScope("nearme")).toBe("nearme");
    expect(parseScope("county")).toBe("county");
    expect(parseScope("NearMe")).toBe("nearme"); // case-insensitive
  });

  it("accepts a bare slug or the town: form, validated against the muni set", () => {
    expect(parseScope("brunswick")).toBe("town:brunswick");
    expect(parseScope("town:brunswick")).toBe("town:brunswick");
    expect(parseScope("frederick")).toBe("town:frederick"); // Downtown Frederick
  });

  it("degrades an unknown or empty slug to null (stale link != broken filter)", () => {
    expect(parseScope("town:atlantis")).toBeNull();
    expect(parseScope("gotham")).toBeNull();
    expect(parseScope("")).toBeNull();
    expect(parseScope(null)).toBeNull();
    expect(parseScope(undefined)).toBeNull();
  });

  it("rejects inherited object keys instead of treating them as towns", () => {
    expect(parseScope("constructor")).toBeNull();
    expect(parseScope("town:constructor")).toBeNull();
    expect(parseScope("__proto__")).toBeNull();
    expect(parseScope("toString")).toBeNull();
  });
});

describe("scope helpers", () => {
  it("scopeTownSlug pulls the slug only from a town scope", () => {
    expect(scopeTownSlug("town:thurmont")).toBe("thurmont");
    expect(scopeTownSlug("nearme")).toBeNull();
    expect(scopeTownSlug("county")).toBeNull();
    expect(scopeTownSlug(null)).toBeNull();
  });

  it("scopeToParam round-trips through parseScope", () => {
    for (const raw of ["nearme", "county", "brunswick"]) {
      const s = parseScope(raw)!;
      expect(parseScope(scopeToParam(s))).toBe(s);
    }
    expect(scopeToParam("town:middletown")).toBe("middletown");
  });

  it("scopeCentroid resolves a town point, null otherwise", () => {
    const c = scopeCentroid("town:frederick");
    expect(c).not.toBeNull();
    expect(typeof c!.lat).toBe("number");
    expect(scopeCentroid("county")).toBeNull();
    expect(scopeCentroid("nearme")).toBeNull();
  });

  it("scopeLabel reads the muni name for towns", () => {
    expect(scopeLabel("nearme")).toBe("Near me");
    expect(scopeLabel("county")).toBe("Whole county");
    expect(scopeLabel("town:frederick")).toBe("Frederick City");
  });

  it("labels an unset or unknown scope with the contract's Whole county", () => {
    // The contract names only Near me, Whole county, or a town. An unset
    // lens used to fall back to "Frederick County" here and to "Frederick,
    // MD" in the header chip, which read as a fourth choice.
    expect(scopeLabel(null)).toBe(WHOLE_COUNTY_LABEL);
    expect(scopeLabel("town:atlantis" as Scope)).toBe(WHOLE_COUNTY_LABEL);
    expect(WHOLE_COUNTY_LABEL).toBe("Whole county");
    expect(resolveDecisionContext({}).label).toBe(WHOLE_COUNTY_LABEL);
    expect(resolveDecisionContext({ scopeRaw: "county" }).label).toBe(
      WHOLE_COUNTY_LABEL,
    );
  });
});

describe("NEAR_ME_BENEFIT", () => {
  it("explains the benefit in complete sentences without promising a prompt", () => {
    expect(NEAR_ME_BENEFIT).not.toMatch(/[–—]/);
    const sentences = NEAR_ME_BENEFIT.split(/(?<=\.)\s+/);
    expect(sentences).toHaveLength(2);
    for (const sentence of sentences) expect(sentence).toMatch(/^[A-Z].*\.$/);
    // A browser that already trusts the site does not ask again, so the
    // copy may not claim that it always will.
    expect(NEAR_ME_BENEFIT).toMatch(/\bmay ask\b/);
  });
});

describe("effectiveOriginSlug (server rank resolution)", () => {
  it("an explicit town scope wins over home", () => {
    expect(effectiveOriginSlug("town:brunswick", "thurmont")).toBe("brunswick");
    expect(effectiveOriginSlug("brunswick", "thurmont")).toBe("brunswick");
  });

  it("an explicit county scope forces county-wide, ignoring home", () => {
    expect(effectiveOriginSlug("county", "thurmont")).toBeNull();
  });

  it("nearme has no server centroid, so it falls through to home", () => {
    expect(effectiveOriginSlug("nearme", "thurmont")).toBe("thurmont");
  });

  it("no scope falls back to a validated home muni, else null", () => {
    expect(effectiveOriginSlug(null, "middletown")).toBe("middletown");
    expect(effectiveOriginSlug(null, "atlantis")).toBeNull();
    expect(effectiveOriginSlug(null, null)).toBeNull();
    expect(effectiveOriginSlug(null, "constructor")).toBeNull();
    expect(effectiveOriginSlug(null, "__proto__")).toBeNull();
  });
});

describe("resolveServerTownRankingContext", () => {
  it("turns an explicitly selected town into an origin and hard boundary", () => {
    expect(
      resolveServerTownRankingContext("town:walkersville", "frederick"),
    ).toEqual({
      originMunicipality: "walkersville",
      filterMunicipality: "walkersville",
      source: "town",
    });
  });

  it("uses a saved home only as a ranking origin", () => {
    expect(resolveServerTownRankingContext(null, "walkersville")).toEqual({
      originMunicipality: "walkersville",
      filterMunicipality: null,
      source: "home",
    });
    expect(
      resolveServerTownRankingContext("nearme", "walkersville"),
    ).toEqual({
      originMunicipality: "walkersville",
      filterMunicipality: null,
      source: "home",
    });
  });

  it("lets an explicit county scope suppress the home fallback", () => {
    expect(
      resolveServerTownRankingContext("county", "walkersville"),
    ).toEqual({
      originMunicipality: null,
      filterMunicipality: null,
      source: "county",
    });
  });
});

describe("resolveDecisionContext", () => {
  it("lets an explicit town outrank a device fix and IP fallback", () => {
    const ctx = resolveDecisionContext({
      scopeRaw: "town:thurmont",
      deviceOrigin: { lng: -77.41, lat: 39.41 },
      approximateOrigin: { lng: -77.63, lat: 39.31 },
    });
    expect(ctx.source).toBe("town");
    expect(ctx.filterMunicipality).toBe("thurmont");
    expect(ctx.label).toBe("Thurmont");
    expect(ctx.canShowDistance).toBe(false);
  });

  it("makes whole-county scope independent of device/IP location", () => {
    const ctx = resolveDecisionContext({
      scopeRaw: "county",
      deviceOrigin: { lng: -77.41, lat: 39.41 },
    });
    expect(ctx).toMatchObject({ source: "county", origin: null, label: "Whole county" });
  });

  it("allows distance copy only for a real device fix", () => {
    const ctx = resolveDecisionContext({ deviceOrigin: { lng: -77.41, lat: 39.41 } });
    expect(ctx).toMatchObject({ source: "device", canShowDistance: true, label: "Near you" });
  });

  it("labels a rejected out-of-county network fallback", () => {
    const ctx = resolveDecisionContext({ approximateStatus: "outside-county" });
    expect(ctx).toMatchObject({
      source: "none",
      label: "Whole county",
      fallbackReason: "outside-county",
    });
  });
});

describe("scopeInSentence", () => {
  it("converts the chip labels to mid-sentence form", () => {
    expect(scopeInSentence("Whole county")).toBe("the whole county");
    expect(scopeInSentence("Near me")).toBe("near you");
  });

  it("passes town names through untouched", () => {
    expect(scopeInSentence("Middletown")).toBe("Middletown");
    expect(scopeInSentence("Frederick County")).toBe("Frederick County");
  });
});

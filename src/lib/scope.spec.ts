import { describe, expect, it } from "vitest";
import {
  parseScope,
  scopeTownSlug,
  scopeToParam,
  scopeCentroid,
  scopeLabel,
  scopeInSentence,
  effectiveOriginSlug,
  resolveDecisionContext,
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
    expect(scopeLabel(null)).toBe("Frederick County");
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

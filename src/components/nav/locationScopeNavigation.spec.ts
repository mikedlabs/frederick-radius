import { describe, expect, it } from "vitest";
import { locationScopeHref } from "./locationScopeNavigation";

describe("shared location refinement", () => {
  it("changes Tonight's town in place even without an existing area parameter", () => {
    const href = locationScopeHref("https://example.test/today/tonight?intent=pizza#choices", "town:brunswick")!;
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/today/tonight");
    expect(url.searchParams.get("intent")).toBe("pizza");
    expect(url.searchParams.get("in")).toBe("brunswick");
    expect(url.hash).toBe("#choices");
    expect(locationScopeHref("https://example.test/today/tonight?intent=drinks&in=brunswick", "county"))
      .toBe("/today/tonight?intent=drinks&in=county");
  });
  it("updates explicit town while keeping intent, result filters, and source return", () => {
    const href = locationScopeHref("https://example.test/search?q=free+events+tonight+in+Brunswick&in=brunswick&kind=event&returnTo=%2Fmap%3Fc%3D1%2C2%2C3", "town:thurmont")!;
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("q")).toBe("free events tonight");
    expect(params.get("in")).toBe("thurmont");
    expect(params.get("kind")).toBe("event");
    expect(params.get("returnTo")).toBe("/map?c=1,2,3");
  });
  it("writes explicit county instead of reviving a stored town, preserving live map state", () => {
    const href = locationScopeHref("https://example.test/map?q=coffee&in=brunswick&c=-77.6,39.3,13&layers=parks#map", "county")!;
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("in")).toBe("county");
    expect(url.searchParams.get("c")).toBe("-77.6,39.3,13");
    expect(url.searchParams.get("q")).toBe("coffee");
    expect(url.hash).toBe("#map");
  });
  it("keeps a detail page's stable route when it has no explicit area", () => {
    expect(locationScopeHref("https://example.test/places/cafe-nola?returnTo=%2Fsearch", "town:brunswick")).toBeNull();
  });
});

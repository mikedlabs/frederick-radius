import { describe, expect, it } from "vitest";
import { placePlanHref, updatedPlanHref } from "./plan-journey";

const base = "https://frederickradius.app";

describe("place to outing continuity", () => {
  it("keeps the search, municipality, and nested map camera as the return journey", () => {
    const map = "/map?in=brunswick&c=-77.626,39.313,13.2&layers=parks&q=coffee";
    const search = `/search?q=coffee&in=brunswick&returnTo=${encodeURIComponent(map)}`;
    const detail = new URL(`/places/beans?returnTo=${encodeURIComponent(search)}`, base);
    const next = new URL(placePlanHref("beans", detail, "county"), base);
    expect(next.pathname).toBe("/plan");
    expect(next.searchParams.get("place")).toBe("beans");
    expect(next.searchParams.get("in")).toBe("brunswick");
    expect(next.searchParams.get("returnTo")).toBe(search);
  });

  it("preserves the actual county scope instead of narrowing to the selected place's town", () => {
    const next = new URL(placePlanHref("beans", new URL("/map?in=county&q=coffee", base), "town:frederick"), base);
    expect(next.searchParams.get("in")).toBe("county");
  });

  it("retains a safe journey on edits and start-over without keeping the seed place", () => {
    const current = new URL("/plan?place=beans&in=brunswick&returnTo=%2Fsearch%3Fq%3Dcoffee%26in%3Dbrunswick", base);
    const next = new URL(updatedPlanHref(current, "edited-plan"), base);
    expect(next.searchParams.get("p")).toBe("edited-plan");
    expect(next.searchParams.has("place")).toBe(false);
    expect(next.searchParams.get("in")).toBe("brunswick");
    expect(next.searchParams.get("returnTo")).toBe("/search?q=coffee&in=brunswick");
    const reset = new URL(updatedPlanHref(next), base);
    expect(reset.searchParams.has("p")).toBe(false);
    expect(reset.searchParams.get("returnTo")).toBe(next.searchParams.get("returnTo"));
  });

  it.each(["https://evil.test/map", "//evil.test/map", "/api/private", "/places/other", "/%2f%2fevil.test/map"])("rejects unsafe planner return %s", (returnTo) => {
    const current = new URL(`/plan?returnTo=${encodeURIComponent(returnTo)}&in=unknown`, base);
    expect(updatedPlanHref(current, "token")).toBe("/plan?p=token");
    const detail = new URL(`/places/beans?returnTo=${encodeURIComponent(returnTo)}`, base);
    expect(new URL(placePlanHref("beans", detail), base).searchParams.has("returnTo")).toBe(false);
  });
});

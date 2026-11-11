// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { commitLocationScope, locationScopeHref } from "./locationScopeNavigation";
import { getScope, SCOPE_CHANGE_EVENT, setScope } from "@/lib/scope";

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
  it("rewrites Today's area in place and keeps its section hash", () => {
    expect(locationScopeHref("https://example.test/today?in=thurmont&view=week#today-discovery", "county"))
      .toBe("/today?in=county&view=week#today-discovery");
    expect(locationScopeHref("https://example.test/today#today-saved", "nearme"))
      .toBe("/today?in=nearme#today-saved");
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

describe("the one area writer", () => {
  afterEach(() => { setScope(null); history.replaceState(null, "", "/"); vi.restoreAllMocks(); });
  const transport = () => ({ replace: vi.fn(), refresh: vi.fn() });

  it.each(["/today", "/map"])("stores the area before rewriting %s through native history", (path) => {
    history.replaceState(null, "", `${path}?in=thurmont&view=week#today-discovery`);
    const router = transport();
    const seen: string[] = [];
    const onChange = () => seen.push(window.location.search);
    window.addEventListener(SCOPE_CHANGE_EVENT, onChange);
    commitLocationScope("county", router);
    window.removeEventListener(SCOPE_CHANGE_EVENT, onChange);
    // Listeners such as the map camera see the new area while the URL is old.
    expect(seen).toEqual(["?in=thurmont&view=week"]);
    expect(getScope()).toBe("county");
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`)
      .toBe(`${path}?in=county&view=week#today-discovery`);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("keeps the current entry's own history state when it rewrites the map's area", () => {
    history.replaceState({ focus: "baker-park", layer: "parking" }, "", "/map?in=thurmont&layers=parking");
    commitLocationScope("county", transport());
    expect(window.location.search).toBe("?in=county&layers=parking");
    expect(history.state).toEqual({ focus: "baker-park", layer: "parking" });
  });
  it("replaces other scoped routes through the router without scrolling", () => {
    history.replaceState(null, "", "/events?in=thurmont&lens=week");
    const router = transport();
    commitLocationScope("town:brunswick", router);
    expect(getScope()).toBe("town:brunswick");
    expect(router.replace).toHaveBeenCalledWith("/events?in=brunswick&lens=week", { scroll: false });
    expect(window.location.search).toBe("?in=thurmont&lens=week");
  });
  it("refreshes a page without an area in its address", () => {
    history.replaceState(null, "", "/my-radius");
    const router = transport();
    commitLocationScope("nearme", router);
    expect(getScope()).toBe("nearme");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/my-radius");
  });
});

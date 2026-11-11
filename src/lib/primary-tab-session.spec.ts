// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cancelPrimaryTabResume, consumePrimaryTabResume, normalizePrimaryTabHref, preparePrimaryTabResume,
  PRIMARY_TAB_SESSION_KEY, readResumedEventsTabView, readResumedMapTabView, rememberEventsTabView, rememberMapTabView, rememberPrimaryTab } from "./primary-tab-session";
import { setScope } from "./scope";

const now = 1_800_000_000_000;
beforeEach(() => { sessionStorage.clear(); cancelPrimaryTabResume(); setScope(null); });

describe("bounded primary-tab session memory", () => {
  it.each(["https://evil.invalid/events", "//evil.invalid/map", "/events/concert", "/places/cafe", "/admin", "/auth", "/events/../map",
    "/events?returnTo=%2Ftoday", "/map?token=private", "/my-radius?notes=private", "/map%2fdetail", "/map\\evil"])("rejects unsafe or non-root input %s", raw => {
    expect(normalizePrimaryTabHref(raw)).toBeNull();
  });
  it("keeps known browse filters/camera, excludes free text/private unknown fields and unsafe fragments", () => {
    expect(normalizePrimaryTabHref("/map?in=frederick&c=-77.4105%2C39.4143%2C13.40&place=carillon&q=private+search&extra=private#private-note"))
      .toBe("/map?in=frederick&c=-77.4105%2C39.4143%2C13.40&place=carillon");
    expect(normalizePrimaryTabHref("/events?in=brunswick&lens=weekend&cats=music%2Carts&kids=true#events-heading"))
      .toBe("/events?in=brunswick&lens=weekend&cats=music%2Carts&kids=true#events-heading");
    expect(normalizePrimaryTabHref("/map?c=NaN,39,13")).toBe("/map");
    expect(normalizePrimaryTabHref("/map?c=-77,39,99")).toBe("/map");
    expect(normalizePrimaryTabHref("/events?in=frederick&in=county")).toBeNull();
  });
  it("never remembers the legacy town parameter", () => {
    expect(normalizePrimaryTabHref("/events?m=thurmont&lens=weekend")).toBe("/events?lens=weekend");
    expect(normalizePrimaryTabHref("/map?m=thurmont&layers=parks")).toBe("/map?layers=parks");
  });
  it("resumes an unchanged area exactly, including the map camera", () => {
    setScope("town:thurmont");
    const map = "/map?in=thurmont&layers=parks&c=-77.4%2C39.6%2C13&place=cunningham-falls";
    rememberPrimaryTab(map, 0, undefined, now);
    rememberPrimaryTab("/events?in=thurmont&lens=weekend", 300, undefined, now);
    expect(preparePrimaryTabResume("/map", undefined, now + 1)).toEqual({ href: map, scrollY: 0, at: now + 1, scope: "town:thurmont" });
    expect(preparePrimaryTabResume("/events", undefined, now + 2)?.href).toBe("/events?in=thurmont&lens=weekend");
  });
  it("rebases every tab onto the area chosen since it was left instead of reviving the old one", () => {
    setScope("town:thurmont");
    rememberPrimaryTab("/today?in=thurmont&view=week", 120, undefined, now);
    rememberPrimaryTab("/events?in=thurmont&lens=weekend&kids=true", 300, undefined, now);
    rememberPrimaryTab("/map?in=thurmont&layers=parking&c=-77.41%2C39.41%2C14&area=thurmont%2C-77.5%2C39.6%2C-77.3%2C39.7&place=baker-park", 0, undefined, now);
    setScope("county");
    expect(preparePrimaryTabResume("/today", undefined, now + 1)).toEqual({ href: "/today?in=county&view=week", scrollY: 120, at: now + 1, scope: "county" });
    // The area keeps its position so the Events URL writer leaves the address alone.
    expect(preparePrimaryTabResume("/events", undefined, now + 2)?.href).toBe("/events?in=county&lens=weekend&kids=true");
    // The old camera, task area and focused place belonged to Thurmont.
    expect(preparePrimaryTabResume("/map", undefined, now + 3)?.href).toBe("/map?in=county&layers=parking");
    expect(consumePrimaryTabResume("/today?in=thurmont&view=week", undefined, now + 4)).toBeNull();
    setScope(null);
    expect(preparePrimaryTabResume("/events", undefined, now + 5)?.href).toBe("/events?lens=weekend&kids=true");
  });
  it("brings back a shared link's own town and camera when the area was never changed", () => {
    // A first visit from a shared map link: the map shows the link's town
    // without adopting it, so the shared area is still unset on return.
    rememberPrimaryTab("/map?in=brunswick&c=-77.6%2C39.3%2C14", 0, undefined, now);
    expect(preparePrimaryTabResume("/map", undefined, now + 1)?.href).toBe("/map?in=brunswick&c=-77.6%2C39.3%2C14");
    // Changing the area afterwards replaces that town and drops its camera.
    rememberPrimaryTab("/map?in=brunswick&c=-77.6%2C39.3%2C14", 0, undefined, now + 2);
    setScope("town:thurmont");
    expect(preparePrimaryTabResume("/map", undefined, now + 3)?.href).toBe("/map?in=thurmont");
  });
  it("treats never choosing an area and choosing Whole county as the same area", () => {
    rememberPrimaryTab("/map?c=-77.4%2C39.4%2C12&layers=parking", 0, undefined, now);
    // Reset on Events and the header's Whole county row both store "county".
    setScope("county");
    expect(preparePrimaryTabResume("/map", undefined, now + 1)?.href).toBe("/map?c=-77.4%2C39.4%2C12&layers=parking");
  });
  it("does not resume a stored snapshot without a valid recorded area", () => {
    sessionStorage.setItem(PRIMARY_TAB_SESSION_KEY, JSON.stringify({
      "/events": { href: "/events?in=thurmont", scrollY: 12, at: now },
      "/today": { href: "/today", scrollY: 12, at: now, scope: "town:atlantis" },
    }));
    expect(preparePrimaryTabResume("/events", undefined, now + 1)).toBeNull();
    expect(preparePrimaryTabResume("/today", undefined, now + 1)).toBeNull();
  });
  it("stores only four bounded current root snapshots and creates a one-use exact resume intent", () => {
    for (const root of ["/today", "/map", "/events", "/my-radius"]) rememberPrimaryTab(root, 412, undefined, now);
    rememberPrimaryTab("/events/detail", 999, undefined, now);
    expect(Object.keys(JSON.parse(sessionStorage.getItem(PRIMARY_TAB_SESSION_KEY)!))).toHaveLength(4);
    const resumed = preparePrimaryTabResume("/events", undefined, now + 1);
    expect(resumed).toEqual({ href: "/events", scrollY: 412, at: now + 1, scope: null });
    expect(consumePrimaryTabResume("/events?in=county", undefined, now + 2)).toBeNull();
    expect(consumePrimaryTabResume("/events", undefined, now + 3)).toBeNull();
    preparePrimaryTabResume("/events", undefined, now + 4);
    expect(consumePrimaryTabResume("/events", undefined, now + 5)?.scrollY).toBe(412);
    expect(consumePrimaryTabResume("/events", undefined, now + 6)).toBeNull();
  });
  it("does not resume expired, corrupted or future memory", () => {
    rememberPrimaryTab("/events", 412, undefined, now);
    expect(preparePrimaryTabResume("/events", undefined, now + 13 * 60 * 60_000)).toBeNull();
    expect(preparePrimaryTabResume("/events", undefined, now - 1)).toBeNull();
    sessionStorage.setItem(PRIMARY_TAB_SESSION_KEY, "broken-json");
    expect(preparePrimaryTabResume("/events", undefined, now)).toBeNull();
    rememberPrimaryTab("/events", 412, undefined, now); preparePrimaryTabResume("/events", undefined, now);
    expect(consumePrimaryTabResume("/events", undefined, now + 30_001)).toBeNull();
  });
  it("never carries unknown stored fields into a newly written session snapshot", () => {
    sessionStorage.setItem(PRIMARY_TAB_SESSION_KEY, JSON.stringify({ "/events": { href: "/events", scrollY: 12, at: now, notes: "private-account-note" } }));
    rememberPrimaryTab("/today", 0, undefined, now + 1);
    expect(sessionStorage.getItem(PRIMARY_TAB_SESSION_KEY)).not.toContain("private-account-note");
  });
  it("keeps a useful document fallback when session storage is unavailable", () => {
    const unavailable = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
    setScope("town:frederick");
    rememberPrimaryTab("/map?in=frederick", 225, unavailable, now);
    expect(preparePrimaryTabResume("/map", unavailable, now + 1)?.href).toBe("/map?in=frederick");
    expect(consumePrimaryTabResume("/map?in=frederick", unavailable, now + 2)?.scrollY).toBe(225);
  });
  it("restores Events text/view only on an explicit exact tab return, never serializing the text", () => {
    const href = "/events?in=frederick&lens=weekend";
    const view = { q: "private@example.test personal search", view: "calendar" as const };
    setScope("town:frederick");
    rememberPrimaryTab(href, 540, undefined, now); rememberEventsTabView(href, view, now);
    expect(readResumedEventsTabView(href, now)).toBeNull();
    preparePrimaryTabResume("/events", undefined, now + 1);
    expect(readResumedEventsTabView(href, now + 2)).toEqual(view);
    consumePrimaryTabResume(href, undefined, now + 3);
    consumePrimaryTabResume(href, undefined, now + 4); // Strict Mode replay retains the same admission.
    expect(readResumedEventsTabView(href, now + 5)).toEqual(view);
    expect(readResumedEventsTabView("/events?in=county", now + 5)).toBeNull();
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(view.q);
    cancelPrimaryTabResume(); expect(readResumedEventsTabView(href, now + 6)).toBeNull();
  });
  it("keeps private Events and Map text with the view when the area was changed elsewhere", () => {
    setScope("town:thurmont");
    const events = "/events?in=thurmont&lens=weekend";
    const map = "/map?in=thurmont&layers=parks&c=-77.4%2C39.6%2C13";
    rememberPrimaryTab(events, 0, undefined, now); rememberEventsTabView(events, { q: "jazz", view: "compact" }, now);
    rememberPrimaryTab(`${map}&q=trails`, 0, undefined, now);
    setScope("county");
    preparePrimaryTabResume("/events", undefined, now + 1);
    expect(readResumedEventsTabView("/events?in=county&lens=weekend", now + 2)).toEqual({ q: "jazz", view: "compact" });
    expect(readResumedEventsTabView(events, now + 2)).toBeNull();
    preparePrimaryTabResume("/map", undefined, now + 3);
    expect(readResumedMapTabView("/map?in=county&layers=parks", now + 4)).toEqual({ q: "trails" });
  });
  it("preserves supported map camera/layers/tasks while handing search back only in document memory", () => {
    const href = "/map?in=frederick&layers=parks&task=outside&area=frederick%2C-77.5%2C39.3%2C-77.3%2C39.5&c=-77.4%2C39.4%2C13";
    setScope("town:frederick");
    rememberPrimaryTab(`${href}&q=private%40example.test`, 125, undefined, now);
    expect(readResumedMapTabView(href, now)).toBeNull();
    expect(preparePrimaryTabResume("/map", undefined, now + 1)?.href).toBe(href);
    expect(readResumedMapTabView(href, now + 2)).toEqual({ q: "private@example.test" });
    consumePrimaryTabResume(href, undefined, now + 3);
    expect(readResumedMapTabView(href, now + 4)).toEqual({ q: "private@example.test" });
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("private");
    expect(readResumedMapTabView("/map?in=county", now + 4)).toBeNull();
    cancelPrimaryTabResume(); expect(readResumedMapTabView(href, now + 5)).toBeNull();
  });
  it("admits only the exact private Map query committed before the scroll effect, including newer unsubmitted typing", () => {
    const href = "/map?in=frederick&layers=parks";
    setScope("town:frederick");
    rememberPrimaryTab(`${href}&q=old`, 125, undefined, now);
    rememberMapTabView(`${href}&q=old`, { q: "latest phrase" }, now + 1, { pendingUrlWrite: true });
    rememberPrimaryTab(`${href}&q=old`, 125, undefined, now + 2);
    preparePrimaryTabResume("/map", undefined, now + 3);
    expect(readResumedMapTabView(href, now + 4)).toEqual({ q: "latest phrase" });
    expect(consumePrimaryTabResume(`${href}&q=latest+phrase`, undefined, now + 5)?.scrollY).toBe(125);
    consumePrimaryTabResume(`${href}&q=latest+phrase`, undefined, now + 6);
    expect(readResumedMapTabView(`${href}&q=latest+phrase`, now + 7)).toEqual({ q: "latest phrase" });
    expect(readResumedMapTabView(`${href}&q=different`, now + 7)).toBeNull();
    expect(JSON.stringify({ ...sessionStorage })).not.toMatch(/latest|phrase|old/);
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cancelPrimaryTabResume, consumePrimaryTabResume, normalizePrimaryTabHref, preparePrimaryTabResume,
  PRIMARY_TAB_SESSION_KEY, readResumedEventsTabView, readResumedMapTabView, rememberEventsTabView, rememberMapTabView, rememberPrimaryTab } from "./primary-tab-session";

const now = 1_800_000_000_000;
beforeEach(() => { sessionStorage.clear(); cancelPrimaryTabResume(); });

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
  it("stores only four bounded current root snapshots and creates a one-use exact resume intent", () => {
    for (const root of ["/today", "/map", "/events", "/my-radius"]) rememberPrimaryTab(root, 412, undefined, now);
    rememberPrimaryTab("/events/detail", 999, undefined, now);
    expect(Object.keys(JSON.parse(sessionStorage.getItem(PRIMARY_TAB_SESSION_KEY)!))).toHaveLength(4);
    const resumed = preparePrimaryTabResume("/events", undefined, now + 1);
    expect(resumed).toEqual({ href: "/events", scrollY: 412, at: now + 1 });
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
    rememberPrimaryTab("/map?in=frederick", 225, unavailable, now);
    expect(preparePrimaryTabResume("/map", unavailable, now + 1)?.href).toBe("/map?in=frederick");
    expect(consumePrimaryTabResume("/map?in=frederick", unavailable, now + 2)?.scrollY).toBe(225);
  });
  it("restores Events text/view only on an explicit exact tab return, never serializing the text", () => {
    const href = "/events?in=frederick&lens=weekend";
    const view = { q: "private@example.test personal search", view: "calendar" as const };
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
  it("preserves supported map camera/layers/tasks while handing search back only in document memory", () => {
    const href = "/map?in=frederick&layers=parks&task=outside&area=frederick%2C-77.5%2C39.3%2C-77.3%2C39.5&c=-77.4%2C39.4%2C13";
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

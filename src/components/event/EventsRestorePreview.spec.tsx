// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventsRestorePreview, { eventsForRestorePreview } from "./EventsRestorePreview";

const NOW = "2030-04-18T16:00:00.000Z";
function event(slug = "preview-concert", overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug, title: `Declared ${slug}`, description: "Offline preview fixture.",
    starts_at: "2030-04-18T22:00:00.000Z", ends_at: "2030-04-19T00:00:00.000Z", timezone: "America/New_York",
    venue_name: "Baker Park", address: "121 N Bentz St", municipality: "frederick", municipality_name: "Frederick",
    category: "music", category_name: "Music", audience: [], is_free: true, geom: { lat: 39.42, lng: -77.42 }, geo_confidence: "exact_address",
    source: "manual", source_id: slug, source_url: "https://example.test/event", license: "Declared fixture",
    is_verified: false, confidence: "curated", first_seen_at: NOW, last_verified_at: NOW, ...overrides,
  };
}
function render(events = [event()], degraded = false, nowISO = NOW) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<EventsRestorePreview events={events} nowISO={nowISO} degraded={degraded} />);
  return container;
}
afterEach(() => { vi.useRealTimers(); localStorage.clear(); document.cookie = "fr_scope=; path=/; max-age=0"; history.replaceState(null, "", "/"); });

describe("public restore-preview server HTML", () => {
  it("contains usable canonical anchors before effects or client JavaScript, with honest countywide scope", () => {
    const root = render();
    const preview = root.querySelector("[data-events-restore-preview]")!;
    expect(preview.hasAttribute("data-events-restoring-view")).toBe(true);
    expect(preview.querySelector("h1")?.textContent).toBe("County calendar preview");
    expect(preview.textContent).toContain("Radius is restoring your town, time, and event filters.");
    expect(preview.textContent).toContain("These countywide listings may be outside your selected view.");
    const link = preview.querySelector<HTMLAnchorElement>("a[data-events-preview-link]")!;
    expect(link.getAttribute("href")).toBe("/events/preview-concert");
    expect(link.closest("[hidden],[inert],[aria-hidden='true']")).toBeNull();
    expect(link.querySelector("h2")?.textContent).toBe("Declared preview-concert");
    expect(link.querySelector("time")?.getAttribute("datetime")).toBe("2030-04-18T22:00:00.000Z");
    expect(link.querySelector("[data-events-preview-time]")?.textContent).toContain("6:00 PM–8:00 PM");
    expect(link.querySelector("[data-events-preview-location]")?.textContent).toBe("Baker Park · Frederick");
    expect(root.querySelector("button,input,select,script,img,[data-save-ref]")).toBeNull();
    expect(root.querySelector("a a,a button")).toBeNull();
    expect(root.textContent).not.toMatch(/Happening now|Ranked near you|event listings shown|No upcoming events/);
  });
  it("caps the existing public rows at three, preserves order and leaves its input unchanged", () => {
    const events = ["one", "two", "three", "four"].map(slug => Object.freeze(event(slug)));
    const before = JSON.stringify(events);
    expect(eventsForRestorePreview(Object.freeze(events), NOW).map(row => row.slug)).toEqual(["one", "two", "three"]);
    expect(render(events).querySelectorAll("a[data-events-preview-link]")).toHaveLength(3);
    expect(JSON.stringify(events)).toBe(before);
  });
  it("does not replay URL filters, remembered scope, or local private data into shared server HTML", () => {
    const before = render().innerHTML;
    history.replaceState(null, "", "/events?in=thurmont&lens=weekend&free=1&q=private-search");
    localStorage.setItem("fr_scope", "town:brunswick"); document.cookie = "fr_scope=town%3Abrunswick; path=/";
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "event", id: "private-save" }]));
    expect(render().innerHTML).toBe(before);
    expect(before).not.toMatch(/private-search|private-save|Brunswick|Thurmont/);
  });
  it("uses the server clock for stable HTML rather than the current device time", () => {
    const before = render().innerHTML;
    vi.useFakeTimers(); vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
    expect(render().innerHTML).toBe(before);
  });
  it("skips ended, invalid and duplicate canonical rows before applying the cap", () => {
    const ended = event("ended", { starts_at: "2030-04-17T18:00:00Z", ends_at: "2030-04-17T20:00:00Z" });
    const invalid = event("invalid", { starts_at: "not-a-date" });
    const unsafe = event("constructor");
    const source = [ended, invalid, unsafe, event("same"), event("same"), event("next")];
    expect(eventsForRestorePreview(source, NOW).map(row => row.slug)).toEqual(["same", "next"]);
  });
  it("keeps valid ongoing ranges until their published end without inventing daily opening hours", () => {
    const current = event("ongoing-exhibit", { starts_at: "2030-04-01T16:00:00Z", ends_at: "2030-04-30T22:00:00Z" });
    const stale = event("stale-exhibit", { starts_at: "2029-01-01T16:00:00Z", ends_at: "2030-04-30T22:00:00Z" });
    const root = render([current, stale]);
    expect(root.querySelectorAll("a[data-events-preview-link]")).toHaveLength(1);
    expect(root.textContent).toContain("through Apr 30");
    expect(root.textContent).not.toMatch(/Happening now|Open now|12:00 PM/);
  });
  it("preserves published cancellation/postponement and unknown-end evidence", () => {
    const root = render([event("cancelled", { status: "cancelled", ends_at: "2030-04-18T22:00:00Z" }), event("postponed", { status: "postponed" })]);
    const links = [...root.querySelectorAll<HTMLAnchorElement>("a[data-events-preview-link]")];
    expect(links[0].querySelector("[data-events-preview-status]")?.textContent).toBe("Cancelled");
    expect(links[0].querySelector("h2")?.className).toContain("line-through");
    expect(links[0].textContent).toContain("end time not listed");
    expect(links[1].querySelector("[data-events-preview-status]")?.textContent).toBe("Postponed");
    expect(root.textContent).not.toMatch(/Happening now|Live now/);
  });
  it("does not turn online attendance into a physical town/venue claim", () => {
    const root = render([event("online", { attendance_mode: "online", venue_name: "Online", municipality_name: "Frederick" })]);
    expect(root.querySelector("[data-events-preview-location]")?.textContent).toBe("Online");
  });
  it.each([false, true])("gives an empty preview official recovery without claiming an empty full calendar (degraded %s)", degraded => {
    const root = render([], degraded);
    expect(root.querySelector("[data-events-restore-preview]")).not.toBeNull();
    expect(root.querySelector("a[data-events-preview-link]")).toBeNull();
    expect(root.textContent).toContain("Preview listings are unavailable.");
    expect(root.textContent).not.toMatch(/No upcoming events|0 events|All events/);
    const official = [...root.querySelectorAll<HTMLAnchorElement>("a")];
    expect(official.map(link => link.href)).toEqual(["https://www.frederickcountymd.gov/calendar.aspx", "https://www.celebratefrederick.com/events/"]);
    official.forEach(link => { expect(link.relList.contains("noopener")).toBe(true); expect(link.relList.contains("noreferrer")).toBe(true); });
  });
  it("qualifies incomplete known rows and retains their canonical links alongside recovery", () => {
    const root = render([event()], true);
    expect(root.textContent).toContain("The saved event schedule is incomplete.");
    expect(root.querySelector("a[data-events-preview-link]")?.getAttribute("href")).toBe("/events/preview-concert");
    expect(root.querySelectorAll('a[target="_blank"]')).toHaveLength(2);
  });
  it("fails closed on an invalid server clock instead of fabricating dates or current events", () => {
    expect(render([event()], false, "invalid").querySelector("a[data-events-preview-link]")).toBeNull();
  });
});

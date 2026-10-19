// @vitest-environment jsdom
import { act, StrictMode, type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EventsExplorer from "./EventsExplorer";
import type { EventWithMeta } from "@/lib/loaders/events";
import { summarizeEventsForBrowse } from "@/lib/events/browsePayload";
import { EVENTS_BROWSE_TIMEOUT_MS } from "@/lib/events/fetchBrowse";

const recommendationContext = vi.hoisted(() => ({
  origin: null as { lat: number; lng: number } | null,
  featured: new Set<string>(),
  actualDisplay: false,
}));
vi.mock("@/lib/events/featured", () => ({
  featuredEventSlugs: () => recommendationContext.featured,
}));

// Keep the real explorer, filtering, request deadline and reconciliation.
// Presentation-only dependencies do not need animation or map providers here.
vi.mock("framer-motion", async () => {
  const { createElement } = await import("react");
  const box = (tag: string) => function Box({ children, ...props }: HTMLAttributes<HTMLElement>) {
    const attributes = Object.fromEntries(Object.entries(props).filter(([key]) =>
      !["initial", "animate", "exit", "transition", "variants", "whileHover", "whileTap", "layout"].includes(key)));
    return createElement(tag, attributes, children);
  };
  return { motion: { div: box("div"), ol: box("ol"), li: box("li") }, AnimatePresence: ({ children }: { children: ReactNode }) => children };
});
vi.mock("@/hooks/useGeolocation", () => ({
  GEOLOCATION_CHANGE_EVENT: "fr:geolocation-change",
  readCachedPosition: () => recommendationContext.origin,
  useGeolocation: () => ({ state: { status: "idle" }, request: vi.fn() }),
}));
vi.mock("./EventSheetBoundary", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("./EventCard", () => ({ default: ({ event, variant }: { event: EventWithMeta; variant?: string }) =>
  <a href={"/events/" + event.slug} data-test-card-variant={variant ?? "default"} data-test-card-start={event.starts_at}>{event.title}</a> }));
vi.mock("./EventAgenda", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./EventAgenda")>();
  const ActualAgenda = actual.default;
  return { ...actual, default: (props: ComponentProps<typeof ActualAgenda>) => recommendationContext.actualDisplay
    ? <ActualAgenda {...props} />
    : <div data-test-agenda-events={JSON.stringify(props.events.map((row) => [row.slug, row.starts_at, row.ends_at]))} /> };
});
vi.mock("./EventsMap", () => ({ default: () => null }));
vi.mock("./EventsBoardDock", async (importOriginal) => {
  const ActualDock = (await importOriginal<typeof import("./EventsBoardDock")>()).default;
  return { default: (props: ComponentProps<typeof ActualDock>) => {
    if (recommendationContext.actualDisplay) return <ActualDock {...props} />;
    const { q, setQ, town, lens, cat, filteredCount, countComplete, setView, setSort } = props;
    return <div data-test-dock data-town={town ?? "county"} data-time={lens} data-category={cat ?? "all"} data-count={filteredCount} data-complete={String(countComplete)}>
      <input aria-label="Filter the events shown" value={q} onChange={(event) => setQ(event.currentTarget.value)} />
      <button type="button" onClick={() => setView("calendar")}>Calendar test view</button>
      <button type="button" onClick={() => setSort("time")}>Soonest test sort</button>
    </div>;
  } };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const nowISO = "2026-10-12T14:00:00.000Z";
const bounds = { now: Date.parse(nowISO), next24: Date.parse("2026-10-13T04:00:00.000Z"), weekendStart: Date.parse("2026-10-16T21:00:00.000Z"), weekendEnd: Date.parse("2026-10-19T04:00:00.000Z"), live: new Set<string>() };
type SourceHealth = ComponentProps<typeof EventsExplorer>["sourceHealth"];
const healthy: SourceHealth = { degraded: false, unavailable: [] };
const degraded: SourceHealth = { degraded: true, unavailable: ["promoted-archive"] };
function listedEvent(slug = "recovered-concert", municipality = "thurmont", title = "Recovered concert"): EventWithMeta {
  return {
    slug, title, description: "A local event.", starts_at: "2026-10-12T18:00:00.000Z", ends_at: "2026-10-12T20:00:00.000Z",
    timezone: "America/New_York", venue_name: "Test venue", address: "1 Main Street", geom: { lng: -77.41, lat: 39.41 },
    municipality, category: "music", audience: [], is_free: true, source: "manual", is_verified: true, source_id: slug,
    source_url: "https://example.com/events", license: "test", confidence: "curated", first_seen_at: nowISO, last_verified_at: nowISO,
    geo_confidence: "venue_match", category_name: "Music", municipality_name: municipality === "thurmont" ? "Thurmont" : "Frederick",
  };
}
function props(events: EventWithMeta[] = [], health = degraded, total = events.length): ComponentProps<typeof EventsExplorer> {
  return {
    events, liveSlugs: [], categories: [{ slug: "music", name: "Music" }], towns: [{ slug: "thurmont", name: "Thurmont" }, { slug: "frederick", name: "Frederick" }],
    summary: { ...summarizeEventsForBrowse(events, bounds), totalCount: total }, sourceHealth: health, nowISO,
    next24ISO: new Date(bounds.next24).toISOString(), weekendStartISO: new Date(bounds.weekendStart).toISOString(), weekendEndISO: new Date(bounds.weekendEnd).toISOString(),
  };
}
const payload = (events = [listedEvent()], sourceHealth = healthy) => Response.json({ events, sourceHealth, liveSlugs: [], generatedAt: nowISO });

let root: Root;
let host: HTMLDivElement;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  recommendationContext.origin = null;
  recommendationContext.featured.clear();
  recommendationContext.actualDisplay = false;
  window.localStorage.clear();
  document.cookie = "fr_scope=; path=/; max-age=0";
  window.history.replaceState(null, "", "/events");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  request = vi.fn<typeof fetch>(async () => payload()); vi.stubGlobal("fetch", request);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  document.cookie = "fr_scope=; path=/; max-age=0";
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
});
async function render(options = props(), strict = false) {
  await act(async () => root.render(strict ? <StrictMode><EventsExplorer {...options} /></StrictMode> : <EventsExplorer {...options} />));
}
const eventLinks = () => [...host.querySelectorAll<HTMLAnchorElement>('a[href^="/events/"]')].map((link) => link.getAttribute("href"));

// These mounted regressions must recover without clicking a filter or retry.
describe("Events passive empty-snapshot recovery", () => {
  it.each([false, true])("recovers an empty degraded board once with ordinary browse (StrictMode %s)", async (strict) => {
    await render(props(), strict);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/events/browse", expect.objectContaining({ headers: { Accept: "application/json" }, signal: expect.any(AbortSignal) }));
    expect(request.mock.calls[0][1]).not.toHaveProperty("cache", "no-store");
    expect(eventLinks()).toContain("/events/recovered-concert");
    expect(host.querySelector('[data-events-complete="true"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Why these results are partial");
    await render(props(), strict);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("accepts a healthy empty runtime answer without an automatic retry", async () => {
    request.mockResolvedValue(payload([])); await render();
    expect(host.textContent).toContain("No upcoming events are listed");
    expect(host.querySelector('[data-events-complete="true"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Why these results are partial");
    await render(); expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not request a healthy empty calendar", async () => {
    await render(props([], healthy));
    expect(host.textContent).toContain("No upcoming events are listed"); expect(request).not.toHaveBeenCalled();
  });
  it("keeps a healthy compact preview without an extra request", async () => {
    await render(props([listedEvent()], healthy, 100));
    expect(eventLinks()).toContain("/events/recovered-concert"); expect(request).not.toHaveBeenCalled();
  });
  it("keeps known degraded partial rows without a passive fan-out", async () => {
    await render(props([listedEvent()], degraded, 100));
    expect(eventLinks()).toContain("/events/recovered-concert");
    expect(host.textContent).toContain("Why these results are partial"); expect(request).not.toHaveBeenCalled();
  });
  it("keeps a degraded runtime response qualified and makes no automatic retry", async () => {
    request.mockResolvedValue(payload([listedEvent()], degraded)); await render();
    expect(eventLinks()).toContain("/events/recovered-concert");
    expect(host.querySelector('[data-events-complete="false"]')).not.toBeNull();
    expect(host.textContent).toContain("Why these results are partial");
    await render(); expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["transport", "malformed"])("keeps a failed %s read partial and leaves explicit Retry usable", async (failure) => {
    if (failure === "transport") request.mockRejectedValueOnce(new Error("Offline"));
    else request.mockResolvedValueOnce(Response.json({ events: null, sourceHealth: healthy }));
    await render();
    expect(host.querySelector('[data-events-complete="false"]')).not.toBeNull();
    expect(host.textContent).toContain("Event schedule unavailable");
    expect(host.textContent).not.toContain("Why these results are partial");
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Retry")!;
    expect(retry).toBeDefined(); expect(retry.disabled).toBe(false);
    await render(); expect(request).toHaveBeenCalledTimes(1);
    await act(async () => retry.click());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe("/api/events/browse?refresh=1");
    expect(eventLinks()).toContain("/events/recovered-concert");
  });
  it("gives an empty archive timeout truthful recovery and official calendars, then replaces it after an explicit retry", async () => {
    const archiveTimeout = {
      degraded: true,
      unavailable: ["The event schedule is taking longer than expected to load."],
      issues: [{ code: "event_archive_timeout", message: "The event schedule is taking longer than expected to load." }],
    };
    request.mockResolvedValueOnce(payload([], archiveTimeout));
    await render(props([], archiveTimeout));
    expect(request).toHaveBeenCalledTimes(1);
    expect(eventLinks()).toEqual([]);
    expect(host.textContent).toContain("Event schedule unavailable");
    expect(host.textContent).not.toContain("No upcoming events are listed");
    expect(host.textContent).not.toContain("kept the last available events");
    expect(host.textContent).not.toContain("Some live calendars did not answer");
    const official = [...host.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')];
    expect(official.map((link) => link.href)).toEqual([
      "https://www.frederickcountymd.gov/calendar.aspx",
      "https://www.celebratefrederick.com/events/",
    ]);
    for (const link of official) {
      expect(link.relList.contains("noopener")).toBe(true);
      expect(link.relList.contains("noreferrer")).toBe(true);
    }
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Check the calendar again")!;
    expect(retry).toBeDefined();
    await act(async () => retry.click());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe("/api/events/browse?refresh=1");
    expect(eventLinks()).toContain("/events/recovered-concert");
    expect(host.textContent).not.toContain("Event schedule unavailable");
    expect(host.querySelector('a[href="https://www.frederickcountymd.gov/calendar.aspx"]')).toBeNull();
  });
  it("keeps known events after an empty timeout response without blaming publisher calendars", async () => {
    const archiveTimeout = {
      degraded: true,
      unavailable: ["The event schedule is taking longer than expected to load."],
      issues: [{ code: "event_archive_timeout", message: "The event schedule is taking longer than expected to load." }],
    };
    request.mockResolvedValueOnce(payload([], archiveTimeout));
    await render(props([listedEvent()], degraded, 100));
    expect(request).not.toHaveBeenCalled();
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Check again")!;
    await act(async () => retry.click());
    expect(request).toHaveBeenCalledTimes(1);
    expect(eventLinks()).toContain("/events/recovered-concert");
    expect(host.querySelector('[data-events-complete="false"]')).not.toBeNull();
    expect(host.textContent).toContain("The saved event schedule is incomplete.");
    expect(host.textContent).not.toContain("Event schedule unavailable");
    expect(host.textContent).not.toContain("Some live calendars did not answer");
    expect(host.querySelector('a[href="https://www.frederickcountymd.gov/calendar.aspx"]')).toBeNull();
  });
  it("keeps filtered-out partial rows distinct from an unavailable archive", async () => {
    window.history.replaceState(null, "", "/events?in=frederick");
    request.mockResolvedValue(payload([listedEvent()], degraded));
    await render(props([listedEvent()], degraded, 100));
    expect(host.querySelector("[data-test-dock]")?.getAttribute("data-town")).toBe("frederick");
    expect(eventLinks()).toEqual([]);
    expect(host.textContent).toContain("No matches in the events loaded so far");
    expect(host.textContent).not.toContain("Event schedule unavailable");
    expect(host.querySelector('a[href="https://www.frederickcountymd.gov/calendar.aspx"]')).toBeNull();
  });
  it("restores deep-link town/time/category before the deduplicated request and preserves them on recovery", async () => {
    window.history.replaceState(null, "", "/events?in=thurmont&lens=today&cats=music&free=1");
    request.mockImplementation(async () => {
      const dock = host.querySelector("[data-test-dock]")!;
      expect(host.querySelector('[data-events-interaction-ready="true"]')).not.toBeNull();
      expect(dock.getAttribute("data-town")).toBe("thurmont"); expect(dock.getAttribute("data-time")).toBe("today"); expect(dock.getAttribute("data-category")).toBe("music");
      return payload([listedEvent(), listedEvent("other-town", "frederick", "Wrong town")]);
    });
    await render(); expect(request).toHaveBeenCalledTimes(1);
    expect(eventLinks()).toContain("/events/recovered-concert"); expect(eventLinks()).not.toContain("/events/other-town");
    expect(new URLSearchParams(window.location.search).get("in")).toBe("thurmont");
    expect(new URLSearchParams(window.location.search).get("lens")).toBe("today");
    expect(new URLSearchParams(window.location.search).get("cats")).toBe("music");
    expect(new URLSearchParams(window.location.search).get("free")).toBe("true");
  });
  it("preserves a query typed during the pending read, input focus and scroll", async () => {
    let resolve!: (response: Response) => void;
    request.mockImplementation(() => new Promise((complete) => { resolve = complete; }));
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await render();
    const input = host.querySelector("input")!; input.focus();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "needle"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => resolve(payload([listedEvent(), listedEvent("needle-concert", "thurmont", "Needle concert")])));
    expect(input.value).toBe("needle"); expect(document.activeElement).toBe(input); expect(scroll).not.toHaveBeenCalled();
    expect(eventLinks()).toContain("/events/needle-concert"); expect(eventLinks()).not.toContain("/events/recovered-concert"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("releases a hung passive read at the existing deadline without retrying", async () => {
    vi.useFakeTimers(); request.mockImplementation(() => new Promise(() => {}));
    await render(); expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(EVENTS_BROWSE_TIMEOUT_MS); });
    expect(request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(host.textContent).toContain("Event schedule unavailable");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await render(); expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("Recommended attendance promotion through the mounted explorer", () => {
  const weak = () => ({ ...listedEvent("off-campus-offer", "frederick", "Film festival tickets"),
    venue_name: "Off Campus", starts_at: "2026-10-12T17:00:00.000Z", ends_at: "2026-10-12T19:00:00.000Z" });
  const named = () => ({ ...listedEvent("named-concert", "frederick", "Concert"),
    venue_name: "Community Hall", starts_at: "2026-10-12T23:00:00.000Z", ends_at: "2026-10-13T01:00:00.000Z", geo_confidence: "area" as const });
  const leadLinks = () => [...host.querySelectorAll<HTMLAnchorElement>('[data-test-card-variant="feature"]')].map((link) => link.getAttribute("href"));

  it("promotes a named later event while keeping the earlier ambiguous listing once", async () => {
    const rows = [weak(), named()], before = JSON.stringify(rows);
    recommendationContext.featured.add("off-campus-offer");
    await render(props(rows, healthy));
    expect(leadLinks()).toEqual(["/events/named-concert"]);
    expect(eventLinks().filter((href) => href === "/events/off-campus-offer")).toHaveLength(1);
    expect(eventLinks().filter((href) => href === "/events/named-concert")).toHaveLength(1);
    expect(host.querySelector("[data-test-dock]")?.getAttribute("data-count")).toBe("2");
    expect(JSON.stringify(rows)).toBe(before);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps all ambiguous rows without a poster or a false empty-calendar message", async () => {
    const generic = { ...weak(), slug: "town-only-offer", title: "Published town listing", venue_name: "Frederick" };
    await render(props([weak(), generic], healthy));
    expect(leadLinks()).toEqual([]);
    expect(host.querySelector("[data-events-primary-lead]")).toBeNull();
    expect(eventLinks()).toEqual(expect.arrayContaining(["/events/off-campus-offer", "/events/town-only-offer"]));
    expect(host.querySelector("[data-test-dock]")?.getAttribute("data-count")).toBe("2");
    expect(host.textContent).not.toContain("No upcoming events are listed");
    expect(request).not.toHaveBeenCalled();
  });

  it("applies eligibility before featured and consented Near Me rank without discarding rows", async () => {
    window.history.replaceState(null, "", "/events?in=nearme");
    recommendationContext.origin = { lat: 39.414, lng: -77.41 };
    recommendationContext.featured.add("off-campus-offer");
    const far = { ...named(), slug: "far-concert", venue_name: "Far Hall", geom: { lat: 39.6, lng: -77.4 }, geo_confidence: "venue_match" as const };
    const near = { ...named(), slug: "near-concert", venue_name: "Near Hall", geom: { lat: 39.4141, lng: -77.4101 }, geo_confidence: "venue_match" as const };
    await render(props([weak(), far, near], healthy));
    expect(leadLinks()).toEqual(["/events/near-concert"]);
    expect(eventLinks()).toEqual(expect.arrayContaining(["/events/off-campus-offer", "/events/far-concert", "/events/near-concert"]));
    expect(request).not.toHaveBeenCalled();
  });

  it("does not move a later horizon's eligible event over an ambiguous Today group", async () => {
    const weekend = { ...named(), slug: "weekend-concert",
      starts_at: "2026-10-16T23:00:00.000Z", ends_at: "2026-10-17T01:00:00.000Z" };
    await render(props([weak(), weekend], healthy));
    expect(leadLinks()).toEqual([]);
    expect(host.querySelector("[data-events-primary-lead]")).toBeNull();
    expect(eventLinks().filter((href) => href === "/events/off-campus-offer")).toHaveLength(1);
    expect(eventLinks().filter((href) => href === "/events/weekend-concert")).toHaveLength(1);
    // Recommended supplementary rows use discovery cards while ordinary
    // group leads retain glance cards. Their exact horizon and document order
    // remain the contract, regardless of this presentation difference.
    const ordinary = [...host.querySelectorAll<HTMLAnchorElement>('[data-test-card-variant="glance"], [data-test-card-variant="discovery"]')];
    expect(ordinary.map(link => link.getAttribute("href"))).toEqual(["/events/off-campus-offer", "/events/weekend-concert"]);
    expect(ordinary[0].closest("section")?.querySelector(".section-heading h2")?.textContent).toBe("Today1");
    expect(ordinary[1].closest("section")?.querySelector(".section-heading h2")?.textContent).toBe("This weekend1");
    expect(host.querySelector("[data-test-dock]")?.getAttribute("data-count")).toBe("2");
    expect(request).not.toHaveBeenCalled();
  });

  it("goes directly from Recommended to the real Agenda view and back without losing dated listings or the usable lead", async () => {
    // Only this case uses the real display controls and Agenda renderer. The
    // other regressions retain their presentation-only mocks. Reduced motion
    // supplies the missing jsdom capability, without stubbing dates or rank.
    recommendationContext.actualDisplay = true;
    recommendationContext.featured.add("off-campus-offer");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }));
    const nextDay = { ...named(), slug: "next-day-concert", title: "Next-day concert",
      starts_at: "2026-10-13T22:00:00.000Z", ends_at: "2026-10-14T00:00:00.000Z" };
    // Unsorted input and a featured early ambiguous row distinguish real
    // Agenda chronology from the Recommended order supplied to that view.
    const rows = [nextDay, named(), weak()], before = JSON.stringify(rows);
    await render(props(rows, healthy));
    expect(leadLinks()).toEqual(["/events/named-concert"]);
    expect(host.querySelector('[data-events-complete="true"]')).not.toBeNull();
    expect(host.querySelector(".eb-countline")?.textContent).toBe("3 event listings · 1 town");

    // The actual dock has mobile and desktop control copies. Open the native
    // mobile disclosure and scope both choices to it, never a hidden sibling.
    const display = host.querySelector<HTMLDetailsElement>("details.eb-display-options")!;
    const summary = display.querySelector("summary")!;
    const order = () => display.querySelector('button[aria-label="Order: Recommended"]');
    expect(summary.getAttribute("aria-label")).toBe("Change event display. List view, Recommended order.");
    expect(order()).not.toBeNull();
    expect(display.open).toBe(false);
    await act(async () => summary.click());
    expect(display.open).toBe(true);
    const agenda = display.querySelector<HTMLButtonElement>('button[aria-label="Agenda view"]')!;
    expect(agenda.getAttribute("aria-pressed")).toBe("false");
    await act(async () => agenda.click());
    expect(display.open).toBe(false);
    expect(agenda.getAttribute("aria-pressed")).toBe("true");
    expect(summary.getAttribute("aria-label")).toBe("Change event display. Agenda view, Recommended order.");
    expect(order()).not.toBeNull();
    expect(new URLSearchParams(window.location.search).get("sort")).toBeNull();
    expect(leadLinks()).toEqual([]);
    expect(eventLinks()).toEqual(["/events/off-campus-offer", "/events/named-concert", "/events/next-day-concert"]);

    const agendaLinks = [...host.querySelectorAll<HTMLAnchorElement>('a[href^="/events/"]')];
    expect(agendaLinks.map((link) => link.querySelector("span")?.textContent)).toEqual(["1:00pm", "7:00pm", "6:00pm"]);
    expect(agendaLinks.map((link) => link.closest("section")?.querySelector("h3")?.textContent)).toEqual([
      "Mon · Oct 12", "Mon · Oct 12", "Tue · Oct 13",
    ]);
    expect(agendaLinks.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Film festival tickets"), expect.stringContaining("Concert"), expect.stringContaining("Next-day concert"),
    ]);
    expect(host.querySelector(".eb-countline")?.textContent).toBe("3 event listings · 1 town");

    await act(async () => summary.click());
    expect(display.open).toBe(true);
    const list = display.querySelector<HTMLButtonElement>('button[aria-label="List view"]')!;
    await act(async () => list.click());
    expect(display.open).toBe(false);
    expect(list.getAttribute("aria-pressed")).toBe("true");
    expect(summary.getAttribute("aria-label")).toBe("Change event display. List view, Recommended order.");
    expect(order()).not.toBeNull();
    expect(new URLSearchParams(window.location.search).get("sort")).toBeNull();
    expect(leadLinks()).toEqual(["/events/named-concert"]);
    for (const row of rows) {
      const links = host.querySelectorAll<HTMLAnchorElement>(`a[href="/events/${row.slug}"]`);
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("data-test-card-start")).toBe(row.starts_at);
    }
    expect(host.querySelector(".eb-countline")?.textContent).toBe("3 event listings · 1 town");
    expect(JSON.stringify(rows)).toBe(before);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps Soonest chronology and every dated row in Calendar", async () => {
    const rows = [weak(), named()];
    await render(props(rows, healthy));
    const soonest = [...host.querySelectorAll("button")].find((button) => button.textContent === "Soonest test sort")!;
    await act(async () => soonest.click());
    expect(leadLinks()).toEqual(["/events/off-campus-offer"]);
    const calendar = [...host.querySelectorAll("button")].find((button) => button.textContent === "Calendar test view")!;
    await act(async () => calendar.click());
    const supplied = JSON.parse(host.querySelector("[data-test-agenda-events]")!.getAttribute("data-test-agenda-events")!);
    expect(supplied).toEqual(rows.map((row) => [row.slug, row.starts_at, row.ends_at]));
    expect(request).not.toHaveBeenCalled();
  });
});

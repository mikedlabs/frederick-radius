// @vitest-environment jsdom
import { act, StrictMode, type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EventsExplorer from "./EventsExplorer";
import type { EventWithMeta } from "@/lib/loaders/events";
import { summarizeEventsForBrowse } from "@/lib/events/browsePayload";
import { EVENTS_BROWSE_TIMEOUT_MS } from "@/lib/events/fetchBrowse";

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
  readCachedPosition: () => null,
  useGeolocation: () => ({ state: { status: "idle" }, request: vi.fn() }),
}));
vi.mock("./EventSheetBoundary", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("./EventCard", () => ({ default: ({ event }: { event: EventWithMeta }) => <a href={`/events/${event.slug}`}>{event.title}</a> }));
vi.mock("./EventAgenda", () => ({ default: () => null }));
vi.mock("./EventsMap", () => ({ default: () => null }));
vi.mock("./EventsBoardDock", () => ({ default: ({ q, setQ, town, lens, cat, filteredCount, countComplete }: {
  q: string; setQ: (value: string) => void; town: string | null; lens: string; cat: string | null; filteredCount: number; countComplete: boolean;
}) => <div data-test-dock data-town={town ?? "county"} data-time={lens} data-category={cat ?? "all"} data-count={filteredCount} data-complete={String(countComplete)}>
  <input aria-label="Filter the events shown" value={q} onChange={(event) => setQ(event.currentTarget.value)} />
</div> }));

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
    expect(host.textContent).toContain("No matches in the events loaded so far");
    expect(host.textContent).toContain("Why these results are partial");
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Retry")!;
    expect(retry).toBeDefined(); expect(retry.disabled).toBe(false);
    await render(); expect(request).toHaveBeenCalledTimes(1);
    await act(async () => retry.click());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe("/api/events/browse?refresh=1");
    expect(eventLinks()).toContain("/events/recovered-concert");
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
    expect(host.textContent).toContain("No matches in the events loaded so far");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await render(); expect(request).toHaveBeenCalledTimes(1);
  });
});

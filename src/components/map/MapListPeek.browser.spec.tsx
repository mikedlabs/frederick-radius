// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import MapListPeek, { type MapListPeekProps } from "./MapListPeek";
import type { MapTaskList } from "./mapListTask";
import type { MapPinPlace } from "./types";

vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const origin = "/map?q=coffee&in=brunswick&c=-77.63,39.31,14&intent=coffee";
function place(index: number, overrides: Partial<MapPinPlace> = {}): MapPinPlace {
  return {
    slug: `coffee-${index}`, name: `Coffee place ${index}`, category: "coffee", subcategories: [],
    municipality: "brunswick", source: "manual", is_verified: false,
    geom: { lat: 39.3135, lng: -77.6261 }, open_status: { state: "unknown" }, short_blurb: "",
    ...overrides,
  };
}
function list(rows: MapTaskList["rows"] = Array.from({ length: 8 }, (_, index) => ({ kind: "place", place: place(index) }))): MapTaskList {
  return {
    key: "coffee:brunswick", title: "Coffee · Brunswick", rows, unit: "place", scope: "town:brunswick",
    pending: false, unavailable: false, note: "Hours for these places are not confirmed, so check before you go.",
    askQuery: "coffee", empty: { title: "Nothing here matches this view.", copy: "Choose another view or reset the map." },
  };
}

describe("MapListPeek native directions", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onPickPlace: Mock<MapListPeekProps["onPickPlace"]>;
  let onPickEvent: Mock<MapListPeekProps["onPickEvent"]>;
  let onExpandedChange: Mock<MapListPeekProps["onExpandedChange"]>;
  const mount = async (props: Partial<MapListPeekProps> = {}) => act(async () => {
    root.render(<MapListPeek list={list()} expanded onExpandedChange={onExpandedChange} userLoc={null}
      onPickPlace={onPickPlace} onPickEvent={onPickEvent} mapReturnTo={origin} {...props} />);
  });
  const details = (slug = "coffee-0") => host.querySelector<HTMLButtonElement>(`[data-map-list-place="${slug}"]`)!;
  const directions = (slug = "coffee-0") => host.querySelector<HTMLAnchorElement>(`[data-map-list-directions="${slug}"]`)!;

  beforeEach(() => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    onPickPlace = vi.fn<MapListPeekProps["onPickPlace"]>(); onPickEvent = vi.fn<MapListPeekProps["onPickEvent"]>(); onExpandedChange = vi.fn<MapListPeekProps["onExpandedChange"]>();
    history.replaceState({ currentMapEntry: "kept" }, "", origin);
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState(null, "", "/");
  });

  it("makes the exact destination a separately named native link outside the place button", async () => {
    await mount();
    const link = directions();
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=39.3135,-77.6261");
    expect(link.getAttribute("aria-label")).toBe("Directions to Coffee place 0");
    expect(link.textContent).toBe("Directions");
    expect(link.target).toBe("_blank");
    expect(link.rel.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    expect(link.parentElement).toBe(details().parentElement);
    expect(host.querySelector("button a, a button")).toBeNull();
    expect(details().textContent).toContain("Brunswick");
    expect(details().textContent).toContain("Hours not confirmed");
    expect(host.textContent).not.toContain("from you");
  });

  it.each([false, true])("leaves native click handling, scope, camera and selection untouched (modified click: %s)", async (modified) => {
    await mount();
    const link = directions();
    expect(link).not.toBeNull();
    const before = { href: location.href, state: history.state, rows: host.querySelectorAll("[data-map-list-place]").length };
    let nativeDefaultAvailable = false;
    // Observe the component's actual event handling before blocking jsdom's
    // unsupported external navigation at the test document boundary.
    const observe = (event: MouseEvent) => { nativeDefaultAvailable = !event.defaultPrevented; event.preventDefault(); };
    document.addEventListener("click", observe, { once: true });
    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, metaKey: modified })));
    expect(nativeDefaultAvailable).toBe(true);
    expect(onPickPlace).not.toHaveBeenCalled(); expect(onPickEvent).not.toHaveBeenCalled();
    expect(onExpandedChange).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect({ href: location.href, state: history.state, rows: host.querySelectorAll("[data-map-list-place]").length }).toEqual(before);
  });

  it("still opens only the selected details row and leaves its native action separately focusable", async () => {
    await mount();
    await act(async () => details().click());
    expect(onPickPlace).toHaveBeenCalledExactlyOnceWith(place(0));
    expect(onPickEvent).not.toHaveBeenCalled();
    await mount({ selectedPlaceSlug: "coffee-0" });
    expect(details().getAttribute("aria-pressed")).toBe("true");
    details().focus(); expect(document.activeElement).toBe(details());
    directions().focus(); expect(document.activeElement).toBe(directions());
    expect(directions().tabIndex).toBe(0);
    expect(host.querySelectorAll('[data-decision-impression="true"]')).toHaveLength(5);
  });

  it.each([
    { lat: Number.NaN, lng: -77.6261 }, { lat: 39.3135, lng: Number.POSITIVE_INFINITY },
    { lat: 91, lng: -77.6261 }, { lat: 39.3135, lng: 181 },
    { lat: 0, lng: 0 }, { lat: 40.7128, lng: -74.006 },
  ])("keeps details and hours but omits directions for invalid or out-of-guide coordinates %j", async (geom) => {
    await mount({ list: list([{ kind: "place", place: place(0, { geom }) }]) });
    expect(details().textContent).toContain("Coffee place 0");
    expect(details().textContent).toContain("Hours not confirmed");
    expect(directions()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the existing Apple Maps destination on an iPhone", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    await mount();
    expect(directions()?.href).toBe("https://maps.apple.com/?daddr=39.3135,-77.6261");
    expect(host.textContent).not.toContain("from you");
  });

  it("preserves expanded paging and the exact query return when an external action is used", async () => {
    await mount();
    const showMore = [...host.querySelectorAll("button")].find((button) => button.textContent === "Show 3 more places")!;
    await act(async () => showMore.click());
    expect([...host.querySelectorAll("[data-map-list-place]")].map((element) => element.getAttribute("data-map-list-place")))
      .toEqual(Array.from({ length: 8 }, (_, index) => `coffee-${index}`));
    const handoff = [...host.querySelectorAll("a")].find((link) => link.textContent === "Search all of Radius")!.href;
    document.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await act(async () => directions("coffee-7").click());
    expect(host.querySelector("[data-map-list-peek]")?.getAttribute("data-expanded")).toBe("true");
    expect(host.querySelectorAll("[data-map-list-place]")).toHaveLength(8);
    expect([...host.querySelectorAll("a")].find((link) => link.textContent === "Search all of Radius")!.href).toBe(handoff);
    expect(location.pathname + location.search).toBe(origin);
    expect(onPickPlace).not.toHaveBeenCalled();
  });

  it("keeps the map-unavailable list useful without weakening its unavailable-source qualification", async () => {
    const onRetrySearch = vi.fn();
    await mount({ collapsible: false, list: { ...list(), unavailable: true }, onRetrySearch });
    expect(host.textContent).toContain("Unable to verify the full search");
    expect(host.querySelectorAll("[data-map-list-directions]")).toHaveLength(5);
    expect(host.querySelectorAll("img")).toHaveLength(0);
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Try again")!;
    await act(async () => retry.click());
    expect(onRetrySearch).toHaveBeenCalledOnce();
    expect(onPickPlace).not.toHaveBeenCalled();
  });

  it("does not add place directions to event or unmapped event-link rows", async () => {
    await mount({ list: list([
      { kind: "event", event: { slug: "trivia", title: "Trivia Night", starts_at: "2026-10-12T22:30:00Z", category: "community", venue_name: "Event venue", lat: 39.3135, lng: -77.6261 } },
      { kind: "event-link", result: { id: "event:unmapped", type: "event", title: "Other event", href: "/events/unmapped", subtitle: "Confirm with the organizer" } },
    ]) });
    expect(host.querySelectorAll("[data-map-list-directions]")).toHaveLength(0);
    expect(host.textContent).toContain("6:30");
    expect(host.querySelector('[data-map-list-event-link="unmapped"]')?.getAttribute("href")).toContain("returnTo=");
    await act(async () => host.querySelector<HTMLButtonElement>('[data-map-list-event="trivia"]')!.click());
    expect(onPickEvent).toHaveBeenCalledOnce(); expect(onPickPlace).not.toHaveBeenCalled();
  });
});

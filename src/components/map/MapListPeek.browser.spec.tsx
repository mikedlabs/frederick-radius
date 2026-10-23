// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import MapListPeek, { type MapListPeekProps } from "./MapListPeek";
import type { MapTaskList } from "./mapListTask";
import type { MapPinPlace } from "./types";
import { eventPinFromEvent } from "@/lib/map/eventPin";
import { clearMapSelectionOpener, rememberMapSelectionOpener, restoreMapSelectionOpenerFocus, takeMapSelectionOpener } from "./mapSelectionFocus";

// This image seam reports actual load/error lifecycle without requesting providers.
vi.mock("next/image", () => ({ default: ({ src, alt, ref, onLoad, onError, style }: ComponentProps<"img">) =>
  // eslint-disable-next-line @next/next/no-img-element
  <img ref={ref} src={src} alt={alt ?? ""} onLoad={onLoad} onError={onError} style={style} /> }));
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
    await act(async () => root.unmount()); host.remove(); clearMapSelectionOpener();
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

  it.each(["place", "event"] as const)("captures the actual %s row before selection, then restores it without pre-click focus", async kind => {
    const pin = { slug: "overnight-concert", title: "Overnight concert", starts_at: "2026-10-19T02:00:00Z", category: "music", venue_name: "Test venue", lat: 39.3135, lng: -77.6261 };
    const onPick = () => rememberMapSelectionOpener();
    onPickPlace.mockImplementation(onPick);
    onPickEvent.mockImplementation(onPick);
    await mount({ list: list(kind === "place" ? [{ kind, place: place(0) }] : [{ kind, event: pin }]) });
    const row = host.querySelector<HTMLButtonElement>(kind === "place" ? "[data-map-list-place]" : "[data-map-list-event]")!;
    expect(document.activeElement).not.toBe(row);
    const before = { href: location.href, state: history.state };
    // DOM click performs no implicit preparatory focus, reproducing Safari's
    // pointer boundary while exercising the production callback and helper.
    await act(async () => row.click());
    expect(takeMapSelectionOpener()?.exact).toBe(row);
    expect(kind === "place" ? onPickPlace : onPickEvent).toHaveBeenCalledOnce();
    const other = document.createElement("button"); host.append(other); other.focus();
    expect(document.activeElement).toBe(other);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    restoreMapSelectionOpenerFocus();
    expect(document.activeElement).toBe(row);
    expect(takeMapSelectionOpener()).toBeNull();
    expect({ href: location.href, state: history.state }).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
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

  it("renders the source presenter through the actual compact pin and opens the unchanged event", async () => {
    const source: Parameters<typeof eventPinFromEvent>[0] = {
      slug: "theatre", title: "Live Theatre Production", presenter: "Other Voices Theatre",
      starts_at: "2030-04-18T22:00:00.000Z", ends_at: "2030-04-19T00:00:00.000Z",
      venue_name: "Baker Park", municipality: "frederick", category: "community",
      geom: { lng: -77.4201, lat: 39.4143 }, source: "city-frederick",
      source_url: "https://www.cityoffrederickmd.gov/calendar", confidence: "verified",
      last_verified_at: "2030-04-18T14:00:00.000Z", is_verified: true,
    };
    const pin = JSON.parse(JSON.stringify(eventPinFromEvent(source, new Date("2030-04-18T16:00:00.000Z"))));
    await mount({ list: list([{ kind: "event", event: pin }]) });
    const button = host.querySelector<HTMLButtonElement>('[data-map-list-event="theatre"]')!;

    expect(button.textContent).toContain("Other Voices Theatre: Live Theatre Production");
    expect(button.textContent).toContain("Baker Park");
    await act(async () => button.click());
    expect(onPickEvent).toHaveBeenCalledExactlyOnceWith(pin);
    expect(onPickEvent.mock.calls[0][0].title).toBe("Live Theatre Production");
    expect(onPickPlace).not.toHaveBeenCalled();
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(source.title).toBe("Live Theatre Production");
    expect(location.pathname + location.search).toBe(origin);
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


describe("MapListPeek reviewed place media", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("This browse photo must not fetch metadata or providers"); }));
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const mount = async (selected: MapPinPlace, onPickPlace = vi.fn()) => act(async () => {
    root.render(<MapListPeek list={list([{ kind: "place", place: selected }])} expanded userLoc={null}
      onExpandedChange={() => {}} onPickPlace={onPickPlace} onPickEvent={() => {}} />);
  });
  const load = async (image: HTMLImageElement) => {
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: 600 }, naturalHeight: { configurable: true, value: 400 } });
    await act(async () => image.dispatchEvent(new Event("load")));
  };

  it.each([
    ["mccurdy-field", "McCurdy Field", "/images/seasons/spring/aerial-view-baseball-field.jpg"],
    ["carroll-creek-linear-park-frederick", "Carroll Creek Linear Park", "/images/places/carroll-creek-aerial.jpg"],
  ])("paints exact owned %s without metadata or a licensed footer and retains its actions after failure", async (slug, name, src) => {
    const selected = place(0, { slug, name, category: "park" });
    const onPick = vi.fn();
    await mount(selected, onPick);
    const image = host.querySelector<HTMLImageElement>("img")!;
    expect(image.getAttribute("src")).toBe(src);
    await load(image);
    expect(host.querySelector('[data-map-list-photo]')?.getAttribute("data-photo-state")).toBe("ready");
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('[data-map-list-photo]')?.getAttribute("data-photo-state")).toBe("fallback");
    const details = host.querySelector<HTMLButtonElement>(`[data-map-list-place="${slug}"]`)!;
    expect(details.textContent).toContain("Hours not confirmed");
    await act(async () => details.click());
    expect(onPick).toHaveBeenCalledExactlyOnceWith(selected);
    expect(document.activeElement).toBe(details);
    expect(host.querySelector(`[data-map-list-directions="${slug}"]`)).not.toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("credits the exact licensed image only after decode, outside independent selection and directions", async () => {
    const selected = place(0, { slug: "new-market-historic-district-new-market", name: "New Market Historic District" });
    const onPick = vi.fn();
    await mount(selected, onPick);
    const image = host.querySelector<HTMLImageElement>("img")!;
    expect(image.getAttribute("src")).toBe("/history-photos/new-market-antiques.jpg");
    const pendingCredit = host.querySelector<HTMLElement>(".place-card-photo-credit")!;
    expect(pendingCredit.getAttribute("aria-hidden")).toBe("true");
    expect(pendingCredit.hasAttribute("inert")).toBe(true);
    expect(pendingCredit.style.visibility).toBe("hidden");
    await load(image);
    const credit = host.querySelector<HTMLElement>(".place-card-photo-credit")!;
    expect(credit.style.visibility).toBe("");
    expect(credit.hasAttribute("inert")).toBe(false);
    expect(credit.textContent).toContain("Acroterion");
    expect(credit.textContent).toContain("CC BY-SA 4.0");
    expect(credit.querySelector('a[href="https://commons.wikimedia.org/wiki/File:New_Market_HD_MD1.jpg"]')).not.toBeNull();
    expect(credit.closest("button, a")).toBeNull();
    expect(host.querySelector("button a, a button")).toBeNull();
    const source = credit.querySelector("a")!;
    document.addEventListener("click", event => event.preventDefault(), { once: true });
    await act(async () => source.click());
    expect(onPick).not.toHaveBeenCalled();
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBe(credit);
    expect(credit.getAttribute("aria-hidden")).toBe("true");
    expect(credit.hasAttribute("inert")).toBe(true);
    expect(credit.style.visibility).toBe("hidden");
    expect(host.textContent).toContain("New Market Historic District");
    expect(fetch).not.toHaveBeenCalled();
  });
});

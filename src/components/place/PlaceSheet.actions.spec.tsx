// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Declared offline image seam exercises failure without fetching pixels. */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { groupPlaceActions, placeActions } from "@/lib/place-actions";

const hoursProps = vi.hoisted(() => vi.fn());
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("next/image", () => ({ default: ({ src, alt, onError }: { src: string; alt: string; onError?: () => void }) => <img src={src} alt={alt} onError={onError} /> }));
vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ children, onClose }: { children: (dismiss: () => void) => ReactNode; onClose: () => void }) => <div role="dialog">{children(onClose)}</div>,
  SheetHandle: () => <button type="button">Close place details</button>,
}));
vi.mock("@/components/saved/SaveButton", () => ({ default: ({ label, refId, barLabel }: { label: string; refId: string; barLabel?: string }) =>
  <button type="button" aria-label={label} data-save-ref={`place:${refId}`} className="min-h-[52px]">{barLabel}</button> }));
vi.mock("./ShareButton", () => ({ default: () => null }));
vi.mock("./SourceBadge", () => ({ default: () => null }));
vi.mock("./FieldNotesCard", () => ({ default: () => null }));
vi.mock("./GooglePlaceContext", () => ({ default: () => null }));
vi.mock("./HoursBlock", () => ({ default: (props: unknown) => {
  hoursProps(props); return <details><summary>Declared official hours today</summary></details>;
} }));
vi.mock("@/components/plan/PlanFromPlaceLink", () => ({ default: () => null }));
vi.mock("@/lib/aerial", () => ({ nearestAerial: () => ({ src: "/fixtures/aerial.jpg", distance_m: 50, season: "autumn" }), currentSeason: () => "autumn" }));
vi.mock("@/lib/cuisine", () => ({ knownFor: () => null }));
vi.mock("@/lib/decision/telemetry", () => ({ decisionContextFromPath: () => ({ surface: "map" }), trackDecision: () => {} }));
vi.mock("@/lib/place-card-photo", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/place-card-photo")>();
  // Declared visual fixtures test placement/failure only, never photo rights.
  const hero = { kind: "owned", src: "/fixtures/exact-place.jpg", alt: "Declared exact place", objectPosition: "center" };
  return { ...actual, placeCardPhotoPlan: () => ({ key: "declared-sheet-photo", sources: [hero] }),
    placePhotoGallerySources: () => [hero, { ...hero, src: "/fixtures/second-place.jpg" }] };
});
vi.mock("./PlaceCardPhoto", () => ({ PlaceCardPhotoCredit: ({ source }: { source?: { src: string } }) =>
  source ? <p data-declared-photo-credit={source.src}>Declared source credit</p> : null }));

import PlaceSheet from "./PlaceSheet";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixture(overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug: "declared-sheet-place", name: "Declared place", category: "restaurant", municipality: "frederick",
    city: "Frederick", address: "1 Declared Street", state: "MD", postal_code: "21701", short_blurb: "",
    geom: { lng: -77.4, lat: 39.4 }, open_status: { state: "unknown" },
    source: "manual", feature_score: 0, is_verified: false, updated_at: "2026-10-28",
    website: "https://merchant.example/", phone: "301-555-0100", email: "hello@merchant.example",
    commerce_links: [
      { type: "reservation", provider: "opentable", url: "https://www.opentable.com/r/declared-place-frederick", source: "curated" },
      { type: "menu", provider: "website", url: "https://merchant.example/full-menu", is_primary: true, source: "curated" },
      { type: "order", provider: "website", url: "https://merchant.example/order", source: "curated" },
    ],
    hours_verified: true,
    hours: {
      thu: [{ open: "09:00", close: "17:00" }],
      _official: { slug: "declared-sheet-place", kind: "merchant", schedule_kind: "weekly", source_url: "https://merchant.example/hours",
        observed_at: "2026-10-28T12:00:00Z", expires_at: "2026-11-30T05:00:00Z", coverage_from: "2026-10-28", coverage_through: "2026-11-29", exceptions: [] },
    },
    ...overrides,
  } as PlaceCardData;
}

describe("place sheet task-first actions", () => {
  let host: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    window.history.replaceState({}, "", "/map?place=declared-sheet-place&in=frederick&c=-77.4,39.4,14");
    hoursProps.mockClear();
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ events: [{ slug: "declared-event", title: "Declared upcoming event", weekday: "Thu", day: "29", month: "Oct", time: "7 PM" }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  async function render(place = fixture(), metadataPending = false) {
    await act(async () => root.render(<PlaceSheet place={place} metadataPending={metadataPending} historyLayerId="declared-place-layer" onClose={() => {}} />));
  }
  const precedes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("brings the existing Directions, full menu and single Save beside identity before optional content", async () => {
    const place = fixture();
    // This menu previously fell behind two higher-ranked direct alternatives.
    expect(groupPlaceActions(placeActions(place), place.category).more.some(action => action.key === "menu")).toBe(true);
    const original = structuredClone({ hours: place.hours, commerce: place.commerce_links });
    await render(place);
    const row = host.querySelector("[data-place-sheet-quick-actions]")!;
    expect(row.getAttribute("aria-label")).toBe("Actions for Declared place");
    expect([...row.querySelectorAll<HTMLAnchorElement>("a")].map(link => link.dataset.placeSheetAction)).toEqual(["directions", "menu"]);
    expect(row.querySelector('[data-place-sheet-action="menu"]')?.getAttribute("href")).toBe("https://merchant.example/full-menu");
    expect(row.querySelector('[data-place-sheet-action="directions"]')?.getAttribute("href")).toContain("https://maps.apple.com/");
    expect(host.querySelectorAll('[data-save-ref="place:declared-sheet-place"]')).toHaveLength(1);
    expect(row.querySelector('[data-save-ref="place:declared-sheet-place"]')?.textContent).toBe("Save");
    expect(precedes(host.querySelector("[data-place-sheet-identity]")!, row)).toBe(true);
    expect(precedes(row, host.querySelector('button[aria-label="View Declared place photo 2"]')!)).toBe(true);
    expect(precedes(row, [...host.querySelectorAll("h3")].find(node => node.textContent === "From above")!)).toBe(true);
    expect(precedes(row, [...host.querySelectorAll("h3")].find(node => node.textContent === "Upcoming here")!)).toBe(true);
    const officialHours = host.querySelector("[data-place-sheet-official-hours]")!;
    expect(precedes(officialHours, [...host.querySelectorAll("h3")].find(node => node.textContent === "From above")!)).toBe(true);
    expect(hoursProps).toHaveBeenCalledWith(expect.objectContaining({ hours: place.hours, verified: true }));
    expect({ hours: place.hours, commerce: place.commerce_links }).toEqual(original);
  });

  it("keeps every validated action exactly once without changing its destination or direct/search label", async () => {
    const place = fixture(); await render(place);
    for (const action of placeActions(place)) {
      const links = host.querySelectorAll(`[data-place-sheet-action="${action.key}"]`);
      expect(links, action.key).toHaveLength(1);
      expect(links[0].getAttribute("href")).toBe(action.href);
      expect(links[0].textContent).toContain(action.label);
      if (action.external) expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(host.querySelector('[data-place-sheet-action="reserve"]')?.closest("section")?.getAttribute("aria-label")).toBe("Other place actions");
    expect(host.querySelector('[data-place-sheet-action="menu"]')?.closest("details")).toBeNull();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/place/declared-sheet-place/events");
  });

  it("does not manufacture a menu when the resolver has no exact menu action", async () => {
    await render(fixture({ commerce_links: [], menu_url: undefined }));
    expect(host.querySelector('[data-place-sheet-action="menu"]')).toBeNull();
    expect(host.querySelector('[data-place-sheet-quick-actions] [data-place-sheet-action="directions"]')).not.toBeNull();
    expect(host.querySelector('[data-place-sheet-action="reserve-search"]')?.textContent).toContain("Search OpenTable");
    expect(host.querySelector('[data-place-sheet-action="order-search"]')?.textContent).toContain("Search DoorDash");
    expect(host.querySelector('[data-place-sheet-action="reserve-search"]')?.closest("details")).not.toBeNull();
  });

  it("preserves parking's existing primary policy while keeping Directions in the same high row", async () => {
    await render(fixture({ category: "parking", commerce_links: [], parkmobile_zone: "1234" }));
    const row = host.querySelector("[data-place-sheet-quick-actions]")!;
    expect([...row.querySelectorAll<HTMLAnchorElement>("a")].map(link => link.dataset.placeSheetAction)).toEqual(["parking", "directions"]);
    expect(row.querySelector('[data-place-sheet-action="parking"]')?.getAttribute("href")).toContain("1234");
    expect(host.querySelectorAll('[data-place-sheet-action="directions"]')).toHaveLength(1);
  });

  it("retains the same named action row when the lead image fails or metadata is still pending", async () => {
    await render(fixture(), true);
    const row = host.querySelector("[data-place-sheet-quick-actions]")!;
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => host.querySelector('[data-place-sheet-photo] img')!.dispatchEvent(new Event("error")));
    expect(host.querySelector("[data-place-sheet-photo]")).toBeNull();
    expect(host.querySelector("[data-place-sheet-quick-actions]")).toBe(row);
    expect(host.querySelector("h2")?.textContent).toBe("Declared place");
    expect(row.querySelectorAll("a")).toHaveLength(2);
    expect(row.querySelectorAll("button")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates the sheet's scroll inset from its measured action row and releases it when content closes", async () => {
    let onResize: ResizeObserverCallback | undefined;
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    await render();
    const row = host.querySelector<HTMLElement>("[data-place-sheet-quick-actions]")!;
    const scroller = host.querySelector<HTMLElement>("[data-place-sheet-scroll]")!;
    expect(observe).toHaveBeenCalledExactlyOnceWith(row);
    const rectangle = vi.spyOn(row, "getBoundingClientRect");
    rectangle.mockReturnValue({ height: 93.2 } as DOMRect);
    await act(async () => onResize!([], {} as ResizeObserver));
    expect(scroller.style.getPropertyValue("--place-sheet-action-height")).toBe("94px");
    rectangle.mockReturnValue({ height: 151 } as DOMRect);
    await act(async () => onResize!([], {} as ResizeObserver));
    expect(scroller.style.getPropertyValue("--place-sheet-action-height")).toBe("151px");
    await act(async () => root.render(null));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(scroller.style.getPropertyValue("--place-sheet-action-height")).toBe("");
  });
});

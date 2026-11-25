// @vitest-environment jsdom
import { act, createElement, type ImgHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

// The real sheet content, Save control and labeled actions stay mounted. Only
// the sheet shell and Next's image transport are stand-ins, and no provider
// is called. The fixture does not represent a real event.
vi.mock("next/image", () => ({ default: ({ src, alt, className, style }: ImgHTMLAttributes<HTMLImageElement>) =>
  createElement("img", { src, alt, className, style }) }));
vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ present, children }: { present: boolean; children: (dismiss: () => void) => ReactNode }) => present ? <section role="dialog">{children(() => {})}</section> : null,
  SheetHandle: () => <button>Close</button>,
}));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import EventSheet from "./EventSheet";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const KEY = "fr:saved:v1";
const event = {
  slug: "sheet-actions-fixture", title: "Bluegrass jam fixture", description: "Demonstration fixture.",
  starts_at: "2029-10-10T14:00:00-04:00", ends_at: "2029-10-10T16:00:00-04:00", timezone: "America/New_York",
  venue_name: "Community hall", address: "Frederick County, Maryland", municipality: "frederick", municipality_name: "Frederick",
  category: "music", category_name: "Music", audience: [], is_free: true, source: "ticketmaster", is_verified: false,
  source_id: "sheet-actions-fixture", source_url: "https://www.ticketmaster.com/event/1A234", license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2029-10-01T12:00:00Z", last_verified_at: "2029-10-01T12:00:00Z", geom: { lat: 39.414, lng: -77.41 }, geo_confidence: "area",
} as EventWithMeta;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(KEY, "[]");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); });

function open(row: EventWithMeta = event) {
  act(() => root.render(<EventSheet event={row} onClose={() => {}} historyLayerId="sheet-actions-fixture" />));
  return host.querySelector<HTMLElement>('[role="dialog"]')!;
}

describe("the event sheet's labeled Save", () => {
  // Site audit, November 25, 2026: the sheet's only Save control was an
  // unlabeled 36px bookmark in the header.
  it("leads the labeled action row with the word Save", () => {
    const dialog = open();
    const row = dialog.querySelector<HTMLElement>("[data-event-sheet-actions]")!;
    const buttons = [...row.querySelectorAll("button")];
    expect(buttons.map(button => button.textContent)).toEqual(["Save", "Add to calendar", "Share"]);
    const save = buttons[0];
    expect(row.firstElementChild).toBe(save);
    expect(save.getAttribute("data-save-ref")).toBe(`event:${event.slug}`);
    expect(save.getAttribute("data-save-appearance")).toBe("labeled");
    expect(save.getAttribute("aria-label")).toBe("Save Bluegrass jam fixture");
    // A 44px row height, like the two labeled actions beside it.
    for (const button of buttons) expect(button.className).toMatch(/\bmin-h-11\b/);
  });

  it("is the sheet's one Save control, and the header no longer carries a bookmark", () => {
    const dialog = open();
    expect(dialog.querySelectorAll("[data-save-ref]")).toHaveLength(1);
    expect(dialog.querySelector("header button, header [data-save-ref]")).toBeNull();
    expect(dialog.querySelector("header h2")?.textContent).toBe("Bluegrass jam fixture");
  });

  it("stays first when the calendar action is withheld for an ended event", () => {
    const ended = { ...event, starts_at: "2020-10-10T14:00:00-04:00", ends_at: "2020-10-10T16:00:00-04:00" };
    const row = open(ended).querySelector<HTMLElement>("[data-event-sheet-actions]")!;
    expect([...row.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Save", "Share"]);
  });
});

describe("the event sheet's media on a wide sheet", () => {
  // Site audit, November 25, 2026: at 1440px the sheet upscaled a 504px flyer
  // to 718 by 539 and pushed the description below the fold.
  it("caps publisher artwork from the sm breakpoint up and leaves phones full width", () => {
    const dialog = open({ ...event, hero_image: "https://s1.ticketm.net/dam/a/sheet-actions-artwork.jpg" });
    const artwork = dialog.querySelector<HTMLElement>("[data-event-artwork]")!;
    expect(artwork).not.toBeNull();
    expect(artwork.className.split(/\s+/)).toEqual(expect.arrayContaining(["mt-4", "sm:max-w-[26rem]"]));
    // No unprefixed cap, so a phone keeps the full-width frame.
    expect(artwork.className).not.toMatch(/(^|\s)max-w-/);
  });

  it("caps a venue photograph the same way", () => {
    const dialog = open({ ...event, venue_name: "Baker Park", venue_place_slug: "baker-park-frederick" });
    const photo = dialog.querySelector<HTMLElement>("[data-event-venue-media]")!;
    expect(photo).not.toBeNull();
    expect(photo.className.split(/\s+/)).toEqual(expect.arrayContaining(["mt-4", "sm:max-w-[26rem]"]));
    expect(photo.className).not.toMatch(/(^|\s)max-w-/);
  });
});

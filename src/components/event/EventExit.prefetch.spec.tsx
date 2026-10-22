// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const observed = vi.hoisted(() => new Map<string, false | "auto" | undefined>());
vi.mock("next/link", () => ({ default: ({ prefetch, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: false | "auto" }) => {
  if (href) observed.set(href, prefetch);
  return <a href={href} {...props} />;
} }));
vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ present, onClose, children }: { present: boolean; onClose: () => void; children: (dismiss: () => void) => ReactNode }) => present ? <section role="dialog">{children(onClose)}</section> : null,
  SheetHandle: () => <button>Close</button>,
}));
vi.mock("@/components/saved/ItineraryButton", () => ({ default: () => null }));
vi.mock("@/components/event/EventActions", () => ({ default: () => null }));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

import EventSheet from "./EventSheet";
import { TodayEventsRecoveryView } from "@/components/today/TodayEventsRecovery";
import TodaySectionHeading from "@/components/today/TodaySectionHeading";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const endedEvent = {
  slug: "declared-ended-event", title: "Historical component fixture", description: "A fixture, not a current recommendation.",
  starts_at: "2020-10-10T14:00:00-04:00", ends_at: "2020-10-10T16:00:00-04:00", timezone: "America/New_York",
  venue_name: "Declared hall", address: "Frederick County, Maryland", municipality: "frederick", municipality_name: "Frederick",
  category: "arts", category_name: "Arts & culture", audience: [], is_free: true, source: "manual", is_verified: false,
  source_id: "component", source_url: "https://example.test/event", license: "Fixture", confidence: "curated",
  first_seen_at: "2020-10-01T12:00:00Z", last_verified_at: "2020-10-01T12:00:00Z", geom: { lat: 39.414, lng: -77.41 }, geo_confidence: "area",
} as EventWithMeta;

beforeEach(() => {
  observed.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  host.addEventListener("click", (event) => event.preventDefault());
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("optional calendar exits", () => {
  it("keeps the expired-event exit clickable and dismisses the sheet without speculative navigation", () => {
    const dismiss = vi.fn();
    act(() => root.render(<EventSheet event={endedEvent} onClose={dismiss} historyLayerId="component-event" />));
    const exit = host.querySelector<HTMLAnchorElement>('a[href="/events?lens=today"]')!;
    expect(exit.textContent).toBe("Find upcoming events");
    expect(observed.get("/events?lens=today")).toBe(false);
    act(() => exit.click());
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it.each([false, true])("does not prefetch the Today board exit with loaded=%s", (loaded) => {
    act(() => root.render(<TodayEventsRecoveryView eventsHref="/events?in=frederick" response={loaded ? { partial: false, events: [{ slug: "declared-event", title: "Declared event", venue: "Declared hall", municipality: "frederick", time: "5:00 PM", moment: "Tonight", image: null, free: true }] } : null} />));
    const exit = host.querySelector<HTMLAnchorElement>('a[href="/events?in=frederick"]')!;
    expect(exit).not.toBeNull();
    expect(exit.textContent).toContain(loaded ? "See all" : "Full board");
    expect(observed.get("/events?in=frederick")).toBe(false);
  });

  it("preserves the existing default for unrelated headings", () => {
    act(() => root.render(<TodaySectionHeading title="Places" href="/places" />));
    expect(host.querySelector('a[href="/places"]')).not.toBeNull();
    expect(observed.get("/places")).toBeUndefined();
  });
});

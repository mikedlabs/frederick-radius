// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "./EventCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Declared fixtures, not a claim about a scheduled production.
const DURING = "2026-11-25T15:00:00.000Z";
const BEFORE = "2026-09-01T15:00:00.000Z";

function fixture(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "open-abstract-studio", title: "Open Abstract Studio", description: "Declared range fixture.",
    starts_at: "2026-09-08T16:00:00.000Z", ends_at: "2026-12-09T04:59:59.000Z", timezone: "America/New_York",
    venue_name: "Delaplaine Arts Center", address: "40 S Carroll St, Frederick, MD", geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick", municipality_name: "Frederick", category: "galleries", category_name: "Galleries",
    audience: [], is_free: true, source: "manual", source_id: "open-abstract-studio",
    source_url: "https://example.test/open-abstract-studio", license: "Declared test fixture", is_verified: false,
    confidence: "curated", first_seen_at: "2026-09-01T12:00:00.000Z", last_verified_at: "2026-11-20T12:00:00.000Z",
    geo_confidence: "exact_address", ...overrides,
  };
}

function card(props: Partial<ComponentProps<typeof EventCard>> & { event?: EventWithMeta } = {}) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(EventCard, {
    event: fixture(), variant: "glance", nowISO: DURING, ...props,
  }));
  return host;
}

describe("a date-range listing in its run", () => {
  // Site audit, November 25, 2026: "Open Abstract Studio" read "through Dec 8"
  // over a "TUE SEP 8" date plate at the top of Coming up.
  it.each(["glance", "discovery", "tile", "row"] as const)("prints the closing date without the first-day plate on the %s row", (variant) => {
    const host = card({ variant });
    const when = host.querySelector("[data-event-row-when]")!;
    expect(when.textContent).toContain("through Dec 8");
    expect(when.textContent).not.toMatch(/Tue|SEP/);
    // The first day stays available to screen readers, named as a start.
    const label = when.querySelector("[data-event-row-date-label]")!;
    expect(label.textContent).toBe("Started Sep 8");
    expect(label.className).toBe("sr-only");
  });

  it("prints the closing date without the first-day plate on the feature lead", () => {
    // The Coming up lead is EventPosterCard, which applies the same rule.
    const when = card({ variant: "feature" }).querySelector("[data-event-row-when]")!;
    expect(when.textContent).toContain("through Dec 8");
    expect(when.textContent).not.toMatch(/Tue|SEP/);
    const label = when.querySelector("[data-event-row-date-label]")!;
    expect(label.textContent).toBe("Started Sep 8");
    expect(label.className).toBe("sr-only");
    // Before the run opens, and with no page clock, the lead keeps its first day.
    for (const nowISO of [BEFORE, undefined]) {
      const upcoming = card({ variant: "feature", nowISO }).querySelector("[data-event-row-when]")!;
      expect(upcoming.textContent).toMatch(/Tue\s+SEP\s+8/);
      expect(upcoming.querySelector("[data-event-row-date-label]")).toBeNull();
    }
  });

  it("does not let a caller's showDate bring the first-day plate back", () => {
    expect(card({ showDate: true }).querySelector("[data-event-row-when]")!.textContent).not.toMatch(/Tue|SEP/);
  });

  it("keeps the opening day on a range that has not opened, because that day is a real date", () => {
    const when = card({ nowISO: BEFORE }).querySelector("[data-event-row-when]")!;
    expect(when.textContent).toContain("through Dec 8");
    expect(when.textContent).toMatch(/Tue\s+SEP\s+8/);
    expect(when.querySelector("[data-event-row-date-label]")).toBeNull();
  });

  it("keeps the date on an ordinary timed event", () => {
    const concert = fixture({ slug: "evening-concert", starts_at: "2026-11-25T23:00:00.000Z", ends_at: "2026-11-26T01:00:00.000Z" });
    const when = card({ event: concert }).querySelector("[data-event-row-when]")!;
    expect(when.textContent).toMatch(/Wed\s+NOV\s+25/);
    expect(when.querySelector("[data-event-row-date-label]")).toBeNull();
  });

  it("drops the first day from the utility line", () => {
    expect(card({ variant: "utility" }).textContent).toContain("through Dec 8");
    expect(card({ variant: "utility" }).textContent).not.toMatch(/Tue|SEP/);
    expect(card({ variant: "utility", nowISO: BEFORE }).textContent).toContain("Tue SEP 8 · through Dec 8");
  });

  it("anchors the compact date pill on the closing date and says so", () => {
    const running = card({ variant: "compact" }).querySelector("article > div")!;
    expect([...running.children].map(node => node.textContent)).toEqual(["DEC", "8", "Ends"]);
    const upcoming = card({ variant: "compact", nowISO: BEFORE }).querySelector("article > div")!;
    expect([...upcoming.children].map(node => node.textContent)).toEqual(["SEP", "8", "Tue"]);
  });

  it("keeps the published start when the card has no page clock", () => {
    const when = card({ nowISO: undefined }).querySelector("[data-event-row-when]")!;
    expect(when.textContent).toMatch(/Tue\s+SEP\s+8/);
  });
});

describe("Save on Events board rows", () => {
  const SAVE = '[data-save-ref="event:open-abstract-studio"]';

  it.each(["glance", "discovery", "tile"] as const)("puts Save at the trailing edge of the %s row, outside the event link", (variant) => {
    const host = card({ variant, saveControl: true });
    const save = host.querySelector<HTMLButtonElement>(SAVE)!;
    expect(save).not.toBeNull();
    // The static HTML holds an inert placeholder until the device store is
    // read, and it never claims the saved state is unavailable.
    expect(save.outerHTML).not.toMatch(/unavailable|itinerary/i);
    expect(save.getAttribute("aria-hidden")).toBe("true");
    expect(save.getAttribute("tabindex")).toBe("-1");
    expect(save.getAttribute("data-save-appearance")).toBe("plain");
    // A 44px target of its own, never inside the row's link.
    expect(save.classList.contains("tap-44")).toBe(true);
    expect(save.closest("a")).toBeNull();
    const slot = save.closest("[data-event-row-action]")!;
    expect(slot.getAttribute("data-event-row-action")).toBe("trailing");
    // A direct child of the row, after the facts in reading and tab order.
    const article = host.querySelector("article")!;
    expect(slot.parentElement).toBe(article);
    const body = article.querySelector("[data-event-card-heading]")!;
    expect(body.contains(slot)).toBe(false);
    expect(body.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(article.querySelectorAll('a[data-decision-action="open"]')).toHaveLength(1);
  });

  it("names the mounted row Save after the event, and Saved once it is saved", async () => {
    localStorage.setItem("fr:saved:v1", "[]");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(EventCard, { event: fixture(), variant: "glance", nowISO: DURING, saveControl: true })));
      const save = host.querySelector<HTMLButtonElement>(SAVE)!;
      expect(save.getAttribute("aria-label")).toBe("Save Open Abstract Studio");
      expect(save.getAttribute("title")).toBe("Save");
      expect(save.getAttribute("aria-pressed")).toBe("false");
      expect(save.hasAttribute("aria-hidden")).toBe(false);
      expect(save.disabled).toBe(false);
      await act(async () => {
        localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "event", id: "open-abstract-studio", saved_at: "2026-11-25T15:00:00.000Z" }]));
        window.dispatchEvent(new StorageEvent("storage", { key: "fr:saved:v1", storageArea: localStorage }));
      });
      expect(save.getAttribute("aria-label")).toBe("Saved Open Abstract Studio");
      expect(save.getAttribute("aria-pressed")).toBe("true");
    } finally {
      await act(async () => root.unmount());
      host.remove();
      localStorage.clear();
    }
  });

  it("leaves every row without Save unless the surface asks for it", () => {
    for (const variant of ["glance", "discovery", "tile", "compact", "utility"] as const) {
      expect(card({ variant }).querySelector("[data-save-ref]")).toBeNull();
    }
  });

  it("keeps the dense compact and utility rows without Save", () => {
    for (const variant of ["compact", "utility"] as const) {
      expect(card({ variant, saveControl: true }).querySelector("[data-save-ref]")).toBeNull();
    }
  });

  it("keeps the itinerary row's Save under its facts", () => {
    const host = card({ variant: "row" });
    const save = host.querySelector(SAVE)!;
    expect(save.getAttribute("data-save-appearance")).toBe("boxed");
    expect(host.querySelector("[data-event-row-action]")).toBeNull();
    expect(host.querySelector("[data-event-card-heading]")!.contains(save)).toBe(true);
  });
});

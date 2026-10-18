// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { prepareEventsForBrowse } from "@/lib/events/browsePayload";
import { eventPinFromEvent } from "@/lib/map/eventPin";
import { MapEventPeek } from "@/components/map/MapEntityPeek";
import EventCard from "./EventCard";

// Declared source fixture, not a claim about a scheduled production. Real
// payload reducers and renderers remain connected across a JSON boundary.
const NOW = new Date("2030-04-18T16:00:00.000Z");
const BOUNDS = buildHorizonBounds(NOW);
const CARD_VARIANTS = ["utility", "compact", "glance", "row", "tile", "feature"] as const;
const DISPLAY_TITLE = "Other Voices Theatre: Live Theatre Production";

function sourceEvent(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "identity-theatre-fixture",
    title: "Live Theatre Production",
    presenter: "Other Voices Theatre",
    description: "Declared event identity fixture.",
    starts_at: "2030-04-18T22:00:00.000Z",
    ends_at: "2030-04-19T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Baker Park",
    address: "121 N Bentz St, Frederick, MD",
    geom: { lng: -77.4201, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "city-frederick",
    source_id: "identity-theatre-fixture",
    source_url: "https://www.cityoffrederickmd.gov/calendar",
    license: "Declared test fixture",
    is_verified: true,
    confidence: "verified",
    first_seen_at: "2030-04-17T12:00:00.000Z",
    last_verified_at: "2030-04-18T14:00:00.000Z",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
    ...overrides,
  };
}

function browseEvent(source: EventWithMeta): EventWithMeta {
  const payload = JSON.parse(JSON.stringify(prepareEventsForBrowse([source], BOUNDS))) as EventWithMeta[];
  expect(payload).toHaveLength(1);
  return payload[0];
}

function cardRoot(event: EventWithMeta, variant: typeof CARD_VARIANTS[number]) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(createElement(EventCard, {
    event, variant, nowISO: NOW.toISOString(), priorityImage: false,
  }));
  return container;
}

describe("event identity across source, browse payload and map pin boundaries", () => {
  it.each(CARD_VARIANTS)("keeps presenter identity on the %s browse card", (variant) => {
    const source = sourceEvent();
    const payload = browseEvent(source);
    const container = cardRoot(payload, variant);
    const eventLink = container.querySelector(`a[href="/events/${source.slug}"]`);

    expect(eventLink?.textContent).toContain(DISPLAY_TITLE);
    expect(payload.title).toBe("Live Theatre Production");
    expect(payload.presenter).toBe("Other Voices Theatre");
    expect(source.title).toBe("Live Theatre Production");
    expect(source.presenter).toBe("Other Voices Theatre");
    if (variant === "row") {
      expect(container.querySelector(`[data-save-ref="event:${source.slug}"]`)?.getAttribute("aria-label"))
        .toContain(DISPLAY_TITLE);
    }
  });

  it.each(CARD_VARIANTS)("keeps legacy title-only payloads usable on the %s card", (variant) => {
    const source = sourceEvent({ presenter: undefined });
    const payload = browseEvent(source);
    const container = cardRoot(payload, variant);
    const eventLink = container.querySelector(`a[href="/events/${source.slug}"]`);

    expect(payload).not.toHaveProperty("presenter");
    expect(eventLink?.textContent).toContain(source.title);
    expect(container.textContent).not.toMatch(/Other Voices Theatre|undefined/);
  });

  it("does not repeat a presenter already named in the canonical browse title", () => {
    const source = sourceEvent({ title: DISPLAY_TITLE });
    const container = cardRoot(browseEvent(source), "glance");
    const eventLink = container.querySelector(`a[href="/events/${source.slug}"]`);

    expect(eventLink?.textContent?.match(/Other Voices Theatre/g)).toHaveLength(1);
    expect(source.title).toBe(DISPLAY_TITLE);
  });

  it.each([
    { presenter: "Other Voices Theatre", displayTitle: DISPLAY_TITLE },
    { presenter: undefined, displayTitle: "Live Theatre Production" },
  ])("keeps the map preview and its accessible identity aligned ($displayTitle)", ({ presenter, displayTitle }) => {
    const source = sourceEvent({ presenter });
    const pin = JSON.parse(JSON.stringify(eventPinFromEvent(source, NOW))) as ReturnType<typeof eventPinFromEvent>;
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(MapEventPeek, { event: pin, onClose: () => {} }));

    expect(container.querySelector(".map-peek-name")?.textContent).toBe(displayTitle);
    expect(container.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe(displayTitle);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(`Close ${displayTitle}`);
    expect(container.querySelector(`a[href^="/events/${source.slug}"]`)?.textContent).toBe("Event details");
    expect(container.querySelector(".map-peek-detail")?.textContent).toBe("Baker Park");
    expect(pin.title).toBe("Live Theatre Production");
    expect(pin.presenter).toBe(presenter);
    expect(pin.lng).toBe(source.geom.lng);
    expect(pin.lat).toBe(source.geom.lat);
    expect(source.title).toBe("Live Theatre Production");
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "./EventCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "bluegrass-jam",
    title: "Bluegrass Jam",
    description: "",
    starts_at: "2026-10-08T23:00:00.000Z",
    ends_at: "2026-10-09T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Steinhardt Brewing Company",
    address: "340 E Patrick St, Frederick, MD",
    geom: { lng: -77.4, lat: 39.41 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
    last_verified_at: "2026-10-07T12:00:00.000Z",
    hero_image: "/api/place-photo?name=places%2Fsteinhardt%2Fphotos%2Fone&w=800",
    hero_image_attribution: {
      kind: "venue",
      venue_name: "Steinhardt Brewing Company",
      provider: "google_maps",
      source_uri: "https://www.google.com/maps/place/steinhardt",
      flag_content_uri: "https://www.google.com/local/imagery/report/",
      authors: [
        { display_name: "A H", uri: "https://maps.google.com/maps/contrib/1" },
      ],
    },
    ...overrides,
  } as EventWithMeta;
}

async function settle(img: HTMLImageElement, outcome: "photo" | "signal" | "error") {
  await act(async () => {
    if (outcome === "error") {
      img.dispatchEvent(new Event("error"));
      return;
    }
    const size = outcome === "photo" ? 640 : 1;
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: size },
      naturalHeight: { configurable: true, value: size },
    });
    img.dispatchEvent(new Event("load"));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("EventCard glance photo honesty", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<EventCard event={event()} variant="glance" />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const credit = () => container.querySelector("[data-event-photo-credit]");
  const thumb = () => container.querySelector("[data-event-card-thumb]");

  it("asks for the failure signal and withholds the credit while loading", () => {
    const img = container.querySelector("img")!;

    expect(img.getAttribute("src")).toContain("fallback=signal");
    expect(thumb()).not.toBeNull();
    expect(credit()).toBeNull();
  });

  it("credits a real photo outside the event link once it loads", async () => {
    await settle(container.querySelector("img")!, "photo");

    const link = container.querySelector('a[href="/events/bluegrass-jam"]')!;
    expect(credit()).not.toBeNull();
    expect(link.contains(credit())).toBe(false);
    expect(credit()?.textContent).toContain("Photo by A H");
    expect(credit()?.textContent).toContain("Report photo");
  });

  it.each(["signal", "error"] as const)(
    "drops both the thumbnail and its credit on a proxy %s",
    async (outcome) => {
      await settle(container.querySelector("img")!, outcome);

      expect(thumb()).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(credit()).toBeNull();
      expect(container.textContent).not.toContain("Photo by");
      // The text still reads as a complete card.
      expect(container.querySelector("h3")?.textContent).toBe("Bluegrass Jam");
    },
  );
});

describe("EventCard glance venue line", () => {
  it("wraps a long venue to two lines instead of cutting it at 160px", () => {
    const html = renderToStaticMarkup(
      <EventCard event={event({ hero_image: undefined })} variant="glance" />,
    );

    expect(html).not.toContain("max-w-[160px]");
    expect(html).toContain('<span class="line-clamp-2 leading-snug">Steinhardt Brewing Company');
  });
});

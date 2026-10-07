// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventPosterCard from "./EventPosterCard";

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

describe("EventPosterCard photo honesty", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const poster = () =>
    container.querySelector("[data-event-poster]")?.getAttribute("data-event-poster");
  const credit = () => container.querySelector("[data-event-photo-credit]");

  it("credits the venue photographer only after the photo loads, outside the card", async () => {
    await act(async () => root.render(<EventPosterCard event={event()} />));
    expect(poster()).toBe("photo");
    expect(credit()).toBeNull();
    expect(container.textContent).not.toContain("A H");

    await settle(container.querySelector("img")!, "photo");

    expect(credit()).not.toBeNull();
    expect(container.textContent).toContain("A H");
    expect(container.querySelector("article")!.contains(credit())).toBe(false);
  });

  it.each(["signal", "error"] as const)(
    "turns a proxy %s into the date-led card with no credit",
    async (outcome) => {
      await act(async () => root.render(<EventPosterCard event={event()} />));
      await settle(container.querySelector("img")!, outcome);

      expect(poster()).toBe("category");
      expect(container.querySelector("[data-event-fallback]")).not.toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(credit()).toBeNull();
      expect(container.textContent).toContain("Bluegrass Jam");
    },
  );

  it("captions a publisher flyer after it loads and never sets type over it", async () => {
    await act(async () =>
      root.render(
        <EventPosterCard
          event={event({
            source: "ticketmaster",
            hero_image: "https://s1.ticketm.net/dam/a/jam-flyer.jpg",
            hero_image_attribution: undefined,
          })}
        />,
      ),
    );
    const img = container.querySelector("img")!;
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("ken-burns");
    expect(container.textContent).not.toContain("Event image · Ticketmaster");

    await settle(img, "photo");

    expect(container.textContent).toContain("Event image · Ticketmaster");
    // The flyer's frame holds only the image: the title is a sibling below it.
    const frame = container.querySelector("[data-radius-photo]")!;
    expect(frame.textContent).toBe("");
    expect(frame.querySelectorAll("img")).toHaveLength(1);
  });
});

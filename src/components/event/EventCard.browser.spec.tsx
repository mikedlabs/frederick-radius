// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard, { eventRowMark } from "./EventCard";

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
    ...overrides,
  } as EventWithMeta;
}

/** A Downtown Frederick Partnership listing with its approved flyer. */
const flyerEvent = (overrides: Partial<EventWithMeta> = {}) =>
  event({
    slug: "game-night",
    title: "Game Night",
    source: "dfp",
    source_url: "https://www.downtownfrederick.org/events/game-night",
    hero_image: "https://ik.imagekit.io/vibemap/events/game-night.jpg",
    ...overrides,
  });

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

describe("EventCard row flyer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<EventCard event={flyerEvent()} variant="glance" />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const thumb = () => container.querySelector("[data-event-card-thumb]");

  it("shows the flyer uncropped, decorative and inside the row's one link", () => {
    const img = container.querySelector("img")!;
    const links = container.querySelectorAll("a");

    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/events/game-night");
    expect(links[0].contains(thumb())).toBe(true);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");
    // Nothing is drawn over the flyer: the frame holds only the image.
    expect(thumb()?.querySelectorAll("img")).toHaveLength(1);
    expect(thumb()?.textContent).toBe("");
  });

  it("never prints a credit in the row, even after the flyer loads", async () => {
    await settle(container.querySelector("img")!, "photo");

    expect(thumb()).not.toBeNull();
    expect(container.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(container.textContent).not.toContain("Event image");
  });

  it.each(["signal", "error"] as const)(
    "removes the frame on a %s and leaves a complete text row",
    async (outcome) => {
      await settle(container.querySelector("img")!, outcome);

      expect(thumb()).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      // No glyph or mark takes the flyer's place.
      expect(container.querySelector("[data-radius-photo]")).toBeNull();
      expect(container.querySelector("h3")?.textContent).toBe("Game Night");
      expect(container.querySelector("[data-date-plate]")).not.toBeNull();
    },
  );
});

describe("EventCard row grammar", () => {
  const html = (e: EventWithMeta, props: Partial<Parameters<typeof EventCard>[0]> = {}) =>
    renderToStaticMarkup(<EventCard event={e} variant="glance" {...props} />);

  it.each(["glance", "compact", "utility", "row"] as const)(
    "renders the %s variant as the one row",
    (variant) => {
      const markup = renderToStaticMarkup(<EventCard event={event()} variant={variant} />);
      expect(markup).toContain("data-event-row");
      expect(markup).toContain('data-date-plate="sm"');
      expect(markup).toContain("min-h-[72px]");
      expect(markup).toContain('<h3 class="text-title-sm line-clamp-2"');
      // No card chrome, no Plum rail, no category dot.
      expect(markup).not.toContain("inset 3px 0");
      expect(markup).not.toContain("rounded-[var(--app-radius-md)] border");
      expect(markup).not.toContain("--app-elev-1");
      expect(markup).not.toMatch(/background:#[0-9a-f]{3,8}/i);
    },
  );

  it("prints start time, venue and town on one meta line", () => {
    const markup = html(event({ hero_image: undefined }));
    const meta = markup.match(/data-event-row-meta="true"[^>]*>(.*?)<\/p>/)?.[1] ?? "";
    expect(meta.replace(/<[^>]+>/g, "")).toBe("7:00 PM · Steinhardt Brewing Company · Frederick");
  });

  it("drops the end-time caution from rows", () => {
    const markup = html(event({ ends_at: "2026-10-08T23:00:00.000Z" }));
    expect(markup).not.toContain("end time not listed");
    expect(markup).toContain(">7:00 PM<");
  });

  it("marks Free in Forest, or Tickets, never both", () => {
    const free = html(event({ is_free: true, ticket_url: "https://tickets.example/x" }));
    expect(free).toContain('style="color:var(--app-brand-2)">Free</span>');
    expect(free).not.toContain(">Tickets<");

    const paid = html(event({ is_free: false, ticket_url: "https://tickets.example/x" }));
    expect(paid).toContain(">Tickets<");
    expect(paid).not.toContain(">Free<");

    const none = html(event({ is_free: false, ticket_url: undefined, price_text: undefined }));
    expect(none).not.toContain("data-event-row-mark");

    expect(eventRowMark({ is_free: false, price_text: "$25" })).toBe("tickets");
    expect(eventRowMark({ is_free: false, price_text: "  " })).toBeNull();
  });

  it("shows an Amber dot and Now instead of the time while confirmed live", () => {
    const live = html(event(), { live: true, nowISO: "2026-10-08T23:30:00.000Z" });
    expect(live).toContain("live-dot");
    expect(live).toContain("background:var(--app-amber)");
    expect(live).toContain("Now</span>");
    expect(live).not.toContain(">7:00 PM<");

    // A live prop without a usable end is refused.
    const unknownEnd = html(event({ ends_at: "2026-10-08T23:00:00.000Z" }), {
      live: true,
      nowISO: "2026-10-08T23:30:00.000Z",
    });
    expect(unknownEnd).not.toContain("live-dot");
    expect(unknownEnd).toContain("Started at 7:00 PM");
  });

  it("gives an event without a flyer no picture frame at all", () => {
    const venuePhoto = html(
      event({
        hero_image: "/api/place-photo?name=places%2Fsteinhardt%2Fphotos%2Fone&w=800",
        hero_image_attribution: {
          kind: "venue",
          venue_name: "Steinhardt Brewing Company",
          provider: "google_maps",
          source_uri: "https://www.google.com/maps/place/steinhardt",
          authors: [{ display_name: "A H" }],
        },
      }),
    );
    expect(venuePhoto).not.toContain("<img");
    expect(venuePhoto).not.toContain("data-event-card-thumb");
    expect(venuePhoto).not.toContain("data-radius-photo");

    const owned = html(event({ venue_place_slug: "carroll-creek-linear-park-frederick" }));
    expect(owned).not.toContain("<img");
  });

  it("omits the date plate when the surface already names the day", () => {
    const markup = html(event(), { variant: "utility", hideDate: true });
    expect(markup).not.toContain("data-date-plate");
    expect(markup).toContain(">7:00 PM<");
  });

  it("keeps a cancelled listing visible and says so first", () => {
    const markup = html(event({ status: "cancelled" }));
    expect(markup).toContain("line-through");
    expect(markup).toMatch(/color:var\(--app-danger\)">Cancelled/);
  });

  it("keeps the Day Plan button beside the row variant, outside its link", () => {
    const markup = renderToStaticMarkup(<EventCard event={event()} variant="row" />);
    const link = markup.slice(markup.indexOf("<a "), markup.indexOf("</a>"));
    expect(markup).toContain('aria-label="Add Bluegrass Jam to itinerary"');
    expect(link).not.toContain("<button");
  });
});

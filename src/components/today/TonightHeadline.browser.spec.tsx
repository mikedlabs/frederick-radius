// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import TonightHeadline from "./TonightHeadline";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "summer-concert",
    title: "Summer concert",
    description: "",
    starts_at: "2026-07-26T23:00:00.000Z",
    ends_at: "2026-07-27T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    geo_confidence: "area",
    category_name: "Music",
    municipality_name: "Frederick",
    last_verified_at: "2026-07-23T12:00:00.000Z",
    hero_image: "/api/place-photo?name=places%2Fvenue-photo&w=800",
    hero_image_attribution: {
      kind: "venue",
      venue_name: "Test venue",
      provider: "google_maps",
      source_uri: "https://maps.google.com/?cid=123",
      flag_content_uri: "https://support.google.com/legal/troubleshooter/1114905",
      authors: [
        { display_name: "Test photographer", uri: "https://maps.google.com/contrib/123" },
      ],
    },
    ...overrides,
  } as EventWithMeta;
}

const now = new Date("2026-07-26T16:00:00.000Z");

async function settle(img: HTMLImageElement, outcome: "photo" | "signal" | "error") {
  await act(async () => {
    if (outcome === "error") {
      img.dispatchEvent(new Event("error"));
      return;
    }
    const size = outcome === "photo" ? 1440 : 1;
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

describe("TonightHeadline photo honesty", () => {
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

  it("credits the venue photo after it loads, outside the event link", async () => {
    await act(async () =>
      root.render(<TonightHeadline event={event()} now={now} embedded />),
    );
    expect(container.textContent).not.toContain("Test photographer");

    await settle(container.querySelector("img")!, "photo");

    const link = container.querySelector('a[href="/events/summer-concert"]')!;
    expect(container.textContent).toContain("Venue · Test venue");
    expect(container.textContent).toContain("Test photographer");
    expect(link.textContent).not.toContain("Test photographer");
    expect(link.querySelector("figure img")).not.toBeNull();
  });

  it.each(["signal", "error"] as const)(
    "falls back to the photoless headline on a proxy %s",
    async (outcome) => {
      await act(async () =>
        root.render(<TonightHeadline event={event()} now={now} embedded />),
      );
      await settle(container.querySelector("img")!, outcome);

      const link = container.querySelector('a[href="/events/summer-concert"]')!;
      expect(container.querySelector("img")).toBeNull();
      expect(link.className).toContain("border-y");
      expect(link.textContent).toContain("View event");
      expect(container.textContent).not.toContain("Test photographer");
      // One title, one link: the photo layout is gone, not hidden beside it.
      expect(container.querySelectorAll("#today-headliner-summer-concert-title")).toHaveLength(1);
    },
  );
});

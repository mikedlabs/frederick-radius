import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MapList from "./MapList";
import type { MapPinPlace } from "./types";

function place(slug: string, extra: Record<string, unknown> = {}): MapPinPlace {
  return {
    slug,
    name: slug,
    category: "pizza",
    subcategories: [],
    geom: { lng: -77.41, lat: 39.41 },
    open_status: { state: "unknown" },
    source: "manual",
    is_verified: true,
    municipality: "frederick",
    short_blurb: "A test place.",
    ...extra,
  } as MapPinPlace;
}

function render(places: MapPinPlace[]): string {
  return renderToStaticMarkup(
    createElement(MapList, {
      places,
      events: [],
      userLoc: null,
      sortOrigin: { lng: -77.41, lat: 39.41 },
      onPick: () => undefined,
      onPickEvent: () => undefined,
    }),
  );
}

describe("map list row visuals", () => {
  it("asks the photo proxy for its failure signal, so its plate never reads as a photo", () => {
    const html = render([
      place("cugino-forno", { google_photo_url: "/api/place-photo?name=places%2Fcugino&w=800" }),
    ]);

    expect(html).toContain("fallback=signal");
    expect(html).toContain('data-radius-photo="loading"');
  });

  it("gives a photoless row the flat category mark, never the ripple or a gradient", () => {
    const html = render([place("dop-pizza")]);

    expect(html).toContain('data-photo-state="fallback"');
    expect(html).toContain('data-radius-photo="mark"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("gradient");
  });
});

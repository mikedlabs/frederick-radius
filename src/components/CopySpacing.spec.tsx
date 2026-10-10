// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AerialBeat from "@/components/place/AerialBeat";
import Passport from "@/components/saved/Passport";
import DaylightLeftInline from "@/components/today/DaylightLeftInline";
import WeekendPreview from "@/components/today/WeekendPreview";
import type { PlaceCardData } from "@/lib/loaders/places";

const { saved } = vi.hoisted(() => ({
  saved: [{ type: "place", id: "baker-park", saved_at: "2026-10-08T16:00:00.000Z" }],
}));
vi.mock("@/hooks/useSaved", () => ({ useSavedList: () => saved }));
vi.mock("@/hooks/useBeenHere", () => ({ useBeenList: () => [] }));
vi.mock("@/hooks/useNotes", () => ({ useAllNotes: () => ({}) }));
vi.mock("@/lib/aerial", () => ({
  nearestAerial: () => ({ src: "/photos/test-aerial.jpg", season: "fall", altM: 100 }),
  currentSeason: () => "fall",
}));
vi.mock("@/lib/sun", () => ({
  sunTimes: () => ({
    sunrise: new Date("2026-10-08T10:00:00.000Z"),
    sunset: new Date("2026-10-08T21:55:00.000Z"),
  }),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// Inspect real rendered copy, including spaces between React text nodes.
// Flex/block siblings can be adjacent in textContent while remaining separate
// labels, so only inspect the specific inline sentence/count under test.
const joinedUnits = /\b\d+(?:h|m|km|mi)(?=[A-Za-z])|\b\d+of\d+\b|\b\d+on the calendar\b/;
function copy(element: Element | null): string {
  const text = element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  expect(text).not.toMatch(joinedUnits);
  return text;
}
function markup(html: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}
afterEach(() => { vi.useRealTimers(); });

describe("Rendered copy boundaries", () => {
  it("keeps duration units and the daylight explanation separated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T16:00:00.000Z"));
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => { root.render(createElement(DaylightLeftInline)); });
    expect(copy(container)).toBe("· 5h 55m of daylight left");
    await act(async () => root.unmount());
  });

  it("keeps the earned count separate from its denominator", () => {
    const places = new Map([[
      "baker-park", { municipality: "frederick" } as PlaceCardData,
    ]]);
    const container = markup(renderToStaticMarkup(createElement(Passport, { placesBySlug: places })));
    expect(copy(container.querySelector("header span:last-child"))).toBe("2 of 24");
  });

  it("keeps the area name separate from its aerial caption", () => {
    const container = markup(renderToStaticMarkup(createElement(AerialBeat, { lat: 39.4, lng: -77.4, label: "Frederick" })));
    expect(copy(container.querySelector("figcaption p:last-child"))).toBe("Frederick from the air");
  });

  it("keeps the calendar count separate from its explanatory words", async () => {
    const events = Array.from({ length: 76 }, (_, index) => ({
      slug: `test-event-${index}`, title: "Library workshop", category: "family",
      starts_at: "2026-10-10T18:00:00.000Z", ends_at: "2026-10-10T19:00:00.000Z",
      municipality: "frederick", venue_name: "Test library",
    }));
    const element = await WeekendPreview({
      now: new Date("2026-10-08T16:00:00.000Z"),
      eventsPromise: Promise.resolve({ publicEvents: events }) as Parameters<typeof WeekendPreview>[0]["eventsPromise"],
    });
    const container = markup(renderToStaticMarkup(element));
    const sentence = [...container.querySelectorAll("span")].find((span) => span.textContent?.startsWith("First up "));
    expect(copy(sentence ?? null)).toContain("76 on the calendar so far");
  });
});

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapInViewPlacesDisclosure, {
  rankPlacesInView,
} from "./MapInViewPlacesDisclosure";
import type { MapPinPlace } from "./types";

vi.mock("@/lib/haptics", () => ({ haptic: () => undefined }));

function place(slug: string, lng: number): MapPinPlace {
  return {
    slug,
    name: slug.replaceAll("-", " "),
    category: "coffee",
    subcategories: [],
    geom: { lng, lat: 39.4143 },
    open_status: { state: "open", closesAt: "21:00", closingSoon: false },
    source: "manual",
    is_verified: true,
    municipality: "frederick",
    short_blurb: "A test place.",
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("rankPlacesInView", () => {
  it("uses distance when an honest origin exists and preserves input order otherwise", () => {
    const places = [
      place("west", -77.7),
      place("center", -77.41),
      place("east", -77.2),
    ];

    expect(rankPlacesInView(places, null).map((item) => item.slug)).toEqual([
      "west",
      "center",
      "east",
    ]);
    expect(
      rankPlacesInView(places, { lng: -77.19, lat: 39.4143 }).map(
        (item) => item.slug,
      ),
    ).toEqual(["east", "center", "west"]);
  });
});

describe("MapInViewPlacesDisclosure", () => {
  it("starts as one compact native disclosure with no map-covering panel", async () => {
    await act(async () => {
      root.render(
        createElement(MapInViewPlacesDisclosure, {
          places: [place("gravel-and-grind", -77.41)],
          sortOrigin: { lng: -77.4105, lat: 39.4143 },
          onPick: vi.fn(),
        }),
      );
    });

    const details = container.querySelector("details");
    const summary = container.querySelector("summary");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(summary?.textContent).toContain("Places in this view");
    expect(summary?.getAttribute("style")).toContain("min-height: 52px");
    expect(container.querySelector("[data-map-in-view-places]")).not.toBeNull();
    expect(container.innerHTML).not.toContain("position:fixed");
    expect(container.innerHTML).not.toContain("position:absolute");
  });

  it("provides named 44px place controls and opens the existing map result", async () => {
    const onPick = vi.fn();
    const gravel = place("gravel-and-grind", -77.41);
    await act(async () => {
      root.render(
        createElement(MapInViewPlacesDisclosure, {
          places: [gravel],
          sortOrigin: { lng: -77.4105, lat: 39.4143 },
          onPick,
          selectedSlug: gravel.slug,
        }),
      );
    });

    const row = container.querySelector<HTMLButtonElement>(
      '[data-map-in-view-place="gravel-and-grind"]',
    );
    expect(row).not.toBeNull();
    expect(row?.type).toBe("button");
    expect(row?.textContent).toContain("Open map result for");
    expect(row?.textContent).toContain("gravel and grind");
    expect(row?.getAttribute("style")).toContain("min-height: 44px");
    expect(row?.getAttribute("aria-current")).toBe("location");

    act(() => row?.click());
    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith(gravel);
  });

  it("reveals a bounded page at a time and resets after the disclosure closes", async () => {
    const places = Array.from({ length: 7 }, (_, index) =>
      place(`place-${index + 1}`, -77.41 - index * 0.001),
    );
    await act(async () => {
      root.render(
        createElement(MapInViewPlacesDisclosure, {
          places,
          sortOrigin: null,
          onPick: vi.fn(),
          pageSize: 3,
        }),
      );
    });

    const rows = () =>
      container.querySelectorAll("[data-map-in-view-place]").length;
    expect(rows()).toBe(3);

    const more = container.querySelector<HTMLButtonElement>(
      'button[aria-controls]',
    );
    expect(more?.textContent).toContain("Show 3 more places");
    act(() => more?.click());
    expect(rows()).toBe(6);

    const details = container.querySelector("details");
    act(() => {
      if (!details) return;
      details.open = true;
      details.dispatchEvent(new Event("toggle", { bubbles: false }));
    });
    act(() => {
      if (!details) return;
      details.open = false;
      details.dispatchEvent(new Event("toggle", { bubbles: false }));
    });
    expect(rows()).toBe(3);
  });

  it("keeps an honest empty state inside the requested disclosure", async () => {
    await act(async () => {
      root.render(
        createElement(MapInViewPlacesDisclosure, {
          places: [],
          sortOrigin: null,
          onPick: vi.fn(),
        }),
      );
    });

    expect(container.textContent).toContain("0 places");
    expect(container.textContent).toContain(
      "No matching places are visible in this area.",
    );
    expect(container.querySelectorAll("[data-map-in-view-place]")).toHaveLength(
      0,
    );
  });
});

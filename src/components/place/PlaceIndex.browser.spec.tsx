// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./PlaceSheetProvider", () => ({
  usePlaceSheet: () => ({ openSheet: vi.fn() }),
}));
vi.mock("@/data/place-hues.json", () => ({
  default: { "black-hog-bbq-bar": "#3684E2" },
}));
// The pin map's MapLibre chunk never mounts here; the pins are drawn in DOM.
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import { LIKELY_OPEN_CHECK_HOURS } from "@/lib/trust-language";
import PlaceIndex, { type IndexRow } from "./PlaceIndex";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function row(overrides: Partial<IndexRow> = {}): IndexRow {
  return {
    slug: "black-hog-bbq-bar",
    name: "Black Hog BBQ Bar",
    meta: "Restaurants",
    photo: null,
    category: "restaurant",
    accent: "var(--app-brand)",
    status: { kind: "open", label: "Until 10 PM" },
    closesMin: 1320,
    rating: 4.6,
    ratingCount: 1728,
    mark: "happy hour",
    distance: null,
    ...overrides,
  };
}

describe("PlaceIndex picture rows", () => {
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

  const render = async (rows: IndexRow[]) => {
    await act(async () =>
      root.render(<PlaceIndex sections={[{ key: "eat", label: "Eat & drink", rows }]} />),
    );
  };

  it("draws the mark in neutral ink, in sentence case, never Plum", async () => {
    await render([row()]);

    const mark = container.querySelector<HTMLElement>("[data-row-mark]");
    expect(mark?.textContent).toBe("Happy hour");
    expect(mark?.style.color).toBe("var(--app-ink-2)");
    expect(container.innerHTML).not.toContain("--app-accent");
  });

  it("prints the rating with its review count and source", async () => {
    await render([row()]);

    const rating = container.querySelector("[data-place-rating]");
    expect(rating?.textContent).toContain("4.6");
    expect(rating?.textContent).toContain("(1,728)");
    expect(rating?.textContent).toContain("Google Maps");
  });

  it("leads each row with a 48px picture tile, the place's color when photoless", async () => {
    await render([row()]);
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    const mark = container.querySelector<HTMLElement>('[data-radius-photo="mark"]');
    expect(mark?.style.width).toBe("48px");
    expect(mark?.style.background).toContain("#3684E2");
  });

  it("separates flat rows with a 1px rule instead of a shadowed plate", async () => {
    await render([row(), row({ slug: "two", name: "Two" })]);

    const list = container.querySelector("ul")!;
    expect(list.getAttribute("style") ?? "").not.toContain("box-shadow");
    const items = [...list.querySelectorAll("li")];
    expect(items.every((item) => item.style.borderBottom === "1px solid var(--app-border)")).toBe(
      true,
    );
  });
});

describe("PlaceIndex pin map", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  // Ranked order is Cafe, Bistro, Alehouse, Diner; A to Z reverses the
  // first three. The diner has no catalog point.
  const rows = [
    row({ slug: "cafe", name: "Cafe", lng: -77.41, lat: 39.414, closesMin: 1300 }),
    row({ slug: "bistro", name: "Bistro", lng: -77.412, lat: 39.415, closesMin: 1200 }),
    row({ slug: "alehouse", name: "Alehouse", lng: -77.409, lat: 39.416, closesMin: 1400 }),
    row({ slug: "diner", name: "Diner", closesMin: 1100 }),
  ];

  const renderPinned = async () => {
    await act(async () =>
      root.render(
        <PlaceIndex
          sections={[
            { key: "eat", label: "Eat & drink", rows },
            { key: "shop", label: "Shops & markets", rows: [row({ slug: "shop", name: "Shop" })] },
          ]}
          pinMap={{
            sectionKey: "eat",
            name: "places whose recently checked hours say they are open",
            fullMap: { href: "/map?mode=browse&open=now", label: "Open the full map" },
          }}
        />,
      ),
    );
  };

  const numberBySlug = () =>
    Object.fromEntries(
      [...container.querySelectorAll<HTMLElement>("[data-place-row]")].map((cell) => [
        cell.getAttribute("aria-label")?.split(".")[0],
        cell.querySelector("[data-pin-number]")?.textContent ?? "none",
      ]),
    );

  it("leads the pinned section with the map and a quiet link to the full map", async () => {
    await renderPinned();

    const map = container.querySelector("[data-index-pin-map]");
    expect(map).not.toBeNull();
    expect(map?.compareDocumentPosition(container.querySelector("section")!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(map?.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "Locations of places whose recently checked hours say they are open: 1 Cafe, 2 Bistro, 3 Alehouse",
    );
    const link = [...container.querySelectorAll("a")].find(
      (anchor) => anchor.textContent === "Open the full map",
    );
    expect(link?.getAttribute("href")).toBe("/map?mode=browse&open=now");
    expect(container.querySelectorAll("[data-index-pin-map]")).toHaveLength(1);
  });

  it("numbers the pinned rows like their pins and keeps the column for a row with no point", async () => {
    await renderPinned();

    expect(numberBySlug()).toEqual({
      Cafe: "1",
      Bistro: "2",
      Alehouse: "3",
      Diner: "",
      // Other sections are not numbered and keep no column.
      Shop: "none",
    });
  });

  it("recomputes the numbers when the sort changes", async () => {
    await renderPinned();
    const az = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "A to Z",
    )!;
    await act(async () => az.click());

    expect(numberBySlug()).toMatchObject({ Alehouse: "1", Bistro: "2", Cafe: "3", Diner: "" });
    expect(
      container.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toBe(
      "Locations of places whose recently checked hours say they are open: 1 Alehouse, 2 Bistro, 3 Cafe",
    );
  });

  it("prints no numbers when fewer than two rows can be pinned", async () => {
    await act(async () =>
      root.render(
        <PlaceIndex
          sections={[{ key: "eat", label: "Eat & drink", rows: [rows[0], rows[3]] }]}
          pinMap={{ sectionKey: "eat" }}
        />,
      ),
    );

    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.querySelector("[data-pin-number]")).toBeNull();
  });

  it("reads likely-open pins as likely, the way /open-now names them when that list leads", async () => {
    // /open-now with no recently checked hours: only the likely list renders,
    // unsorted, and it carries the map. Its pins must not be read aloud as
    // places that are open now.
    await act(async () =>
      root.render(
        <PlaceIndex
          sections={[{ key: "likely", label: LIKELY_OPEN_CHECK_HOURS, rows }]}
          showSort={false}
          pinMap={{
            sectionKey: "likely",
            name: "places likely open at this hour",
            fullMap: { href: "/map?mode=browse&open=now", label: "Open the full map" },
          }}
        />,
      ),
    );

    const label = container.querySelector('[role="img"]')?.getAttribute("aria-label");
    expect(label).toBe("Locations of places likely open at this hour: 1 Cafe, 2 Bistro, 3 Alehouse");
    expect(label).not.toMatch(/open now/i);
    expect(numberBySlug()).toEqual({ Cafe: "1", Bistro: "2", Alehouse: "3", Diner: "" });
  });
});

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real canvas is the lazily imported MapLibre chunk; it never mounts in
// these tests because no IntersectionObserver fires.
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockOwnedMiniMapCanvas() {
      return createElement("div", { "data-test-canvas": "" });
    },
}));

import ResultsPinMap, {
  PinNumber,
  RESULTS_PIN_CAP,
  mappedPinNumbers,
  pinNumbersFor,
  pinRowFor,
  resultsPinsFor,
  type ResultsPinRow,
} from "./ResultsPinMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** A row on a downtown Frederick block, or one with no point at all. */
function row(slug: string, point = true): ResultsPinRow {
  return point
    ? { slug, name: slug, lng: -77.41 + slug.length / 10_000, lat: 39.41 }
    : { slug, name: slug };
}

describe("pinNumbersFor", () => {
  it("numbers only rows with coordinates, by position among pinned rows", () => {
    const numbers = pinNumbersFor([row("a"), row("b", false), row("c"), row("d")]);
    expect([...numbers.entries()]).toEqual([
      ["a", 1],
      ["c", 2],
      ["d", 3],
    ]);
    expect(numbers.has("b")).toBe(false);
  });

  it("keeps the input order rather than sorting", () => {
    const numbers = pinNumbersFor([row("zeta"), row("alpha"), row("mu")]);
    expect([...numbers.keys()]).toEqual(["zeta", "alpha", "mu"]);
  });

  it("stops at nine pins", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`p${i + 1}`));
    const numbers = pinNumbersFor(rows);
    expect(RESULTS_PIN_CAP).toBe(9);
    expect(numbers.size).toBe(9);
    expect(numbers.get("p9")).toBe(9);
    expect(numbers.has("p10")).toBe(false);
  });

  it("treats a non-finite or missing coordinate as no coordinate", () => {
    const numbers = pinNumbersFor([
      { slug: "nan", name: "nan", lng: Number.NaN, lat: 39.4 },
      { slug: "null", name: "null", lng: null, lat: null },
      row("real"),
    ]);
    expect([...numbers.entries()]).toEqual([["real", 1]]);
  });

  it("gives a repeated slug its first number only", () => {
    const numbers = pinNumbersFor([row("a"), row("a"), row("b")]);
    expect([...numbers.entries()]).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("mappedPinNumbers", () => {
  it("prints no numbers when the map would not draw", () => {
    expect(mappedPinNumbers([row("a"), row("b", false)]).size).toBe(0);
    expect(mappedPinNumbers([row("a"), row("b")]).size).toBe(2);
  });
});

describe("resultsPinsFor", () => {
  it("labels each pin with the same number its row prints", () => {
    const rows = [row("a", false), row("b"), row("c")];
    const numbers = pinNumbersFor(rows);
    const pins = resultsPinsFor(rows);
    expect(pins.map((pin) => [pin.name, pin.label])).toEqual([
      ["b", String(numbers.get("b"))],
      ["c", String(numbers.get("c"))],
    ]);
  });

  it("reads a place's catalog point through pinRowFor", () => {
    expect(
      pinRowFor({ slug: "x", name: "X", geom: { lng: -77.4, lat: 39.4 } }),
    ).toEqual({ slug: "x", name: "X", lng: -77.4, lat: 39.4 });
    expect(pinRowFor({ slug: "y", name: "Y" })).toEqual({
      slug: "y",
      name: "Y",
      lng: null,
      lat: null,
    });
  });
});

describe("ResultsPinMap", () => {
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

  it("renders nothing with fewer than two pins", async () => {
    await act(async () =>
      root.render(<ResultsPinMap rows={[row("a"), row("b", false)]} />),
    );
    expect(container.innerHTML).toBe("");
  });

  it("draws numbered Brick pins that match the rows, with the names read aloud", async () => {
    await act(async () =>
      root.render(
        <ResultsPinMap
          rows={[
            { slug: "hog", name: "Black Hog BBQ Bar", lng: -77.4111, lat: 39.4111 },
            { slug: "none", name: "No point" },
            { slug: "alley", name: "Brewer's Alley", lng: -77.4105, lat: 39.4161 },
          ]}
          name="the places to start with"
        />,
      ),
    );
    const pins = [...container.querySelectorAll("[data-mini-map-pin]")].map((pin) =>
      pin.getAttribute("data-mini-map-pin"),
    );
    // The first result is drawn last so it stays on top of a cluster.
    expect(pins.sort()).toEqual(["1", "2"]);
    const map = container.querySelector('[role="img"]');
    expect(map?.getAttribute("aria-label")).toBe(
      "Locations of the places to start with: 1 Black Hog BBQ Bar, 2 Brewer's Alley",
    );
    expect(container.querySelector("[data-owned-mini-map]")?.className).toContain("h-44");
    expect(container.innerHTML).not.toContain("--app-positive");
  });

  it("renders the row disc as a hidden 22px Brick numeral", async () => {
    await act(async () => root.render(<PinNumber n={3} />));
    const disc = container.querySelector<HTMLElement>("[data-pin-number]");
    expect(disc?.textContent).toBe("3");
    expect(disc?.getAttribute("aria-hidden")).toBe("true");
    expect(disc?.className).toContain("h-[22px]");
    expect(disc?.className).toContain("text-caption");
    expect(disc?.style.background).toBe("var(--app-brand)");
    expect(disc?.style.color).toBe("var(--app-bg)");
  });
});

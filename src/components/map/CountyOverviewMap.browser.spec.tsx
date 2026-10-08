// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import COUNTY_OUTLINE from "@/data/county-boundary.json";
import { MUNICIPALITIES } from "@/data/municipalities";

type CanvasProps = { onStatus: (status: "ready" | "unavailable") => void };

const canvasHarness = vi.hoisted(() => ({ props: null as null | CanvasProps }));

// The real canvas is the lazily imported MapLibre chunk. This stand-in
// records its props and hands the test the status hook.
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockCountyOverviewMapCanvas(props: CanvasProps) {
      canvasHarness.props = props;
      return createElement("div", { "data-test-canvas": "" });
    },
}));

import CountyOverviewMap, { type CountyOverviewPoint } from "./CountyOverviewMap";
import { overviewPath, projectOverview } from "./countyOverview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(isIntersecting: boolean) {
    this.callback(
      this.targets.map((target) => ({ isIntersecting, target }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  resize(width: number) {
    this.callback(
      [{ contentRect: { width, height: width } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

const OUTLINE = overviewPath(COUNTY_OUTLINE);

const TOWNS: CountyOverviewPoint[] = [...MUNICIPALITIES]
  .sort((a, b) => b.population - a.population)
  .map((m) => ({
    id: m.slug,
    ...projectOverview(m.centroid.lng, m.centroid.lat),
    label: m.name,
    href: `/m/${m.slug}`,
  }));

function townMap() {
  return createElement(CountyOverviewMap, {
    label: "Map of Frederick County showing its 13 towns",
    outline: OUTLINE,
    areas: [{ id: "brunswick", path: "M10 10 20 10 20 20Z" }],
    points: TOWNS,
    tone: "town",
    caption: "Tap a town to see its places and events.",
    sourceCredit: "Town boundaries: Frederick County GIS",
  });
}

function parkMap() {
  return createElement(CountyOverviewMap, {
    label: "Map of Frederick County with 2 parks marked",
    outline: OUTLINE,
    points: [
      { id: "catoctin", ...projectOverview(-77.4528, 39.6314), label: "Catoctin Mountain Park" },
      { id: "baker", ...projectOverview(-77.422, 39.4181), label: null },
    ],
    tone: "park",
    caption: "2 parks",
    href: "/map?layers=parks",
  });
}

describe("CountyOverviewMap on the server", () => {
  it("draws the county, its areas and every point before any map code loads", () => {
    const html = renderToStaticMarkup(townMap());

    expect(html).toContain('data-county-overview="placeholder"');
    expect(html).toContain('aria-label="Map of Frederick County showing its 13 towns"');
    expect(html).toContain("data-overview-mask");
    expect(html).toContain('data-overview-area="brunswick"');
    expect(html).not.toContain("data-test-canvas");
    for (const m of MUNICIPALITIES) {
      expect(html).toContain(`href="/m/${m.slug}"`);
    }
    // Laid out for a phone-width first render: every town is named.
    expect(html.match(/data-overview-label=/g)).toHaveLength(13);
    // Only the drawn data is credited until the basemap is on screen.
    expect(html).toContain("Town boundaries: Frederick County GIS");
    expect(html).not.toContain("OpenStreetMap");
  });

  it("uses tokens only, with Creek for civic boundaries and Brick for town points", () => {
    const html = renderToStaticMarkup(townMap());
    expect(html).toContain("stroke-[color:var(--app-cool)]");
    expect(html).toContain("bg-[color:var(--app-brand)]");
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("keeps town shortcuts out of the tab order and the accessibility tree", () => {
    const html = renderToStaticMarkup(townMap());
    const markers = html.slice(html.indexOf('aria-hidden="true" class="pointer-events-none'));
    const links = markers.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(13);
    for (const link of links) expect(link).toContain('tabindex="-1"');
  });

  it("makes the parks picture one link to the map, with points as marks only", () => {
    const html = renderToStaticMarkup(parkMap());
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/map?layers=parks"');
    expect(html).toContain("Open map");
    expect(html).toContain("bg-[color:var(--app-brand-2)]");
    // An unlabeled point draws its dot and no pill.
    expect(html.match(/data-overview-label=/g)).toHaveLength(1);
    expect(html).toContain('data-overview-point="baker"');
  });
});

function statusMap(onPointSelect?: (id: string) => void) {
  return createElement(CountyOverviewMap, {
    label: "Map of Frederick County with 3 mapped reports",
    outline: OUTLINE,
    points: [
      { id: "crash", ...projectOverview(-77.4105, 39.4143), label: null, tone: "urgent", badge: "1" },
      { id: "closure", ...projectOverview(-77.64, 39.31), label: null, tone: "caution", badge: "2" },
      { id: "marc", ...projectOverview(-77.38, 39.42), label: null, tone: "transit" },
    ],
    aspect: "wide",
    caption: "Tap a numbered point to find its report.",
    onPointSelect,
  });
}

describe("CountyOverviewMap with per-point tones", () => {
  it("draws the square county centered in a wide strip, on the same projection", () => {
    const html = renderToStaticMarkup(statusMap());
    expect(html).toContain('data-overview-aspect="wide"');
    expect(html).toContain("h-[220px] w-full");
    // The county box itself stays square, so nothing is reprojected.
    expect(html).toContain("mx-auto h-[220px] w-[220px]");
    expect(html).not.toContain("aspect-square");
  });

  it("colors each point by its own tone with tokens only", () => {
    const html = renderToStaticMarkup(statusMap());
    expect(html).toContain('data-overview-tone="urgent"');
    expect(html).toContain("bg-[color:var(--app-danger)]");
    // Amber always travels with Ink: an Ink ring and an Ink numeral.
    expect(html).toContain(
      "border-[color:var(--app-ink)] bg-[color:var(--app-amber)] text-[color:var(--app-ink)]",
    );
    expect(html).toContain("bg-[color:var(--app-cool)]");
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
    expect(html).not.toContain("bg-[color:var(--app-brand)]");
  });

  it("prints a badge as a numeral on a disc and leaves an unbadged point a dot", () => {
    const html = renderToStaticMarkup(statusMap());
    expect(html).toMatch(/grid h-5 w-5 place-items-center text-caption font-bold[^"]*">1</);
    expect(html).toMatch(/grid h-5 w-5 place-items-center text-caption font-bold[^"]*">2</);
    expect(html).toMatch(/data-overview-tone="transit" class="[^"]*block h-2\.5 w-2\.5/);
  });

  it("keeps the square town map class for class when no point carries a tone", () => {
    const html = renderToStaticMarkup(townMap());
    expect(html).not.toContain("data-overview-aspect");
    expect(html).not.toContain("data-overview-tone");
    expect(html).toContain("relative aspect-square w-full overflow-hidden");
  });
});

describe("CountyOverviewMap in the browser", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    canvasHarness.props = null;
    MockIntersectionObserver.instances = [];
    MockResizeObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "connection");
  });

  const figure = () => container.querySelector<HTMLElement>("[data-county-overview]");
  const canvas = () => container.querySelector("[data-test-canvas]");
  const credits = () => container.querySelector("[data-overview-credits]")?.textContent ?? "";

  it("waits for the viewport, then reveals the basemap and credits it", async () => {
    await act(async () => root.render(townMap()));
    expect(figure()?.dataset.countyOverview).toBe("placeholder");
    expect(canvas()).toBeNull();

    const [observer] = MockIntersectionObserver.instances;
    expect(observer.options?.rootMargin).toBe("240px 0px");
    await act(async () => observer.fire(true));
    expect(figure()?.dataset.countyOverview).toBe("loading");
    expect(canvas()?.parentElement?.className).toContain("opacity-0");

    await act(async () => canvasHarness.props?.onStatus("ready"));
    expect(figure()?.dataset.countyOverview).toBe("ready");
    expect(canvas()?.parentElement?.className).toContain("opacity-100");
    expect(credits()).toBe("Protomaps © OpenStreetMap · Town boundaries: Frederick County GIS");
  });

  it("keeps the drawn county as the final state when the basemap fails", async () => {
    await act(async () => root.render(townMap()));
    await act(async () => MockIntersectionObserver.instances[0].fire(true));
    const { onStatus } = canvasHarness.props!;
    await act(async () => onStatus("unavailable"));
    await act(async () => onStatus("ready"));

    expect(figure()?.dataset.countyOverview).toBe("unavailable");
    expect(canvas()).toBeNull();
    expect(container.querySelector("[data-overview-mask]")).not.toBeNull();
    expect(container.querySelectorAll("[data-overview-point]")).toHaveLength(13);
    expect(credits()).not.toContain("OpenStreetMap");
  });

  it("never loads the basemap under Save-Data", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    await act(async () => root.render(townMap()));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(canvas()).toBeNull();
    expect(container.querySelectorAll("[data-overview-label]")).toHaveLength(13);
  });

  it("hands a tapped point's id back, as a pointer shortcut outside the tab order", async () => {
    const selected: string[] = [];
    await act(async () => root.render(statusMap((id) => selected.push(id))));
    const points = container.querySelectorAll<HTMLButtonElement>("button[data-overview-point]");
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.tabIndex).toBe(-1);
      expect(point.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[data-overview-point="closure"]')?.click();
    });
    expect(selected).toEqual(["closure"]);
  });

  it("draws marks only, with no buttons, when no handler is given", async () => {
    await act(async () => root.render(statusMap()));
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[data-overview-point]")).toHaveLength(3);
  });

  it("lays the labels out again for the measured width", async () => {
    await act(async () => root.render(townMap()));
    expect(container.querySelectorAll("[data-overview-label]")).toHaveLength(13);

    // A 320px phone has a 288px map: a couple of small towns lose their
    // names, never their points or their links.
    await act(async () => MockResizeObserver.instances[0].resize(288));
    const labels = container.querySelectorAll("[data-overview-label]").length;
    expect(labels).toBeGreaterThanOrEqual(11);
    expect(labels).toBeLessThan(13);
    expect(container.querySelectorAll("a[href^='/m/']")).toHaveLength(13);
  });
});

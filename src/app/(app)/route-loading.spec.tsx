// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayLoading from "./today/loading";
import MapLoading from "./map/loading";

function mount(markup: string) {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
}

describe("Today route-change placeholder", () => {
  it("holds the arrival's shape: a 160px band, the launcher and four shortcuts", () => {
    const host = mount(renderToStaticMarkup(<TodayLoading />));
    const blocks = [...host.querySelectorAll<HTMLElement>(".shimmer")];

    expect(blocks.map((block) => block.style.height)).toEqual([
      "160px",
      "92px",
      "64px",
      "64px",
      "64px",
      "64px",
    ]);
    expect(host.querySelector("[data-today-loading]")?.getAttribute("aria-busy")).toBe("true");
  });

  it("says one plain sentence on the Cream canvas", () => {
    const markup = renderToStaticMarkup(<TodayLoading />);
    const host = mount(markup);

    expect(host.querySelector('[role="status"]')?.textContent?.trim()).toBe(
      "Checking what is open around the county.",
    );
    // No decorative paper wash or page bloom over the canvas while loading.
    expect(markup).not.toContain("data-page-bloom");
    expect(markup).not.toMatch(/gradient/);
  });
});

describe("Map route-change placeholder", () => {
  it("reuses the Frederick County loading plate at the browse-map height", () => {
    const host = mount(renderToStaticMarkup(<MapLoading />));

    expect(host.textContent).toContain("Frederick County");
    expect(host.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe(
      "The Frederick County map is loading.",
    );
    const frame = host.querySelector<HTMLElement>("[data-map-loading] > div");
    expect(frame?.getAttribute("style")).toContain("var(--app-browse-map-height)");
  });
});

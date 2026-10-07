import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The County park-points enrichment is a live GIS request; the reviewed list
// renders without it.
vi.mock("@/lib/integrations/fcParkLocations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/fcParkLocations")>();
  return { ...actual, getFrederickParkLocations: async () => [] };
});

import ParksPage from "./page";

async function render(): Promise<string> {
  return renderToStaticMarkup(await ParksPage());
}

describe("/parks", () => {
  it("leads with the county map of park points, above the list", async () => {
    const html = await render();
    const map = html.indexOf("data-county-overview");
    const firstSection = html.indexOf("<section");
    expect(map).toBeGreaterThan(-1);
    expect(map).toBeLessThan(firstSection === -1 ? Infinity : firstSection);
    expect(html.indexOf("Worman")).toBeGreaterThan(map);
    expect(html.match(/data-overview-point=/g)).toHaveLength(33);
    expect(html).toContain('href="/map?layers=parks"');
    // Points only: no park outlines without polygon data.
    expect(html).not.toContain("data-overview-area");
  });

  it("keeps the header to one instruction sentence", async () => {
    const html = await render();
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain("Tap a park for its details and location.");
    expect(header).not.toContain("Browse reviewed");
  });

  it("draws acreage as a Catoctin Forest bar and drops the tree-icon tiles", async () => {
    const html = await render();
    expect(html.match(/data-park-acreage-bar=/g)).toHaveLength(33);
    expect(html).toContain("bg-[color:var(--app-brand-2)]");
    expect(html).toContain("5,810 ac");
    expect(html).not.toContain("lucide-trees");
  });

  it("links parks to their own pages where the catalog has them, the map otherwise", async () => {
    const html = await render();
    expect(html).toContain('href="/places/baker-park-frederick"');
    expect(html).toContain('href="/places/carroll-creek-linear-park-frederick"');
    expect(html).toContain('href="/map?at=39.3905,-77.3725"');
    expect(html).not.toContain("/places/othello-regional-park-brunswick");
  });

  it("title-cases names without capitalizing after an apostrophe", async () => {
    const html = await render();
    expect(html).toContain("Worman&#x27;s Mill Park");
    expect(html).toContain("Crampton&#x27;s Gap");
    expect(html).not.toMatch(/&#x27;S /);
  });
});

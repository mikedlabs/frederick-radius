import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MUNICIPALITIES } from "@/data/municipalities";
import { EMPTY_LINE_FC, type MapLineFC } from "@/components/map/types";

const sources = vi.hoisted(() => ({
  boundaries: null as MapLineFC | null,
}));

vi.mock("@/lib/guided/town-event-counts", () => ({
  getNextSevenDayPublicEventCountsByMunicipality: async () => ({ frederick: 12, brunswick: 3 }),
}));
vi.mock("@/lib/integrations/fcGis", () => ({
  getMunicipalBoundaries: async () => sources.boundaries ?? EMPTY_LINE_FC,
}));
vi.mock("@/components/ui/PageBloom", () => ({ default: () => null }));

import TownsPage from "./page";

const brunswick = MUNICIPALITIES.find((m) => m.slug === "brunswick")!;

beforeEach(() => {
  sources.boundaries = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [brunswick.centroid.lng - 0.01, brunswick.centroid.lat - 0.01],
              [brunswick.centroid.lng + 0.01, brunswick.centroid.lat - 0.01],
              [brunswick.centroid.lng + 0.01, brunswick.centroid.lat + 0.01],
              [brunswick.centroid.lng - 0.01, brunswick.centroid.lat + 0.01],
              [brunswick.centroid.lng - 0.01, brunswick.centroid.lat - 0.01],
            ],
          ],
        },
        properties: { slug: "brunswick", name: "Brunswick" },
      },
    ],
  };
});

describe("/towns", () => {
  it("leads with the county map of all 13 towns, then the picture cards", async () => {
    const html = renderToStaticMarkup(await TownsPage());
    const map = html.indexOf("data-county-overview");
    const firstCard = html.indexOf("data-town-card");
    expect(map).toBeGreaterThan(-1);
    expect(firstCard).toBeGreaterThan(map);
    expect(html.match(/data-overview-point=/g)).toHaveLength(13);
    expect(html.match(/data-town-card=/g)).toHaveLength(13);
    expect(html).toContain('data-overview-area="brunswick"');
    expect(html).toContain("Town boundaries: Frederick County GIS");
  });

  it("keeps first-screen prose to one sentence plus the count caveat", async () => {
    const html = renderToStaticMarkup(await TownsPage());
    expect(html).not.toContain("Choose a town to see its places");
    expect(html).toContain("Tap a town to see its places and events.");
    expect(html).toContain("Event counts cover listings for the next 7 days.");
    for (const m of MUNICIPALITIES) expect(html).not.toContain(m.fact.replace(/'/g, "&#x27;"));
  });

  it("drops the boundary credit when the County layer is unavailable", async () => {
    sources.boundaries = EMPTY_LINE_FC;
    const html = renderToStaticMarkup(await TownsPage());
    expect(html).not.toContain("data-overview-area");
    expect(html).not.toContain("Frederick County GIS");
    expect(html.match(/data-overview-point=/g)).toHaveLength(13);
  });
});

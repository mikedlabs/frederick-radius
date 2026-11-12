import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LineFC } from "@/lib/integrations/transitFrederick";
import TRANSIT from "@/data/transit.json";
import NETWORK from "@/data/transit-network.json";
import TransitNetworkPreview, { buildTransitNetworkPreview } from "./TransitNetworkPreview";

const route = TRANSIT.routes[0];
const source = (points: unknown = [[-77.5, 39.4], [-77.4, 39.5]]): LineFC => ({
  type: "FeatureCollection", source: "official-gtfs",
  features: [{ type: "Feature", properties: { routeId: route.id }, geometry: { type: "LineString", coordinates: points } }],
});

describe("Static official transit route preview", () => {
  it("retains exact route identity/color and places north upward inside the frame", () => {
    const result = buildTransitNetworkPreview(source());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ routeId: route.id, color: route.color });
    const [[x1, y1], [x2, y2]] = [...result[0].path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
    expect(x2).toBeGreaterThan(x1); expect(y2).toBeLessThan(y1);
    for (const value of [x1, x2]) expect(value).toBeGreaterThanOrEqual(18);
    for (const value of [x1, x2]) expect(value).toBeLessThanOrEqual(622);
    for (const value of [y1, y2]) expect(value).toBeGreaterThanOrEqual(18);
    for (const value of [y1, y2]) expect(value).toBeLessThanOrEqual(202);
  });

  it.each([null, {}, [], [[0, 0]], [[0, 0], [NaN, 1]], [[0, 0], [181, 1]], [[0, 0], [1, 91]], [[0, 0], [0, 0]]])("omits an unusable complete line without inventing a connector: %j", (points) => {
    expect(buildTransitNetworkPreview(source(points))).toEqual([]);
  });

  it("does not call fallback, unknown-route or unbounded data an official diagram", () => {
    expect(buildTransitNetworkPreview({ ...source(), source: "maryland-open-data-fallback" })).toEqual([]);
    const unknown = source(); unknown.features[0].properties.routeId = "unknown-route";
    expect(buildTransitNetworkPreview(unknown)).toEqual([]);
    expect(buildTransitNetworkPreview({ ...source(), features: Array.from({ length: 129 }, () => source().features[0]) })).toEqual([]);
    expect(buildTransitNetworkPreview(source(Array.from({ length: 32_769 }, (_, i) => [-77.5 + i * 0.000001, 39.4])))).toEqual([]);
  });

  it("covers every current committed official variant with no provider access", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    try {
      const features = Object.entries(NETWORK.shapeVariants).flatMap(([routeId, variants]) => variants.map((variant) => ({
        type: "Feature" as const, properties: { routeId }, geometry: { type: "LineString", coordinates: variant.points.map(([lat, lng]) => [lng, lat]) },
      })));
      expect(buildTransitNetworkPreview({ type: "FeatureCollection", source: "official-gtfs", features })).toHaveLength(features.length);
      expect(features.length).toBeGreaterThan(0);
      expect(fetcher).not.toHaveBeenCalled();
      const html = renderToStaticMarkup(<TransitNetworkPreview shapes={source()} />);
      expect(html).toContain("Official route diagram · not live");
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toMatch(/<image|<foreignObject|<circle|https?:\/\//);
    } finally { vi.unstubAllGlobals(); }
  });
});

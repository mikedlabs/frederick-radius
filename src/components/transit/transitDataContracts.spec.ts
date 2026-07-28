import { describe, expect, it } from "vitest";
import TRANSIT from "@/data/transit.json";
import TRANSIT_NETWORK from "@/data/transit-network.json";
import TRANSIT_TRIPS from "@/data/transit-trips.json";
import {
  CURRENT_TRANSIT_STOPS,
  isCurrentTransitStop,
} from "@/lib/transit-static";
import { routesForStop } from "./routeGeometry";

type Route = { id: string };
type Stop = { id: string | number };
type ShapeVariant = {
  id: string;
  directionIds: number[];
  headsigns: string[];
  points: number[][];
};
type Trip = {
  routeId: string;
  directionId?: number;
  headsign?: string;
};

const routes = TRANSIT.routes as Route[];
const stops = TRANSIT.stops as Stop[];
const network = TRANSIT_NETWORK as {
  shapeVariants: Record<string, ShapeVariant[]>;
  stopRoutes: Record<string, string[]>;
};
const trips = TRANSIT_TRIPS as Record<string, Trip>;

describe("official static TransIT indexes", () => {
  it("preserves every published shape variant instead of one line per route", () => {
    const variants = Object.values(network.shapeVariants).flat();

    expect(variants.length).toBeGreaterThan(routes.length);
    for (const route of routes) {
      expect(network.shapeVariants[route.id]?.length).toBeGreaterThan(0);
    }
    for (const variant of variants) {
      expect(variant.id.length).toBeGreaterThan(0);
      expect(variant.points.length).toBeGreaterThanOrEqual(2);
      expect(new Set(variant.directionIds).size).toBe(
        variant.directionIds.length,
      );
      expect(new Set(variant.headsigns).size).toBe(
        variant.headsigns.length,
      );
    }
  });

  it("uses stop_times for route membership and keeps ids joinable", () => {
    const validRouteIds = new Set(routes.map((route) => route.id));
    const mappedStops = stops.filter(
      (stop) => network.stopRoutes[String(stop.id)]?.length > 0,
    );

    expect(mappedStops.length / stops.length).toBeGreaterThan(0.85);
    for (const stop of mappedStops) {
      const expected = network.stopRoutes[String(stop.id)];
      expect(routesForStop(String(stop.id))).toEqual(expected);
      expect(expected.every((routeId) => validRouteIds.has(routeId))).toBe(
        true,
      );
    }
    expect(CURRENT_TRANSIT_STOPS).toHaveLength(mappedStops.length);
    expect(
      CURRENT_TRANSIT_STOPS.every((stop) =>
        isCurrentTransitStop(stop.id),
      ),
    ).toBe(true);
    expect(
      stops
        .filter((stop) => !network.stopRoutes[String(stop.id)]?.length)
        .some((stop) => isCurrentTransitStop(String(stop.id))),
    ).toBe(false);
  });

  it("keeps enough trip identity to label realtime arrivals by direction", () => {
    const values = Object.values(trips);
    const validRouteIds = new Set(routes.map((route) => route.id));

    expect(values.length).toBeGreaterThan(500);
    expect(
      values.filter((trip) => trip.headsign && trip.headsign.length > 0)
        .length,
    ).toBeGreaterThan(values.length * 0.9);
    expect(
      values.every((trip) => validRouteIds.has(trip.routeId)),
    ).toBe(true);
  });
});

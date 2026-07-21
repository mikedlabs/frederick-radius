import { describe, it, expect } from "vitest";
import {
  resolveMunicipality,
  locationLabel,
  civicAnchors,
  civicAnchorsFor,
  nearbyNow,
  isNearbyEmpty,
} from "@/lib/connect";
import { FREDERICK_CENTER } from "@/lib/geo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

// A fixed clock keeps the join deterministic regardless of when the
// suite runs. We assert structural invariants, not seed-date-dependent
// counts, so the test stays green as the static event set evolves.
const NOW = new Date("2026-05-17T19:00:00-04:00");

describe("resolveMunicipality", () => {
  it("resolves the county-seat center to Frederick, inside its bbox", () => {
    const hit = resolveMunicipality(FREDERICK_CENTER);
    expect(hit.municipality.slug).toBe("frederick");
    expect(hit.inside).toBe(true);
    expect(hit.distance_m).toBeGreaterThanOrEqual(0);
    expect(hit.distance_m).toBeLessThan(500); // it IS the centroid
  });

  it("resolves a point inside the Brunswick bbox to Brunswick", () => {
    const hit = resolveMunicipality({ lng: -77.628, lat: 39.313 });
    expect(hit.municipality.slug).toBe("brunswick");
    expect(hit.inside).toBe(true);
  });

  it("falls back to nearest centroid (inside:false) outside every bbox", () => {
    // Baltimore — well outside the county, in no municipality bbox.
    const hit = resolveMunicipality({ lng: -76.61, lat: 39.29 });
    expect(hit.inside).toBe(false);
    expect(hit.distance_m).toBeGreaterThan(20_000);
    expect(MUNICIPALITY_BY_SLUG[hit.municipality.slug]).toBeDefined();
  });

  it("is total — every probe resolves to a real municipality", () => {
    for (const p of [
      { lng: -77.41, lat: 39.41 },
      { lng: -77.0, lat: 39.0 },
      { lng: -78.0, lat: 39.8 },
      { lng: 0, lat: 0 },
    ]) {
      const hit = resolveMunicipality(p);
      expect(MUNICIPALITY_BY_SLUG[hit.municipality.slug]).toBeDefined();
    }
  });
});

describe("locationLabel", () => {
  it("labels an inside point as '<Town>, MD'", () => {
    // The scope covers the full city, not only the downtown core.
    expect(locationLabel(FREDERICK_CENTER)).toBe("Frederick City, MD");
  });

  it("labels a far point as the generic county label", () => {
    expect(locationLabel({ lng: -76.61, lat: 39.29 })).toBe(
      "Frederick County, MD",
    );
  });

  it("labels a near-but-outside point as 'Near <Town>'", () => {
    // Just outside Frederick's bbox to the east, still well within 8km.
    const label = locationLabel({ lng: -77.365, lat: 39.414 });
    expect(label.startsWith("Near ")).toBe(true);
  });
});

describe("civic anchors", () => {
  it("resolves every civic anchor to a real municipality", () => {
    const all = civicAnchors();
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(MUNICIPALITY_BY_SLUG[a.municipality_slug]).toBeDefined();
      expect(a.distance_m).toBeGreaterThanOrEqual(0);
    }
  });

  it("civicAnchorsFor filters to one municipality, closest first", () => {
    const fred = civicAnchorsFor("frederick");
    for (const a of fred) expect(a.municipality_slug).toBe("frederick");
    for (let i = 1; i < fred.length; i++) {
      expect(fred[i].distance_m).toBeGreaterThanOrEqual(fred[i - 1].distance_m);
    }
  });
});

describe("nearbyNow", () => {
  const ctx = nearbyNow(FREDERICK_CENTER, { now: NOW });

  it("returns the connected shape with the resolved municipality", () => {
    expect(ctx.municipality.slug).toBe("frederick");
    expect(ctx.inside).toBe(true);
    expect(ctx.label).toBe("Frederick City, MD");
    expect(ctx.radiusM).toBeGreaterThan(0);
  });

  it("keeps counts consistent with the returned arrays", () => {
    expect(ctx.counts.openPlaces).toBe(ctx.openPlaces.length);
    expect(ctx.counts.liveEvents).toBe(ctx.liveEvents.length);
    expect(ctx.counts.upcomingEvents).toBe(ctx.upcomingEvents.length);
    expect(ctx.counts.civic).toBe(ctx.civic.length);
  });

  it("never returns anything beyond the discovery radius", () => {
    for (const p of ctx.openPlaces) {
      expect(p.distance_m ?? Infinity).toBeLessThanOrEqual(ctx.radiusM);
    }
    for (const e of [...ctx.liveEvents, ...ctx.upcomingEvents]) {
      expect(e.distance_m ?? Infinity).toBeLessThanOrEqual(ctx.radiusM);
    }
  });

  it("never surfaces a closed place", () => {
    for (const p of ctx.openPlaces) {
      expect(p.open_status.state).not.toBe("closed");
    }
  });

  it("leaves gated source feeds empty (never faked)", () => {
    expect(ctx.feeds.farmersMarkets).toEqual([]);
    expect(ctx.feeds.specials).toEqual([]);
  });

  it("respects a custom radius and limit", () => {
    const tight = nearbyNow(FREDERICK_CENTER, {
      now: NOW,
      radiusM: 800,
      limit: 3,
    });
    expect(tight.openPlaces.length).toBeLessThanOrEqual(3);
    for (const p of tight.openPlaces) {
      expect(p.distance_m ?? Infinity).toBeLessThanOrEqual(800);
    }
  });

  it("is deterministic for a fixed clock and origin", () => {
    const a = nearbyNow(FREDERICK_CENTER, { now: NOW });
    const b = nearbyNow(FREDERICK_CENTER, { now: NOW });
    expect(a.counts).toEqual(b.counts);
    expect(a.openPlaces.map((p) => p.slug)).toEqual(
      b.openPlaces.map((p) => p.slug),
    );
  });

  it("isNearbyEmpty agrees with the counts", () => {
    expect(isNearbyEmpty(ctx)).toBe(
      ctx.counts.openPlaces === 0 &&
        ctx.counts.liveEvents === 0 &&
        ctx.counts.upcomingEvents === 0,
    );
  });
});

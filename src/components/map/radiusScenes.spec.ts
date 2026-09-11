import { describe, expect, it } from "vitest";
import {
  RADIUS_SCENE_IDS,
  RADIUS_SCENES,
  emptyRadiusSceneSignals,
  parseRadiusSceneId,
  radiusSceneStatusLabel,
  resolveRadiusScene,
  type RadiusSceneSignals,
} from "./radiusScenes";

function signals(
  mutate?: (value: RadiusSceneSignals) => void,
): RadiusSceneSignals {
  const value = emptyRadiusSceneSignals();
  mutate?.(value);
  return value;
}

describe("Radius scene definitions", () => {
  it("accepts only stable, shareable scene ids", () => {
    expect(parseRadiusSceneId("buses-now")).toBe("buses-now");
    expect(parseRadiusSceneId("within-15-minutes")).toBe("within-15-minutes");
    expect(parseRadiusSceneId("transit")).toBeNull();
    expect(parseRadiusSceneId(null)).toBeNull();
  });

  it("keeps the five user-facing scenes in a stable order", () => {
    expect(RADIUS_SCENE_IDS).toEqual([
      "buses-now",
      "roads-now",
      "outside-now",
      "what-changed",
      "within-15-minutes",
    ]);
    expect(RADIUS_SCENE_IDS.map((id) => RADIUS_SCENES[id].label)).toEqual([
      "Buses now",
      "Roads now",
      "Outside now",
      "What changed?",
      "Within 15 minutes",
    ]);
  });

  it("uses complete, concise descriptions and unique layer plans", () => {
    for (const id of RADIUS_SCENE_IDS) {
      const scene = RADIUS_SCENES[id];
      expect(scene.description).toMatch(/^[A-Z].*[.!?]$/);
      expect(scene.description.length).toBeLessThanOrEqual(120);
      expect(new Set(scene.layers.required).size).toBe(scene.layers.required.length);
      expect(new Set(scene.layers.conditional).size).toBe(
        scene.layers.conditional.length,
      );
      expect(
        scene.layers.required.some((layer) =>
          scene.layers.conditional.includes(layer),
        ),
      ).toBe(false);
      expect(scene.camera.padding).toBe("scene-sheet");
    }
  });
});

describe("buses-now", () => {
  it("can open the first live session when mapped routes are available", () => {
    const unloaded = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 12;
        value.transit.vehicles = { status: "unavailable", count: 0 };
      }),
    );
    expect(unloaded.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
    expect(unloaded.availability.reason).toBe(
      "Open this view to check live bus positions.",
    );

    const deferredRoutes = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.vehicles = { status: "unloaded", count: 0 };
      }),
    );
    expect(deferredRoutes.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
  });

  it("is ready only when route context and the live feed are current", () => {
    const ready = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 12;
        value.transit.vehicles = { status: "current", count: 5 };
      }),
    );
    expect(ready.activeLayers).toEqual(["transit"]);
    expect(ready.availability).toMatchObject({
      status: "ready",
      canActivate: true,
      canRecommend: true,
    });
    expect(ready.availability.reason).toBe("5 live buses are reporting now.");

    const stale = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 12;
        value.transit.vehicles = { status: "stale", count: 5 };
      }),
    );
    expect(stale.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
  });

  it("can honestly show a current empty feed without promoting it", () => {
    const scene = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 12;
        value.transit.vehicles = { status: "empty", count: 0 };
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "ready",
      canActivate: true,
      canRecommend: false,
    });
    expect(scene.availability.reason).toContain("no buses are reporting");

    const deferredRoutes = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 0;
        value.transit.vehicles = { status: "empty", count: 0 };
      }),
    );
    expect(deferredRoutes.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
    expect(deferredRoutes.availability.reason).toContain(
      "routes and stops",
    );
  });

  it("keeps reporting live buses while the route bundle is still deferred", () => {
    const scene = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 0;
        value.transit.vehicles = { status: "current", count: 5 };
      }),
    );

    expect(scene.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: true,
    });
    expect(scene.availability.reason).toBe(
      "5 live buses are reporting now. Open this view for routes and stops.",
    );
    expect(radiusSceneStatusLabel(scene)).toBe("5 live");
  });

  it("does not imply a live count when current positions are unknown", () => {
    const limited = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 12;
        value.transit.vehicles = { status: "unavailable", count: 0 };
      }),
    );
    expect(radiusSceneStatusLabel(limited)).toBe("Ready to check");

    const unavailable = resolveRadiusScene(
      "buses-now",
      signals((value) => {
        value.transit.routeCount = 0;
        value.transit.vehicles = { status: "unavailable", count: 0 };
      }),
    );
    expect(radiusSceneStatusLabel(unavailable)).toBe("Unavailable");
  });
});

describe("roads-now", () => {
  it("starts every source needed to discover current road evidence", () => {
    const scene = resolveRadiusScene(
      "roads-now",
      signals((value) => {
        value.roads.workZones = { status: "current", count: 2 };
        value.roads.incidents = { status: "empty", count: 0 };
        value.roads.cameras = { status: "current", count: 7 };
      }),
    );
    expect(scene.activeLayers).toEqual([
      "traffic",
      "civic",
      "incidents",
      "cameras",
    ]);
    expect(scene.availability.status).toBe("ready");
    expect(scene.availability.canRecommend).toBe(true);
  });

  it("keeps static road context available without presenting it as live", () => {
    const scene = resolveRadiusScene(
      "roads-now",
      signals((value) => {
        value.roads.contextCount = 18;
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
    expect(scene.availability.reason).toContain("current travel feeds are not");
  });
});

describe("outside-now", () => {
  it("lets a safety hold lead and adds radar only for a weather hold", () => {
    const weather = resolveRadiusScene(
      "outside-now",
      signals((value) => {
        value.outdoors.trailCount = 30;
        value.outdoors.conditions = "current";
        value.outdoors.safetyHold = {
          kind: "weather",
          reason: "A Severe Thunderstorm Warning is active for Frederick County.",
        };
      }),
    );
    expect(weather.activeLayers).toEqual(["trails", "radar"]);
    expect(weather.availability).toMatchObject({
      status: "caution",
      canActivate: true,
      canRecommend: false,
    });
    expect(weather.availability.reason).toBe(
      "A Severe Thunderstorm Warning is active for Frederick County.",
    );

    const air = resolveRadiusScene(
      "outside-now",
      signals((value) => {
        value.outdoors.parks = { status: "current", count: 12 };
        value.outdoors.safetyHold = {
          kind: "air-quality",
          reason: "AirNow reports unhealthy air for Frederick.",
        };
      }),
    );
    expect(air.activeLayers).toEqual(["trails"]);
    expect(air.availability.status).toBe("caution");
  });

  it("does not recommend outdoor options without current conditions", () => {
    const scene = resolveRadiusScene(
      "outside-now",
      signals((value) => {
        value.outdoors.parks = { status: "current", count: 12 };
        value.outdoors.conditions = "stale";
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
  });

  it("lets an unfetched County parks source open instead of calling it empty", () => {
    const scene = resolveRadiusScene(
      "outside-now",
      signals((value) => {
        value.outdoors.parks = { status: "unloaded", count: 0 };
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
    expect(scene.availability.reason).toContain("load County parks");
  });

  it("treats City mobility as supporting inventory without making it live", () => {
    const scene = resolveRadiusScene(
      "outside-now",
      signals((value) => {
        value.outdoors.amenityCount = 40;
        value.outdoors.conditions = "current";
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "ready",
      canActivate: true,
      canRecommend: true,
    });
    expect(scene.definition.layers.data).toContain("accessible-amenities");
  });
});

describe("what-changed", () => {
  it("uses current sourced changes before archival context", () => {
    const scene = resolveRadiusScene(
      "what-changed",
      signals((value) => {
        value.changes.planningProjects = { status: "current", count: 4 };
        value.changes.publicHearingCount = 2;
        value.changes.aerialPhotoCount = 18;
        value.changes.historicRecordCount = 3;
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "ready",
      canActivate: true,
      canRecommend: true,
    });
    expect(scene.activeLayers).toEqual(["aerial"]);
  });

  it("keeps an archive-only view available without calling it current", () => {
    const scene = resolveRadiusScene(
      "what-changed",
      signals((value) => {
        value.changes.planningProjects = { status: "empty", count: 0 };
        value.changes.aerialPhotoCount = 18;
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
    expect(scene.availability.reason).toContain("no current change records");
  });

  it("does not turn an unfetched planning source into an empty claim", () => {
    const scene = resolveRadiusScene(
      "what-changed",
      signals((value) => {
        value.changes.planningProjects = { status: "unloaded", count: 0 };
        value.changes.aerialPhotoCount = 18;
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "limited",
      canActivate: true,
      canRecommend: false,
    });
    expect(scene.availability.reason).toBe(
      "Open this view to load current City and County change records.",
    );
  });
});

describe("within-15-minutes", () => {
  it("requires a real location before calculating reachability", () => {
    const scene = resolveRadiusScene(
      "within-15-minutes",
      signals((value) => {
        value.location = "requestable";
        value.reachability.engine = "ready";
        value.reachability.candidateCount = 10;
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "needs-location",
      canActivate: true,
      canRecommend: false,
    });
  });

  it("does not invent a reachable count before the calculation runs", () => {
    const scene = resolveRadiusScene(
      "within-15-minutes",
      signals((value) => {
        value.location = "available";
        value.reachability.engine = "ready";
        value.reachability.candidateCount = null;
      }),
    );
    expect(scene.availability).toMatchObject({
      status: "ready",
      canActivate: true,
      canRecommend: false,
    });
    expect(scene.availability.reason).toBe(
      "Ready to calculate a 15-minute reach from your location.",
    );
  });

  it("activates only after location and the travel-time service are ready", () => {
    const scene = resolveRadiusScene(
      "within-15-minutes",
      signals((value) => {
        value.location = "available";
        value.reachability.engine = "ready";
        value.reachability.candidateCount = 9;
        value.transit.routeCount = 12;
      }),
    );
    expect(scene.activeLayers).toEqual(["transit"]);
    expect(scene.availability).toMatchObject({
      status: "ready",
      canActivate: true,
      canRecommend: true,
    });
    expect(scene.availability.reason).toContain("9 useful options");
  });
});

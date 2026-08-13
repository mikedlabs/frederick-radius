/**
 * Radius Scenes are task-shaped map views. A scene says what the person is
 * trying to answer, which existing map layers support that answer, how the
 * camera should frame it, and when the evidence is strong enough to offer it.
 *
 * This module deliberately owns no React state, fetching, map instance, URL,
 * or clock. Feed adapters normalize their current state into the small signal
 * shape below; a future map controller can then apply the resolved plan.
 */

export const RADIUS_SCENE_IDS = [
  "buses-now",
  "roads-now",
  "outside-now",
  "what-changed",
  "within-15-minutes",
] as const;

export type RadiusSceneId = (typeof RADIUS_SCENE_IDS)[number];

const RADIUS_SCENE_ID_SET = new Set<string>(RADIUS_SCENE_IDS);

export function parseRadiusSceneId(
  value: string | null | undefined,
): RadiusSceneId | null {
  return value && RADIUS_SCENE_ID_SET.has(value)
    ? (value as RadiusSceneId)
    : null;
}

/** Existing AppMap switches a scene may request. */
export type RadiusSceneMapLayer =
  | "aerial"
  | "cameras"
  | "cemeteries"
  | "civic"
  | "incidents"
  | "parking"
  | "radar"
  | "traffic"
  | "trails"
  | "transit";

/** Data products that are composed by a scene rather than exposed as toggles. */
export type RadiusSceneDataLayer =
  | "accessible-amenities"
  | "aerial-archive"
  | "events"
  | "live-vehicles"
  | "outdoor-amenities"
  | "park-facilities"
  | "planning-projects"
  | "public-hearings"
  | "reachable-area"
  | "reachable-places"
  | "road-context"
  | "service-alerts"
  | "transit-stops";

export type RadiusSceneCamera = {
  strategy: "fit-features" | "near-user" | "follow-origin";
  /** The first geometry the camera should frame. */
  focus:
    | "live-vehicles"
    | "travel-impacts"
    | "outdoor-options"
    | "mapped-changes"
    | "reachable-area";
  /** A truthful fallback when the primary geometry is empty. */
  fallback:
    | "transit-network"
    | "county"
    | "near-user"
    | "visible-changes"
    | "request-location";
  maxZoom: number;
  padding: "scene-sheet";
};

export type RadiusSceneVisualFocus = {
  primary:
    | "vehicles"
    | "travel-impacts"
    | "outdoor-options"
    | "change-records"
    | "reachable-results";
  /** Unrelated place pins recede without disappearing from the map. */
  dimUnrelated: boolean;
  aggregateAtCountyZoom: boolean;
  motion:
    | "reported-position-glide"
    | "current-signal-pulse"
    | "quiet-reveal"
    | "archive-crossfade"
    | "reachable-boundary-draw";
  tone: "transit" | "caution" | "outdoors" | "civic" | "radius";
};

export type RadiusSceneDefinition = {
  id: RadiusSceneId;
  label: string;
  description: string;
  layers: {
    required: readonly RadiusSceneMapLayer[];
    /** These are added only when their own evidence is current. */
    conditional: readonly RadiusSceneMapLayer[];
    data: readonly RadiusSceneDataLayer[];
  };
  camera: RadiusSceneCamera;
  visual: RadiusSceneVisualFocus;
};

export type RadiusSceneFeedStatus =
  | "unloaded"
  | "loading"
  | "current"
  | "empty"
  | "stale"
  | "unavailable";

export type RadiusSceneFeedSignal = {
  status: RadiusSceneFeedStatus;
  count: number;
};

export type RadiusSceneSignals = {
  location: "available" | "requestable" | "unavailable";
  transit: {
    routeCount: number;
    vehicles: RadiusSceneFeedSignal;
    serviceAlerts: RadiusSceneFeedSignal;
  };
  roads: {
    workZones: RadiusSceneFeedSignal;
    incidents: RadiusSceneFeedSignal;
    cameras: RadiusSceneFeedSignal;
    contextCount: number;
  };
  outdoors: {
    parks: RadiusSceneFeedSignal;
    trailCount: number;
    amenityCount: number;
    conditions: RadiusSceneFeedStatus;
    safetyHold?: {
      kind: "weather" | "air-quality";
      reason: string;
    } | null;
  };
  changes: {
    planningProjects: RadiusSceneFeedSignal;
    publicHearingCount: number;
    aerialPhotoCount: number;
    historicRecordCount: number;
  };
  reachability: {
    engine: "ready" | "unavailable";
    /** Null until the reach engine has actually evaluated the chosen origin. */
    candidateCount: number | null;
  };
};

export type RadiusSceneAvailabilityStatus =
  | "ready"
  | "loading"
  | "limited"
  | "caution"
  | "needs-location"
  | "unavailable";

export type RadiusSceneAvailability = {
  status: RadiusSceneAvailabilityStatus;
  canActivate: boolean;
  /** Safe for a contextual, unsolicited suggestion on a clean map. */
  canRecommend: boolean;
  reason: string;
};

export type ResolvedRadiusScene = {
  definition: RadiusSceneDefinition;
  /** Required layers plus only the conditional layers supported right now. */
  activeLayers: readonly RadiusSceneMapLayer[];
  availability: RadiusSceneAvailability;
};

export const RADIUS_SCENES: Readonly<Record<RadiusSceneId, RadiusSceneDefinition>> = {
  "buses-now": {
    id: "buses-now",
    label: "Buses now",
    description: "See reported bus positions, the route ahead, and nearby stops.",
    layers: {
      required: ["transit"],
      conditional: [],
      data: ["live-vehicles", "transit-stops", "service-alerts"],
    },
    camera: {
      strategy: "fit-features",
      focus: "live-vehicles",
      fallback: "transit-network",
      maxZoom: 14,
      padding: "scene-sheet",
    },
    visual: {
      primary: "vehicles",
      dimUnrelated: true,
      aggregateAtCountyZoom: true,
      motion: "reported-position-glide",
      tone: "transit",
    },
  },
  "roads-now": {
    id: "roads-now",
    label: "Roads now",
    description: "See current closures, travel reports, work zones, and road cameras.",
    layers: {
      required: ["traffic", "civic", "incidents", "cameras"],
      conditional: [],
      data: ["road-context"],
    },
    camera: {
      strategy: "fit-features",
      focus: "travel-impacts",
      fallback: "county",
      maxZoom: 13.5,
      padding: "scene-sheet",
    },
    visual: {
      primary: "travel-impacts",
      dimUnrelated: true,
      aggregateAtCountyZoom: true,
      motion: "current-signal-pulse",
      tone: "caution",
    },
  },
  "outside-now": {
    id: "outside-now",
    label: "Outside now",
    description: "Check parks, paths, sidewalks, and current conditions before you head out.",
    layers: {
      required: ["trails"],
      conditional: ["radar"],
      data: ["park-facilities", "accessible-amenities"],
    },
    camera: {
      strategy: "near-user",
      focus: "outdoor-options",
      fallback: "county",
      maxZoom: 13.5,
      padding: "scene-sheet",
    },
    visual: {
      primary: "outdoor-options",
      dimUnrelated: true,
      aggregateAtCountyZoom: true,
      motion: "quiet-reveal",
      tone: "outdoors",
    },
  },
  "what-changed": {
    id: "what-changed",
    label: "What changed?",
    description: "See official planning, review, and City project records against Frederick's aerial archive.",
    layers: {
      required: [],
      conditional: ["aerial"],
      data: ["planning-projects", "aerial-archive"],
    },
    camera: {
      strategy: "fit-features",
      focus: "mapped-changes",
      fallback: "visible-changes",
      maxZoom: 15,
      padding: "scene-sheet",
    },
    visual: {
      primary: "change-records",
      dimUnrelated: true,
      aggregateAtCountyZoom: true,
      motion: "archive-crossfade",
      tone: "civic",
    },
  },
  "within-15-minutes": {
    id: "within-15-minutes",
    label: "Within 15 minutes",
    description: "See what you can realistically reach from your location, then compare the useful options inside it.",
    layers: {
      required: [],
      conditional: ["transit"],
      data: ["reachable-area", "reachable-places", "events", "transit-stops"],
    },
    camera: {
      strategy: "follow-origin",
      focus: "reachable-area",
      fallback: "request-location",
      maxZoom: 14.5,
      padding: "scene-sheet",
    },
    visual: {
      primary: "reachable-results",
      dimUnrelated: true,
      aggregateAtCountyZoom: false,
      motion: "reachable-boundary-draw",
      tone: "radius",
    },
  },
};

function feedIsCurrent(feed: RadiusSceneFeedSignal): boolean {
  return feed.status === "current" || feed.status === "empty";
}

function feedHasCurrentItems(feed: RadiusSceneFeedSignal): boolean {
  return feed.status === "current" && feed.count > 0;
}

function count(...values: number[]): number {
  return values.reduce(
    (total, value) => total + (Number.isFinite(value) ? Math.max(0, value) : 0),
    0,
  );
}

function resolveBuses(signals: RadiusSceneSignals): RadiusSceneAvailability {
  const routes = count(signals.transit.routeCount);
  const vehicles = signals.transit.vehicles;
  // The realtime endpoint is independent of the deferred route bundle. The
  // first tap must be allowed to start that live session; otherwise the view
  // is disabled until after the very request it is supposed to trigger.
  if (vehicles.status === "unloaded" || vehicles.status === "loading") {
    return {
      status: vehicles.status === "loading" ? "loading" : "limited",
      canActivate: true,
      canRecommend: false,
      reason:
        vehicles.status === "loading"
          ? "Radius is checking current bus positions."
          : "Open this view to check live bus positions.",
    };
  }
  if (routes === 0 && vehicles.status === "unavailable") {
    return {
      status: "unavailable",
      canActivate: false,
      canRecommend: false,
      reason: "Transit routes and live vehicle positions are unavailable.",
    };
  }
  if (routes > 0 && feedIsCurrent(vehicles)) {
    const hasVehicles = feedHasCurrentItems(vehicles);
    return {
      status: "ready",
      canActivate: true,
      canRecommend: hasVehicles,
      reason: hasVehicles
        ? `${vehicles.count} live ${vehicles.count === 1 ? "bus is" : "buses are"} reporting now.`
        : "The live vehicle feed is current, but no buses are reporting now.",
    };
  }
  if (routes === 0 && feedIsCurrent(vehicles)) {
    const hasVehicles = feedHasCurrentItems(vehicles);
    return {
      status: "limited",
      // The route bundle is deferred until this task is chosen. A current,
      // vehicle feed must not disable the very control that loads it, and its
      // status must agree with the ambient buses already visible on the map.
      canActivate: true,
      canRecommend: hasVehicles,
      reason: hasVehicles
        ? `${vehicles.count} live ${vehicles.count === 1 ? "bus is" : "buses are"} reporting now. Open this view for routes and stops.`
        : "No buses are reporting right now. Open this view for routes and stops.",
    };
  }
  if (routes > 0 && vehicles.status === "unavailable") {
    return {
      status: "limited",
      canActivate: true,
      canRecommend: false,
      reason: "Open this view to check live bus positions.",
    };
  }
  return {
    status: "limited",
    canActivate: routes > 0 || vehicles.count > 0,
    canRecommend: false,
    reason: routes > 0
      ? "Routes and stops are available, but live bus positions are not current."
      : "Some vehicle positions are available without complete route context.",
  };
}

function resolveRoads(signals: RadiusSceneSignals): RadiusSceneAvailability {
  const feeds = [signals.roads.workZones, signals.roads.incidents, signals.roads.cameras];
  const currentFeeds = feeds.filter(feedIsCurrent);
  const currentItems = count(
    ...feeds.filter(feedHasCurrentItems).map((feed) => feed.count),
  );
  if (currentFeeds.length > 0) {
    return {
      status: "ready",
      canActivate: true,
      canRecommend: currentItems > 0,
      reason: currentItems > 0
        ? `${currentItems} current travel ${currentItems === 1 ? "signal is" : "signals are"} available.`
        : "Current road sources report no mapped travel impacts.",
    };
  }
  const context = count(signals.roads.contextCount);
  const staleItems = count(...feeds.map((feed) => feed.count));
  if (context > 0 || staleItems > 0) {
    return {
      status: "limited",
      canActivate: true,
      canRecommend: false,
      reason: "Mapped road context is available, but current travel feeds are not.",
    };
  }
  return {
    status: "unavailable",
    canActivate: false,
    canRecommend: false,
    reason: "No current or mapped road information is available.",
  };
}

function resolveOutside(signals: RadiusSceneSignals): RadiusSceneAvailability {
  const parks = signals.outdoors.parks;
  const inventory = count(
    parks.status === "current" ? parks.count : 0,
    signals.outdoors.trailCount,
    signals.outdoors.amenityCount,
  );
  if (parks.status === "unloaded" || parks.status === "loading") {
    return {
      status: parks.status === "loading" ? "loading" : "limited",
      canActivate: true,
      canRecommend: false,
      reason:
        parks.status === "loading"
          ? "Loading County parks and outdoor options."
          : "Open this view to load County parks and outdoor options.",
    };
  }
  if (inventory === 0) {
    return {
      status: "unavailable",
      canActivate: false,
      canRecommend: false,
      reason: "No mapped outdoor options are available in this view.",
    };
  }
  if (signals.outdoors.safetyHold) {
    return {
      status: "caution",
      canActivate: true,
      canRecommend: false,
      reason: signals.outdoors.safetyHold.reason,
    };
  }
  const conditionsCurrent =
    signals.outdoors.conditions === "current" ||
    signals.outdoors.conditions === "empty";
  return conditionsCurrent
    ? {
        status: "ready",
        canActivate: true,
        canRecommend: true,
        reason: `${inventory} mapped outdoor ${inventory === 1 ? "option is" : "options are"} available with current conditions.`,
      }
    : {
        status: "limited",
        canActivate: true,
        canRecommend: false,
        reason: "Outdoor options are mapped, but current conditions are unavailable.",
      };
}

function resolveChanges(signals: RadiusSceneSignals): RadiusSceneAvailability {
  const planning = signals.changes.planningProjects;
  const currentRecords = count(
    planning.status === "current" ? planning.count : 0,
    signals.changes.publicHearingCount,
  );
  const archiveRecords = count(
    signals.changes.aerialPhotoCount,
    signals.changes.historicRecordCount,
  );
  if (planning.status === "unloaded" || planning.status === "loading") {
    return {
      status: planning.status === "loading" ? "loading" : "limited",
      canActivate: true,
      canRecommend: false,
      reason:
        planning.status === "loading"
          ? "Loading current City and County change records."
          : "Open this view to load current City and County change records.",
    };
  }
  if (planning.status === "stale") {
    return {
      status: "limited",
      canActivate: true,
      canRecommend: false,
      reason:
        "Change records are available, but one or more source checks are no longer current.",
    };
  }
  if (planning.status === "unavailable" && archiveRecords > 0) {
    return {
      status: "limited",
      canActivate: true,
      canRecommend: false,
      reason:
        "The aerial archive is available, but current City and County change records could not be checked.",
    };
  }
  if (currentRecords > 0) {
    return {
      status: "ready",
      canActivate: true,
      canRecommend: true,
      reason: `${currentRecords} sourced ${currentRecords === 1 ? "change record is" : "change records are"} available.`,
    };
  }
  if (archiveRecords > 0) {
    return {
      status: "limited",
      canActivate: true,
      canRecommend: false,
      reason: "Local history and aerial records are available, but no current change records are mapped.",
    };
  }
  return {
    status: "unavailable",
    canActivate: false,
    canRecommend: false,
    reason: "No sourced change or archive records are available in this view.",
  };
}

function resolveReachability(signals: RadiusSceneSignals): RadiusSceneAvailability {
  if (signals.location !== "available") {
    return {
      status: "needs-location",
      // The dedicated Radius builder already owns a clear, recoverable
      // location request. Let this card open that flow instead of disabling
      // the only way forward.
      canActivate: signals.location === "requestable",
      canRecommend: false,
      reason: signals.location === "requestable"
        ? "Use your location to calculate what is reachable in 15 minutes."
        : "A location is required to calculate a 15-minute reach.",
    };
  }
  if (signals.reachability.engine !== "ready") {
    return {
      status: "unavailable",
      canActivate: false,
      canRecommend: false,
      reason: "The travel-time service is temporarily unavailable.",
    };
  }
  if (signals.reachability.candidateCount === null) {
    return {
      status: "ready",
      canActivate: true,
      canRecommend: false,
      reason: "Ready to calculate a 15-minute reach from your location.",
    };
  }
  const candidates = count(signals.reachability.candidateCount);
  return {
    status: candidates > 0 ? "ready" : "limited",
    canActivate: true,
    canRecommend: candidates > 0,
    reason: candidates > 0
      ? `${candidates} useful ${candidates === 1 ? "option is" : "options are"} reachable within 15 minutes.`
      : "The reachable area is available, but no useful matches are inside it yet.",
  };
}

function availabilityFor(
  id: RadiusSceneId,
  signals: RadiusSceneSignals,
): RadiusSceneAvailability {
  switch (id) {
    case "buses-now":
      return resolveBuses(signals);
    case "roads-now":
      return resolveRoads(signals);
    case "outside-now":
      return resolveOutside(signals);
    case "what-changed":
      return resolveChanges(signals);
    case "within-15-minutes":
      return resolveReachability(signals);
  }
}

function conditionalLayersFor(
  id: RadiusSceneId,
  signals: RadiusSceneSignals,
): RadiusSceneMapLayer[] {
  switch (id) {
    case "roads-now":
      return [];
    case "outside-now":
      return signals.outdoors.safetyHold?.kind === "weather" ? ["radar"] : [];
    case "what-changed": {
      const layers: RadiusSceneMapLayer[] = [];
      if (signals.changes.aerialPhotoCount > 0) layers.push("aerial");
      return layers;
    }
    case "within-15-minutes":
      return signals.transit.routeCount > 0 ? ["transit"] : [];
    case "buses-now":
      return [];
  }
}

/** Resolve one task-shaped map plan without changing map or preference state. */
export function resolveRadiusScene(
  id: RadiusSceneId,
  signals: RadiusSceneSignals,
): ResolvedRadiusScene {
  const definition = RADIUS_SCENES[id];
  return {
    definition,
    activeLayers: [
      ...definition.layers.required,
      ...conditionalLayersFor(id, signals),
    ],
    availability: availabilityFor(id, signals),
  };
}

/** A conservative initial signal set for adapters and tests. */
export function emptyRadiusSceneSignals(): RadiusSceneSignals {
  const unavailable = (): RadiusSceneFeedSignal => ({
    status: "unavailable",
    count: 0,
  });
  return {
    location: "requestable",
    transit: {
      routeCount: 0,
      vehicles: unavailable(),
      serviceAlerts: unavailable(),
    },
    roads: {
      workZones: unavailable(),
      incidents: unavailable(),
      cameras: unavailable(),
      contextCount: 0,
    },
    outdoors: {
      parks: unavailable(),
      trailCount: 0,
      amenityCount: 0,
      conditions: "unavailable",
      safetyHold: null,
    },
    changes: {
      planningProjects: unavailable(),
      publicHearingCount: 0,
      aerialPhotoCount: 0,
      historicRecordCount: 0,
    },
    reachability: {
      engine: "unavailable",
      candidateCount: null,
    },
  };
}

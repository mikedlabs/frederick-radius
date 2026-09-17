"use client";

// The reference-layer toggle bank (#77 extraction from AppMap.tsx): the
// eleven show* switches with their seed logic (deep link > stored prefs >
// mode default, compact subject maps always clean), the per-device
// persistence write, and the shareable `show=` URL mirror. Initializers,
// effect bodies, and dependency arrays are byte-identical to the inline
// originals. The edge-tool dispatch (toggleEdgeOverlay) stays in AppMap —
// it wakes the edge rail, which is AppMap-local state — as does every
// consumer of these values, which destructures them back into the same
// local names.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { shouldInitializeReferenceLayer } from "@/lib/map/subject-map";
import { writeMapLayerPrefs, type MapLayerPrefs } from "./mapLayerPrefs";

export function useMapLayerToggles({
  compactSubjectMap,
  deepLinkLayers,
  hasExplicitLayerView,
  layerPrefs,
  deepLinkedAerialPresent,
  trailsLayerDefault,
  transitDefaultOn,
  isBrowseMap,
  smartLayers,
}: {
  compactSubjectMap: boolean;
  deepLinkLayers: ReadonlySet<string>;
  hasExplicitLayerView: boolean;
  layerPrefs: MapLayerPrefs;
  deepLinkedAerialPresent: boolean;
  trailsLayerDefault: boolean;
  transitDefaultOn: boolean;
  isBrowseMap: boolean;
  /** Smart cold-open seeds (map program phase 1): the moment-aware default
   *  from smartMapDefault, expanded to dock layer keys. Weakest voice in the
   *  seed order — a deep link or ANY stored choice for that key beats it, so
   *  it only ever speaks on a clean first look. */
  smartLayers?: ReadonlySet<"radar" | "parking" | "civic" | "traffic" | "incidents">;
}) {
  const smart = smartLayers ?? new Set<string>();
  // A smart seed is a suggestion, not a choice. Until the visitor touches a
  // toggle themselves, the persistence write below stays silent so the
  // moment-aware default can never fossilize into a stored preference and
  // greet every future visit regardless of moment.
  const smartSeeded = smart.size > 0;
  const userTouchedRef = useRef(false);
  // A Radius scene is a temporary task setup, not a new device preference.
  // Hold its exact target until the layer effect observes it, then skip that
  // one persistence write. If applying the scene changed nothing, a later
  // manual toggle will differ from this target and persist normally.
  const transientPlanRef = useRef<MapLayerPrefs | null>(null);
  const touch = <T,>(setter: Dispatch<SetStateAction<T>>) =>
    (value: SetStateAction<T>) => {
      userTouchedRef.current = true;
      setter(value);
    };
  const [showCivic, setShowCivic] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("roads") ||
          deepLinkLayers.has("civic") ||
          (!hasExplicitLayerView && (layerPrefs.civic ?? smart.has("civic"))),
      ),
  );
  const [showTrails, setShowTrails] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("trails") ||
          (!hasExplicitLayerView && (layerPrefs.trails ?? trailsLayerDefault)),
      ),
  );
  const [showScenicRoutes, setShowScenicRoutes] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("scenic") ||
          (!hasExplicitLayerView && (layerPrefs.scenicRoutes ?? false)),
      ),
  );
  const [showCoveredBridges, setShowCoveredBridges] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("bridges") ||
          (!hasExplicitLayerView && (layerPrefs.coveredBridges ?? false)),
      ),
  );
  const [showTransit, setShowTransit] = useState(
    // Transit is a deliberate map layer, never cold-open furniture. Deep-link
    // mode defaults can still request it; ordinary county browse stays quiet.
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("transit") ||
          (!hasExplicitLayerView && (layerPrefs.transit ?? transitDefaultOn)),
      ),
  );
  // Aerial photo overlay — the Frederick Radius moat. Off by default
  // since 104 pins is a lot to render until the user opts in. Tapping
  // one opens a Popup with the photo thumbnail + season + date.
  const [showAerial, setShowAerial] = useState(() =>
    shouldInitializeReferenceLayer(
      compactSubjectMap,
      deepLinkLayers.has("aerial") ||
        deepLinkedAerialPresent ||
        (!hasExplicitLayerView && (layerPrefs.aerial ?? false)),
    ),
  );
  // Historic cemeteries — opt-in heritage overlay (county GIS). OFF by
  // default: 250+ pins of local history is a deliberate interest, not
  // part of the clean cold open.
  const [showCemeteries, setShowCemeteries] = useState(() =>
    shouldInitializeReferenceLayer(
      compactSubjectMap,
      deepLinkLayers.has("cemeteries") ||
        (!hasExplicitLayerView && (layerPrefs.cemeteries ?? false)),
    ),
  );
  // Downtown parking garages — opt-in Parking layer, OFF by default.
  const [showParking, setShowParking] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("parking") ||
          (!hasExplicitLayerView && (layerPrefs.parking ?? smart.has("parking"))),
      ),
  );
  // Animated weather radar (RainViewer) — opt-in raster drape under the pins.
  const [showRadar, setShowRadar] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("radar") ||
          (!hasExplicitLayerView && (layerPrefs.radar ?? smart.has("radar"))),
      ),
  );
  const [showTraffic, setShowTraffic] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("roads") ||
          deepLinkLayers.has("traffic") ||
          (!hasExplicitLayerView && (layerPrefs.traffic ?? smart.has("traffic"))),
      ),
  );
  // Live public scanner incidents (crashes, wires down, fires) — opt-in,
  // OFF by default. Empty until the FredScanner feed is configured.
  const [showIncidents, setShowIncidents] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("roads") ||
          deepLinkLayers.has("incidents") ||
          (!hasExplicitLayerView && (layerPrefs.incidents ?? smart.has("incidents"))),
      ),
  );
  // Public ADS-B rotorcraft activity. The server keeps Trooper identification
  // aggregate-only and turns FMH trajectories into a fixed-heliport signal;
  // the browser never receives an exact public-safety aircraft position.
  const [showRotorcraft, setShowRotorcraft] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("air") ||
          (!hasExplicitLayerView && (layerPrefs.aviation ?? false)),
      ),
  );
  // MDOT CHART traffic cameras (I-70, US-15, US-340…) — opt-in, OFF by default.
  const [showCameras, setShowCameras] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("cameras") ||
          (!hasExplicitLayerView && (layerPrefs.cameras ?? false)),
      ),
  );

  // Radius scenes borrow the layer switches, but they must never become the
  // person's remembered setup. Keep the exact pre-scene state so leaving a
  // scene (including by manually refining one layer) restores that base first.
  const currentPlanRef = useRef<MapLayerPrefs>({});
  useEffect(() => {
    currentPlanRef.current = {
      civic: showCivic,
      transit: showTransit,
      trails: showTrails,
      scenicRoutes: showScenicRoutes,
      coveredBridges: showCoveredBridges,
      aerial: showAerial,
      cemeteries: showCemeteries,
      parking: showParking,
      radar: showRadar,
      traffic: showTraffic,
      incidents: showIncidents,
      aviation: showRotorcraft,
      cameras: showCameras,
    };
  }, [
    showAerial,
    showCameras,
    showCemeteries,
    showCivic,
    showIncidents,
    showParking,
    showRadar,
    showRotorcraft,
    showTraffic,
    showTrails,
    showScenicRoutes,
    showCoveredBridges,
    showTransit,
  ]);
  const sceneBaseRef = useRef<MapLayerPrefs | null>(null);
  const openedWithSceneRef = useRef(
    isBrowseMap &&
      typeof window !== "undefined" &&
      Boolean(new URLSearchParams(window.location.search).get("scene")) &&
      new URLSearchParams(window.location.search).get("scene") !==
        "within-15-minutes",
  );
  const rememberedPlanRef = useRef<MapLayerPrefs>({
    civic: layerPrefs.civic ?? smart.has("civic"),
    transit: layerPrefs.transit ?? transitDefaultOn,
    trails: layerPrefs.trails ?? trailsLayerDefault,
    scenicRoutes: layerPrefs.scenicRoutes ?? false,
    coveredBridges: layerPrefs.coveredBridges ?? false,
    aerial: layerPrefs.aerial ?? false,
    cemeteries: layerPrefs.cemeteries ?? false,
    parking: layerPrefs.parking ?? smart.has("parking"),
    radar: layerPrefs.radar ?? smart.has("radar"),
    traffic: layerPrefs.traffic ?? smart.has("traffic"),
    incidents: layerPrefs.incidents ?? smart.has("incidents"),
    aviation: layerPrefs.aviation ?? false,
    cameras: layerPrefs.cameras ?? false,
  });
  const setLayerPlan = useCallback((target: MapLayerPrefs) => {
    setShowCivic(Boolean(target.civic));
    setShowTransit(Boolean(target.transit));
    setShowTrails(Boolean(target.trails));
    setShowScenicRoutes(Boolean(target.scenicRoutes));
    setShowCoveredBridges(Boolean(target.coveredBridges));
    setShowAerial(Boolean(target.aerial));
    setShowCemeteries(Boolean(target.cemeteries));
    setShowParking(Boolean(target.parking));
    setShowRadar(Boolean(target.radar));
    setShowTraffic(Boolean(target.traffic));
    setShowIncidents(Boolean(target.incidents));
    setShowRotorcraft(Boolean(target.aviation));
    setShowCameras(Boolean(target.cameras));
  }, []);

  const applyReferenceLayerPlan = useCallback((layers: ReadonlySet<string>) => {
    const target: MapLayerPrefs = {
      civic: layers.has("civic"),
      transit: layers.has("transit"),
      trails: layers.has("trails"),
      scenicRoutes: layers.has("scenic"),
      coveredBridges: layers.has("bridges"),
      aerial: layers.has("aerial"),
      cemeteries: layers.has("cemeteries"),
      parking: layers.has("parking"),
      radar: layers.has("radar"),
      traffic: layers.has("traffic"),
      incidents: layers.has("incidents"),
      aviation: layers.has("air"),
      cameras: layers.has("cameras"),
    };
    if (!sceneBaseRef.current) {
      sceneBaseRef.current = openedWithSceneRef.current
        ? rememberedPlanRef.current
        : currentPlanRef.current;
      openedWithSceneRef.current = false;
    }
    transientPlanRef.current = target;
    setLayerPlan(target);
  }, [setLayerPlan]);

  const restoreReferenceLayerPlan = useCallback(() => {
    const target = sceneBaseRef.current;
    if (!target) return;
    sceneBaseRef.current = null;
    // Suppress the restoration write. The original preferences are already
    // stored; a manual toggle queued after this restoration will write only
    // that deliberate refinement on top of the original base.
    transientPlanRef.current = target;
    setLayerPlan(target);
  }, [setLayerPlan]);

  // Remember the user's explicit layer choices (per device) so a customized map
  // survives reload. Transient focus filters (saved-only / field-notes-only)
  // are intentionally excluded — see mapLayerPrefs. A shared `show=` view is
  // authoritative for this visit but must not overwrite the recipient's own
  // saved map setup.
  useEffect(() => {
    if (hasExplicitLayerView) return;
    const current: MapLayerPrefs = {
      civic: showCivic,
      transit: showTransit,
      trails: showTrails,
      scenicRoutes: showScenicRoutes,
      coveredBridges: showCoveredBridges,
      aerial: showAerial,
      cemeteries: showCemeteries,
      parking: showParking,
      radar: showRadar,
      traffic: showTraffic,
      incidents: showIncidents,
      aviation: showRotorcraft,
      cameras: showCameras,
    };
    const transient = transientPlanRef.current;
    if (transient) {
      transientPlanRef.current = null;
      const samePlan = Object.keys(current).every(
        (key) =>
          current[key as keyof MapLayerPrefs] ===
          transient[key as keyof MapLayerPrefs],
      );
      if (samePlan) return;
    }
    // With smart seeds active, only a real interaction may persist: the
    // suggestion itself must never become a stored preference.
    if (smartSeeded && !userTouchedRef.current) return;
    writeMapLayerPrefs(current);
  }, [hasExplicitLayerView, smartSeeded, showCivic, showTransit, showTrails, showScenicRoutes, showCoveredBridges, showAerial, showCemeteries, showParking, showRadar, showTraffic, showIncidents, showRotorcraft, showCameras]);

  // Every deliberate reference layer is first-class share/deep-link state.
  // Expand the composite `roads` alias into explicit members so turning one
  // member back off cannot be undone by a stale alias on the next reload.
  useEffect(() => {
    if (!isBrowseMap) return;
    const url = new URL(window.location.href);
    const shown = new Set(
      (url.searchParams.get("show") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    shown.delete("roads");
    shown.delete("none");
    const shareableLayers: ReadonlyArray<readonly [string, boolean]> = [
      ["civic", showCivic],
      ["transit", showTransit],
      ["trails", showTrails],
      ["scenic", showScenicRoutes],
      ["bridges", showCoveredBridges],
      ["aerial", showAerial],
      ["cemeteries", showCemeteries],
      ["parking", showParking],
      ["radar", showRadar],
      ["traffic", showTraffic],
      ["incidents", showIncidents],
      ["air", showRotorcraft],
      ["cameras", showCameras],
    ];
    for (const [key, visible] of shareableLayers) {
      if (visible) shown.add(key);
      else shown.delete(key);
    }
    if (shown.size > 0) url.searchParams.set("show", [...shown].join(","));
    else if (hasExplicitLayerView) url.searchParams.set("show", "none");
    else url.searchParams.delete("show");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [
    isBrowseMap,
    hasExplicitLayerView,
    showAerial,
    showCameras,
    showCemeteries,
    showCivic,
    showIncidents,
    showParking,
    showRadar,
    showRotorcraft,
    showTraffic,
    showTrails,
    showScenicRoutes,
    showCoveredBridges,
    showTransit,
  ]);

  return {
    showCivic, setShowCivic: touch(setShowCivic),
    showTrails, setShowTrails: touch(setShowTrails),
    showScenicRoutes, setShowScenicRoutes: touch(setShowScenicRoutes),
    showCoveredBridges, setShowCoveredBridges: touch(setShowCoveredBridges),
    showTransit, setShowTransit: touch(setShowTransit),
    showAerial, setShowAerial: touch(setShowAerial),
    showCemeteries, setShowCemeteries: touch(setShowCemeteries),
    showParking, setShowParking: touch(setShowParking),
    showRadar, setShowRadar: touch(setShowRadar),
    showTraffic, setShowTraffic: touch(setShowTraffic),
    showIncidents, setShowIncidents: touch(setShowIncidents),
    showRotorcraft, setShowRotorcraft: touch(setShowRotorcraft),
    showCameras, setShowCameras: touch(setShowCameras),
    applyReferenceLayerPlan,
    restoreReferenceLayerPlan,
  };
}

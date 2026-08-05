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

import { useEffect, useState } from "react";
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
}: {
  compactSubjectMap: boolean;
  deepLinkLayers: ReadonlySet<string>;
  hasExplicitLayerView: boolean;
  layerPrefs: MapLayerPrefs;
  deepLinkedAerialPresent: boolean;
  trailsLayerDefault: boolean;
  transitDefaultOn: boolean;
  isBrowseMap: boolean;
}) {
  const [showCivic, setShowCivic] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("roads") ||
          deepLinkLayers.has("civic") ||
          (!hasExplicitLayerView && (layerPrefs.civic ?? false)),
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
          (!hasExplicitLayerView && (layerPrefs.parking ?? false)),
      ),
  );
  // Animated weather radar (RainViewer) — opt-in raster drape under the pins.
  const [showRadar, setShowRadar] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("radar") ||
          (!hasExplicitLayerView && (layerPrefs.radar ?? false)),
      ),
  );
  const [showTraffic, setShowTraffic] = useState(
    () =>
      shouldInitializeReferenceLayer(
        compactSubjectMap,
        deepLinkLayers.has("roads") ||
          deepLinkLayers.has("traffic") ||
          (!hasExplicitLayerView && (layerPrefs.traffic ?? false)),
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
          (!hasExplicitLayerView && (layerPrefs.incidents ?? false)),
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

  // Remember the user's explicit layer choices (per device) so a customized map
  // survives reload. Transient focus filters (saved-only / field-notes-only)
  // are intentionally excluded — see mapLayerPrefs. A shared `show=` view is
  // authoritative for this visit but must not overwrite the recipient's own
  // saved map setup.
  useEffect(() => {
    if (hasExplicitLayerView) return;
    writeMapLayerPrefs({
      civic: showCivic,
      transit: showTransit,
      trails: showTrails,
      aerial: showAerial,
      cemeteries: showCemeteries,
      parking: showParking,
      radar: showRadar,
      traffic: showTraffic,
      incidents: showIncidents,
      aviation: showRotorcraft,
      cameras: showCameras,
    });
  }, [hasExplicitLayerView, showCivic, showTransit, showTrails, showAerial, showCemeteries, showParking, showRadar, showTraffic, showIncidents, showRotorcraft, showCameras]);

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
    showTransit,
  ]);

  return {
    showCivic, setShowCivic,
    showTrails, setShowTrails,
    showTransit, setShowTransit,
    showAerial, setShowAerial,
    showCemeteries, setShowCemeteries,
    showParking, setShowParking,
    showRadar, setShowRadar,
    showTraffic, setShowTraffic,
    showIncidents, setShowIncidents,
    showRotorcraft, setShowRotorcraft,
    showCameras, setShowCameras,
  };
}

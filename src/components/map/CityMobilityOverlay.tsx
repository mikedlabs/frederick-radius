"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Popup, Source, useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { BRAND } from "@/lib/brand";
import {
  CITY_MOBILITY_MIN_ZOOM,
  cityMobilityStatusLabel,
  cityMobilityViewportQuery,
  type CityMobilityBounds,
  type CityMobilityCollection,
  type CityMobilityProperties,
} from "@/lib/map/cityMobility";
import {
  overlayCollectionBounds,
  type OverlayBounds,
  type OverlayLoadState,
} from "./MapOverlays";

type PopupState = {
  lng: number;
  lat: number;
  properties: CityMobilityProperties;
};

type ViewState =
  | { status: "idle" }
  | { status: "needs-closer-view" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "stale" }
  | { status: "partial" }
  | { status: "error" };

const INTERACTIVE_LAYERS = [
  "city-mobility-sidewalks",
  "city-mobility-existing-paths",
  "city-mobility-context-paths",
  "city-mobility-ramps",
] as const;

function collectionIsValid(value: unknown): value is CityMobilityCollection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CityMobilityCollection>;
  return (
    candidate.type === "FeatureCollection" &&
    Array.isArray(candidate.features) &&
    Boolean(candidate.radius) &&
    ["current", "stale", "unavailable"].includes(
      candidate.radius?.status ?? "",
    )
  );
}

function mapBounds(map: {
  getBounds: () => {
    getWest: () => number;
    getSouth: () => number;
    getEast: () => number;
    getNorth: () => number;
  };
}): CityMobilityBounds {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

function featureAnchor(
  feature: GeoJSON.Feature<GeoJSON.Geometry, CityMobilityProperties>,
): { lng: number; lat: number } | null {
  if (feature.geometry.type === "Point") {
    return {
      lng: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    };
  }
  const bounds = overlayCollectionBounds({
    type: "FeatureCollection",
    features: [feature],
  });
  return bounds
    ? {
        lng: (bounds[0][0] + bounds[1][0]) / 2,
        lat: (bounds[0][1] + bounds[1][1]) / 2,
      }
    : null;
}

function checkedLabel(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
}

function featureCaveat(properties: CityMobilityProperties): string {
  if (properties.mobility_kind === "ramp") {
    return "A mapped ramp is context only and does not confirm an accessible end-to-end route.";
  }
  if (properties.mobility_kind === "sidewalk") {
    return "Mapped sidewalk inventory does not guarantee current clearance, condition, or accessibility.";
  }
  return properties.status === "EXISTING"
    ? "The City maps this segment as existing; current condition and access are not guaranteed."
    : "This is planning context only and must not be used as a route.";
}

export default function CityMobilityOverlay({
  active,
  onFeatureState,
  onFeatureBounds,
}: {
  active: boolean;
  onFeatureState?: (key: "mobility", state: OverlayLoadState) => void;
  onFeatureBounds?: (key: "mobility", bounds: OverlayBounds | null) => void;
}) {
  const { current: map } = useMap();
  const [data, setData] = useState<CityMobilityCollection | null>(null);
  const [viewState, setViewState] = useState<ViewState>({ status: "idle" });
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [retry, setRetry] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const cacheRef = useRef(new Map<string, CityMobilityCollection>());
  const popupRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const loadViewport = useCallback(
    async (force = false) => {
      const liveMap = map?.getMap();
      if (!active || !liveMap) return;
      const query = cityMobilityViewportQuery(
        mapBounds(liveMap),
        liveMap.getZoom(),
      );
      if (!query) {
        requestRef.current?.abort();
        lastQueryRef.current = null;
        setData(null);
        setPopup(null);
        setViewState({ status: "needs-closer-view" });
        onFeatureBounds?.("mobility", null);
        return;
      }
      const detail = liveMap.getZoom() >= 15 ? "street" : "network";
      const requestKey = `${detail}:${query}`;
      if (!force && requestKey === lastQueryRef.current) return;
      lastQueryRef.current = requestKey;

      const cached = cacheRef.current.get(requestKey);
      if (cached && !force) {
        setData(cached);
        setViewState({
          status:
            cached.radius.status === "stale"
              ? "stale"
              : cached.radius.coverage === "partial"
                ? "partial"
                : "ready",
        });
        onFeatureState?.("mobility", {
          status:
            cached.radius.status === "stale"
              ? "stale"
              : cached.radius.coverage === "partial"
                ? "partial"
                : "ready",
          count: cached.features.length,
          checkedAt: cached.radius.checkedAt,
        });
        onFeatureBounds?.("mobility", overlayCollectionBounds(cached));
        return;
      }

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const sequence = ++requestSequenceRef.current;
      setViewState({ status: "loading" });
      onFeatureState?.("mobility", { status: "loading", count: 0 });
      try {
        const response = await fetch(
          `/api/overlays/city-mobility?bbox=${encodeURIComponent(query)}&detail=${detail}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`City mobility returned ${response.status}`);
        const collection = (await response.json()) as unknown;
        if (!collectionIsValid(collection)) {
          throw new Error("City mobility returned invalid GeoJSON");
        }
        if (sequence !== requestSequenceRef.current) return;
        cacheRef.current.set(requestKey, collection);
        setData(collection);
        setViewState({
          status:
            collection.radius.status === "stale"
              ? "stale"
              : collection.radius.coverage === "partial"
                ? "partial"
                : "ready",
        });
        onFeatureState?.("mobility", {
          status:
            collection.radius.status === "stale"
              ? "stale"
              : collection.radius.coverage === "partial"
                ? "partial"
                : "ready",
          count: collection.features.length,
          checkedAt: collection.radius.checkedAt,
        });
        onFeatureBounds?.("mobility", overlayCollectionBounds(collection));
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        if (sequence !== requestSequenceRef.current) return;
        setData(null);
        setViewState({ status: "error" });
        onFeatureState?.("mobility", { status: "error", count: 0 });
        onFeatureBounds?.("mobility", null);
      }
    },
    [active, map, onFeatureBounds, onFeatureState],
  );

  useEffect(() => {
    const liveMap = map?.getMap();
    if (!active || !liveMap) {
      requestRef.current?.abort();
      return;
    }
    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void loadViewport();
      }, 180);
    };
    schedule();
    liveMap.on("moveend", schedule);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      requestRef.current?.abort();
      liveMap.off("moveend", schedule);
    };
  }, [active, loadViewport, map, retry]);

  useEffect(() => {
    if (!popup) return;
    const frame = window.requestAnimationFrame(() => popupRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [popup]);

  useEffect(() => {
    const liveMap = map?.getMap();
    if (!active || !data || !liveMap) return;
    const canvas = liveMap.getCanvas();
    const attached = new Set<string>();
    const onClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const properties = feature?.properties as CityMobilityProperties | undefined;
      if (!feature || !properties?.mobility_kind) return;
      const at =
        feature.geometry.type === "Point"
          ? {
              lng: (feature.geometry as GeoJSON.Point).coordinates[0],
              lat: (feature.geometry as GeoJSON.Point).coordinates[1],
            }
          : { lng: event.lngLat.lng, lat: event.lngLat.lat };
      setPopup({ ...at, properties });
      setAnnouncement(`${properties.name} opened on the map.`);
    };
    const enter = () => {
      canvas.style.cursor = "pointer";
    };
    const leave = () => {
      canvas.style.cursor = "";
    };
    const attach = () => {
      for (const id of INTERACTIVE_LAYERS) {
        if (attached.has(id) || !liveMap.getLayer(id)) continue;
        liveMap.on("click", id, onClick);
        liveMap.on("mouseenter", id, enter);
        liveMap.on("mouseleave", id, leave);
        attached.add(id);
      }
    };
    attach();
    liveMap.on("idle", attach);
    return () => {
      liveMap.off("idle", attach);
      for (const id of attached) {
        liveMap.off("click", id, onClick);
        liveMap.off("mouseenter", id, enter);
        liveMap.off("mouseleave", id, leave);
      }
      canvas.style.cursor = "";
    };
  }, [active, data, map]);

  const browsePaths = useMemo(() => {
    const seen = new Set<string>();
    return (data?.features ?? [])
      .filter((feature) => feature.properties.mobility_kind === "path")
      .filter((feature) => {
        const key = `${feature.properties.name}:${feature.properties.status}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 100);
  }, [data]);

  const closePopup = () => {
    setPopup(null);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    window.requestAnimationFrame(() => target?.focus());
  };

  if (!active) return null;

  const statusMessage = data
    ? cityMobilityStatusLabel(data.radius.status, data.radius.coverage)
    : null;
  const popupSource = popup
    ? popup.properties.mobility_kind === "path"
      ? data?.radius.sources.paths
      : popup.properties.mobility_kind === "ramp"
        ? data?.radius.sources.ramps
        : data?.radius.sources.sidewalks
    : null;
  const popupSourceLabel = popupSource?.label ?? "City of Frederick GIS";

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {data && (
        <Source id="city-mobility" type="geojson" data={data}>
          <Layer
            id="city-mobility-sidewalks"
            type="line"
            minzoom={CITY_MOBILITY_MIN_ZOOM}
            filter={["==", ["get", "mobility_kind"], "sidewalk"]}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": BRAND.colors.creek,
              "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.8, 16, 2.2, 18, 3.6],
              "line-opacity": 0.58,
            }}
          />
          <Layer
            id="city-mobility-existing-paths"
            type="line"
            minzoom={CITY_MOBILITY_MIN_ZOOM}
            filter={[
              "all",
              ["==", ["get", "mobility_kind"], "path"],
              ["==", ["get", "status"], "EXISTING"],
            ]}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": BRAND.colors.forest,
              "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2, 16, 4.5, 18, 6],
              "line-opacity": 0.9,
            }}
          />
          <Layer
            id="city-mobility-context-paths"
            type="line"
            minzoom={CITY_MOBILITY_MIN_ZOOM}
            filter={[
              "all",
              ["==", ["get", "mobility_kind"], "path"],
              ["!=", ["get", "status"], "EXISTING"],
            ]}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": BRAND.colors.functionalAmber,
              "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.6, 16, 3.6, 18, 5],
              "line-opacity": 0.68,
              "line-dasharray": [2, 2],
            }}
          />
          <Layer
            id="city-mobility-ramps"
            type="circle"
            minzoom={15}
            filter={["==", ["get", "mobility_kind"], "ramp"]}
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 18, 5.5],
              "circle-color": BRAND.colors.brick,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 1,
              "circle-opacity": 0.9,
            }}
          />
        </Source>
      )}

      {browsePaths.length > 0 && (
        <div className="map-overlay-keyboard-nav">
          <label htmlFor="city-mobility-path-select">Browse City paths</label>
          <select
            id="city-mobility-path-select"
            defaultValue=""
            onChange={(event) => {
              const feature = browsePaths[Number(event.currentTarget.value)];
              const anchor = feature ? featureAnchor(feature) : null;
              if (!feature || !anchor) return;
              returnFocusRef.current = event.currentTarget;
              setPopup({ ...anchor, properties: feature.properties });
              setAnnouncement(`${feature.properties.name} opened on the map.`);
              map?.getMap().flyTo({
                center: [anchor.lng, anchor.lat],
                zoom: Math.max(map.getMap().getZoom(), 15),
                duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
                essential: false,
              });
              event.currentTarget.value = "";
            }}
          >
            <option value="">Choose a mapped path</option>
            {browsePaths.map((feature, index) => (
              <option key={feature.properties.id} value={index}>
                {feature.properties.name} · {feature.properties.status.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      )}

      {viewState.status === "needs-closer-view" && (
        <div className="map-overlay-loading" role="status" aria-live="polite">
          Zoom in on Frederick City for sidewalk and path detail.
        </div>
      )}
      {viewState.status === "loading" && (
        <div className="map-overlay-loading" role="status" aria-live="polite">
          <span aria-hidden className="map-live-status-pulse" />
          Loading City walking detail
        </div>
      )}
      {(viewState.status === "stale" || viewState.status === "partial") && statusMessage && (
        <div className="map-overlay-loading" role="status" aria-live="polite">
          {statusMessage}
        </div>
      )}
      {viewState.status === "error" && (
        <div className="map-overlay-error" role="status" aria-live="polite">
          <span>City walking records did not load.</span>
          <button
            type="button"
            onClick={() => {
              lastQueryRef.current = null;
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {popup && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={12}
          closeOnClick
          onClose={closePopup}
          maxWidth="292px"
        >
          <div
            ref={popupRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby="city-mobility-popup-title"
            tabIndex={-1}
            style={{ padding: "2px 2px 4px", outline: "none" }}
          >
            <p
              style={{
                margin: 0,
                color: "var(--app-cool, #285D73)",
                fontSize: 9.5,
                fontWeight: 750,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              City walking record
            </p>
            <strong
              id="city-mobility-popup-title"
              className="font-serif"
              style={{ display: "block", marginTop: 2, fontSize: 16, lineHeight: 1.2 }}
            >
              {popup.properties.name}
            </strong>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--app-ink-2)" }}>
              {popup.properties.status === "EXISTING"
                ? popup.properties.routing_eligible
                  ? "Mapped as existing"
                  : "Existing crossing context"
                : `${popup.properties.status.charAt(0)}${popup.properties.status.slice(1).toLowerCase()} · not routable`}
              {popup.properties.surface_type
                ? ` · ${popup.properties.surface_type.toLowerCase()}`
                : ""}
              {popup.properties.width_ft
                ? ` · ${popup.properties.width_ft} ft wide`
                : ""}
            </p>
            {(popup.properties.tactile_warning_pad || popup.properties.ada_description) && (
              <p style={{ margin: "5px 0 0", fontSize: 10.5, color: "var(--app-ink-2)" }}>
                {[popup.properties.tactile_warning_pad, popup.properties.ada_description]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p style={{ margin: "6px 0 0", fontSize: 10, lineHeight: 1.4, color: "var(--app-ink-3)" }}>
              {featureCaveat(popup.properties)}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 9.5, color: "var(--app-ink-3)" }}>
              <a
                href={popupSource?.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--app-cool)", fontWeight: 700 }}
              >
                {popupSourceLabel} ↗
              </a>
              {checkedLabel(popupSource?.checkedAt)
                ? ` · checked ${checkedLabel(popupSource?.checkedAt)}`
                : ""}
            </p>
          </div>
        </Popup>
      )}
    </>
  );
}

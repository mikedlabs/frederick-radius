"use client";

import { useEffect, useRef, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import type { ExpressionSpecification, MapLayerMouseEvent } from "maplibre-gl";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import { BRAND } from "@/lib/brand";
import { directionsHref } from "@/lib/map/directionsHref";

/**
 * Map overlays (data brief 6.3/6.4).
 *
 * Renders the toggled overlay layers (parks, farmers markets, public
 * art, ...) as a self-contained unit inside the map. It owns its own
 * lazy fetch, its own Sources/Layers, and its own click popups via the
 * map instance, so AppMap's render and click handling stay untouched.
 *
 * Each overlay loads once on first toggle and is cached; toggling it off
 * unmounts its Source so it costs nothing. The map opens with no overlay
 * active (dark by default), the reader pulls one in when they want it.
 */

const LAYER_FADE_MS = 220;

// Per-overlay dot color. Resolved values come from the brand contract because
// Mapbox GL paint expressions cannot read CSS custom properties; a var() here
// fails to parse and the layer never colorizes or renders.
const COLOR: Partial<Record<OverlayKey, string>> = {
  parks: BRAND.colors.forest,
  planning: BRAND.colors.ridge,
  markets: BRAND.colors.functionalAmber,
  art: BRAND.colors.brick,
  bridges: BRAND.colors.creek,
};

// The detailed City network is fetched by CityMobilityOverlay against the
// current bounded viewport. It remains in the same overlay registry and URL
// contract, but must never hit its API without a map area.
const VIEWPORT_OVERLAYS = new Set<OverlayKey>(["mobility"]);

const ENDPOINT = new Map(OVERLAYS.map((o) => [o.key, o.endpoint] as const));
const OVERLAY = new Map(OVERLAYS.map((o) => [o.key, o] as const));

type PopupState = {
  lng: number;
  lat: number;
  key: OverlayKey;
  name: string;
  popupLabel?: string;
  address?: string;
  municipality?: string;
  statusLabel?: string;
  applicationType?: string;
  recordType?: string;
  referenceId?: string;
  reviewBody?: string;
  district?: string;
  summary?: string;
  permitId?: string;
  milestone?: string;
  milestoneAt?: string;
  sourceUpdatedAt?: string;
  sourceStatus?: string;
  caveat?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  detailsUrl?: string;
  checkedAt?: string;
};

export type OverlayBounds = [[number, number], [number, number]];
export type OverlayLoadState = {
  status: "loading" | "ready" | "stale" | "partial" | "error";
  count: number;
  checkedAt?: string;
};

function geometryCoordinates(geometry: GeoJSON.Geometry): Array<[number, number]> {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(geometryCoordinates);
  }
  const points: Array<[number, number]> = [];
  const visit = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      points.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  return points;
}

export function overlayCollectionBounds(
  fc: GeoJSON.FeatureCollection,
): OverlayBounds | null {
  const coordinates = fc.features.flatMap((feature) =>
    feature.geometry ? geometryCoordinates(feature.geometry) : [],
  );
  if (coordinates.length === 0) return null;
  let west = coordinates[0][0];
  let east = west;
  let south = coordinates[0][1];
  let north = south;
  for (const [lng, lat] of coordinates.slice(1)) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [[west, south], [east, north]];
}

function featureAnchor(feature: GeoJSON.Feature): { lng: number; lat: number } | null {
  if (!feature.geometry) return null;
  const coordinates = geometryCoordinates(feature.geometry);
  if (coordinates.length === 0) return null;
  if (feature.geometry.type === "Point") {
    return { lng: coordinates[0][0], lat: coordinates[0][1] };
  }
  const bounds = overlayCollectionBounds({ type: "FeatureCollection", features: [feature] });
  return bounds
    ? {
        lng: (bounds[0][0] + bounds[1][0]) / 2,
        lat: (bounds[0][1] + bounds[1][1]) / 2,
      }
    : null;
}

function popupFromFeature(
  key: OverlayKey,
  feature: GeoJSON.Feature,
  anchor: { lng: number; lat: number },
): PopupState {
  const p = (feature.properties ?? {}) as Record<string, string>;
  return {
    ...anchor,
    key,
    name: p.name || p.title || "Untitled",
    popupLabel: p.popup_label || undefined,
    address: p.address || p.Address || p.Location || undefined,
    municipality: p.municipality || undefined,
    statusLabel: p.status_label || undefined,
    applicationType: p.application_type || undefined,
    recordType: p.record_type || undefined,
    referenceId: p.reference_id || undefined,
    reviewBody: p.review_body || undefined,
    district: p.district || undefined,
    summary: p.summary || undefined,
    permitId: p.permit_id || undefined,
    milestone: p.milestone || undefined,
    milestoneAt: p.milestone_at || undefined,
    sourceUpdatedAt: p.source_updated_at || undefined,
    sourceStatus: p.source_status || undefined,
    caveat: p.caveat || undefined,
    sourceLabel: p.source_label || undefined,
    sourceUrl: p.source_url || undefined,
    detailsUrl: p.details_url || undefined,
    checkedAt: p.checked_at || undefined,
  };
}

function formatCountyDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function MapOverlays({
  active,
  onFeatureState,
  onFeatureBounds,
}: {
  active: OverlayKey[];
  onFeatureState?: (key: OverlayKey, state: OverlayLoadState) => void;
  onFeatureBounds?: (key: OverlayKey, bounds: OverlayBounds | null) => void;
}) {
  const { current: map } = useMap();
  const [data, setData] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<OverlayKey, boolean>>>({});
  const [loading, setLoading] = useState<Partial<Record<OverlayKey, boolean>>>({});
  const [partial, setPartial] = useState<Partial<Record<OverlayKey, boolean>>>({});
  const [announcement, setAnnouncement] = useState("");
  const [retrySequence, setRetrySequence] = useState(0);
  const [rendered, setRendered] = useState<OverlayKey[]>(active);
  const [visible, setVisible] = useState<Set<OverlayKey>>(
    () => new Set(active),
  );
  // Keys whose fetch has started, so a re-render never refetches.
  const started = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  const popupRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Keep a just-disabled layer mounted long enough for Mapbox's paint
  // transition to finish. New layers mount at opacity zero, then become
  // visible on the next frame, so activation reads as a deliberate layer
  // change instead of a hard pop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRendered((current) => [...new Set([...current, ...active])]);
    const frame = window.requestAnimationFrame(() => {
      setVisible(new Set(active));
    });
    const activeSet = new Set(active);
    const cleanup = window.setTimeout(() => {
      setRendered((current) =>
        current.filter((key) => activeSet.has(key)),
      );
    }, LAYER_FADE_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(cleanup);
    };
  }, [active]);

  useEffect(() => {
    if (!popup || active.includes(popup.key)) return;
    const frame = window.requestAnimationFrame(() => setPopup(null));
    return () => window.cancelAnimationFrame(frame);
  }, [active, popup]);

  useEffect(() => {
    if (!popup) return;
    const frame = window.requestAnimationFrame(() => popupRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [popup]);

  // Lazy load: fetch each newly active overlay's GeoJSON once.
  useEffect(() => {
    for (const key of active) {
      if (VIEWPORT_OVERLAYS.has(key)) continue;
      if (started.current.has(key)) continue;
      const url = ENDPOINT.get(key);
      if (!url) continue;
      started.current.add(key);
      queueMicrotask(() => {
        if (mounted.current) {
          setLoading((current) => ({ ...current, [key]: true }));
        }
      });
      onFeatureState?.(key, { status: "loading", count: 0 });
      fetch(url)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Overlay request failed with ${response.status}`);
          }
          return {
            fc: (await response.json()) as GeoJSON.FeatureCollection,
            checkedAt:
              response.headers.get("X-Radius-Source-Checked-At") ?? undefined,
            sourceStatus:
              response.headers.get("X-Radius-Source-Status") ?? undefined,
            sourceCoverage:
              response.headers.get("X-Radius-Source-Coverage") ?? undefined,
          };
        })
        .then(({ fc, checkedAt, sourceStatus, sourceCoverage }) => {
          // Finish warming the cache even if the layer was switched off while
          // its request was in flight. Turning it back on should reveal the
          // completed data immediately instead of getting stuck behind a
          // permanently "started" key.
          if (mounted.current) {
            setData((current) =>
              current[key] ? current : { ...current, [key]: fc },
            );
            setErrors((current) =>
              current[key] ? { ...current, [key]: false } : current,
            );
            setLoading((current) => ({ ...current, [key]: false }));
            setPartial((current) => ({
              ...current,
              [key]: sourceCoverage === "partial",
            }));
            onFeatureState?.(key, {
              status:
                sourceStatus === "stale"
                  ? "stale"
                  : sourceCoverage === "partial"
                    ? "partial"
                    : "ready",
              count: fc.features.length,
              checkedAt,
            });
            onFeatureBounds?.(key, overlayCollectionBounds(fc));
          }
        })
        .catch(() => {
          // Keep the map usable, but never translate an upstream failure into
          // an apparently empty layer. The compact retry surface below owns
          // recovery without requiring an off/on toggle.
          started.current.delete(key);
          if (mounted.current) {
            setLoading((current) => ({ ...current, [key]: false }));
            setPartial((current) => ({ ...current, [key]: false }));
            setErrors((current) => ({ ...current, [key]: true }));
            onFeatureState?.(key, { status: "error", count: 0 });
          }
        });
    }
  }, [active, onFeatureBounds, onFeatureState, retrySequence]);

  // Click popups + cursor feedback, attached to the live map instance so
  // AppMap's own onClick/interactiveLayerIds are not involved.
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    // The Radius-to-county transition removes the old map canvas before this
    // passive cleanup runs. Keep the element captured at setup time instead
    // of asking a dismantled Mapbox instance for a canvas during unmount.
    const canvas = m.getCanvas();
    // Points AND polygon fills are tappable (a park's grounds answer
    // "what park is this?" just like its marker does).
    const layerIds = active.flatMap((k) => [`ov-${k}-pt`, `ov-${k}-fill`]);

    const onClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const layerId = f.layer?.id;
      if (!layerId) return;
      const key = active.find((candidate) =>
        layerId === `ov-${candidate}-pt` || layerId === `ov-${candidate}-fill`,
      );
      if (!key) return;
      // Anchor at the marker for points; at the tap for area fills.
      const at =
        f.geometry.type === "Point"
          ? { lng: (f.geometry as GeoJSON.Point).coordinates[0], lat: (f.geometry as GeoJSON.Point).coordinates[1] }
          : { lng: e.lngLat.lng, lat: e.lngLat.lat };
      setPopup(popupFromFeature(key, f, at));
    };
    const enter = () => {
      canvas.style.cursor = "pointer";
    };
    const leave = () => {
      canvas.style.cursor = "";
    };

    for (const id of layerIds) {
      if (!m.getLayer(id)) continue;
      m.on("click", id, onClick);
      m.on("mouseenter", id, enter);
      m.on("mouseleave", id, leave);
    }
    return () => {
      for (const id of layerIds) {
        m.off("click", id, onClick);
        m.off("mouseenter", id, enter);
        m.off("mouseleave", id, leave);
      }
      canvas.style.cursor = "";
    };
  }, [map, active, data]);

  const loadingLabels = active
    .filter((key) => loading[key])
    .map((key) => OVERLAY.get(key)?.label ?? "map records");

  const closePopup = () => {
    setPopup(null);
    setAnnouncement("");
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    window.requestAnimationFrame(() => target?.focus());
  };

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {rendered.map((key) => {
        const fc = data[key];
        if (!fc) return null;
        const color = COLOR[key] ?? "#B5462B";
        const pointColor: string | ExpressionSpecification =
          key === "planning"
            ? [
                "match",
                ["get", "lifecycle"],
                "construction",
                BRAND.colors.brick,
                "planning",
                BRAND.colors.amber,
                "application_pending",
                BRAND.colors.ridge,
                "open_application",
                BRAND.colors.ridge,
                "status_unknown",
                BRAND.colors.mutedInk,
                color,
              ]
            : color;
        const isVisible = visible.has(key);
        // Geometry-aware: a layer can carry polygons (park grounds) AND
        // points (named markers) in one file. Fills draw first (under),
        // points draw over them; the filters keep each Layer honest, so
        // a points-only layer renders exactly as before.
        return (
          <Source key={key} id={`ov-${key}`} type="geojson" data={fc}>
            <Layer
              id={`ov-${key}-fill`}
              type="fill"
              filter={["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]]}
              paint={{
                "fill-color": color,
                "fill-opacity": isVisible ? 0.16 : 0,
                "fill-opacity-transition": {
                  duration: LAYER_FADE_MS,
                  delay: 0,
                },
              }}
            />
            <Layer
              id={`ov-${key}-edge`}
              type="line"
              filter={["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]]}
              paint={{
                "line-color": color,
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 1.2],
                "line-opacity": isVisible ? 0.5 : 0,
                "line-opacity-transition": {
                  duration: LAYER_FADE_MS,
                  delay: 0,
                },
              }}
            />
            <Layer
              id={`ov-${key}-pt`}
              type="circle"
              filter={["==", ["geometry-type"], "Point"]}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 14, 6, 17, 9],
                "circle-color": pointColor,
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.5,
                "circle-opacity": isVisible ? 0.9 : 0,
                "circle-opacity-transition": {
                  duration: LAYER_FADE_MS,
                  delay: 0,
                },
              }}
            />
          </Source>
        );
      })}
      {active.map((key) => {
        const fc = data[key];
        if (!fc || fc.features.length === 0) return null;
        const label = OVERLAY.get(key)?.label ?? "map records";
        return (
          <div className="map-overlay-keyboard-nav" key={`nav-${key}`}>
            <label htmlFor={`map-overlay-select-${key}`}>
              Browse {label.toLowerCase()}
            </label>
            <select
              id={`map-overlay-select-${key}`}
              defaultValue=""
              onChange={(event) => {
                const index = Number(event.currentTarget.value);
                const feature = fc.features[index];
                const anchor = feature ? featureAnchor(feature) : null;
                if (!feature || !anchor) return;
                const nextPopup = popupFromFeature(key, feature, anchor);
                returnFocusRef.current = event.currentTarget;
                setPopup(nextPopup);
                setAnnouncement(`${nextPopup.name} opened on the map.`);
                const liveMap = map?.getMap();
                if (liveMap) {
                  const reduceMotion =
                    window.matchMedia?.("(prefers-reduced-motion: reduce)")
                      .matches ?? false;
                  liveMap.flyTo({
                    center: [anchor.lng, anchor.lat],
                    zoom: Math.max(liveMap.getZoom(), 14),
                    duration: reduceMotion ? 0 : 650,
                    essential: !reduceMotion,
                  });
                }
                event.currentTarget.value = "";
              }}
              aria-label={`Browse ${label.toLowerCase()} on the map`}
            >
              <option value="">Choose a mapped record</option>
              {fc.features.map((feature, index) => {
                const properties = (feature.properties ?? {}) as Record<string, string>;
                const name = properties.name || properties.title || `Record ${index + 1}`;
                return (
                  <option key={`${key}-${index}-${name}`} value={index}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>
        );
      })}
      {loadingLabels.length > 0 && (
        <div className="map-overlay-loading" role="status" aria-live="polite">
          <span aria-hidden className="map-live-status-pulse" />
          Loading {loadingLabels.join(" and ").toLowerCase()}
        </div>
      )}
      {active.some((key) => partial[key]) && (
        <div className="map-overlay-loading" role="status" aria-live="polite">
          Some official map sources did not load. Showing the records that are
          available.
        </div>
      )}
      {active.some((key) => errors[key]) && (
        <div className="map-overlay-error" role="status" aria-live="polite">
          <span>Map records did not load.</span>
          <button
            type="button"
            onClick={() => {
              for (const key of active) {
                if (errors[key]) started.current.delete(key);
              }
              setErrors((current) => {
                const next = { ...current };
                for (const key of active) delete next[key];
                return next;
              });
              for (const key of active) {
                if (errors[key]) {
                  onFeatureState?.(key, { status: "loading", count: 0 });
                }
              }
              setRetrySequence((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {popup && active.includes(popup.key) && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={12}
          closeOnClick
          onClose={closePopup}
          maxWidth="280px"
        >
          {/* A field-guide entry, not a tooltip: serif display name over
              a hairline rule, then the quiet detail line. */}
          <div
            ref={popupRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`map-overlay-popup-${popup.key}`}
            tabIndex={-1}
            style={{ padding: "2px 2px 4px", outline: "none" }}
          >
            <div
              style={{
                marginBottom: 3,
                color: "var(--app-brand-press, #9E3824)",
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {popup.popupLabel || OVERLAY.get(popup.key)?.popupLabel}
            </div>
            <div
              id={`map-overlay-popup-${popup.key}`}
              className="font-serif"
              style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.25, color: "var(--app-ink, #221C15)" }}
            >
              {popup.name}
            </div>
            <div
              aria-hidden
              style={{ height: 1, background: "var(--app-border, #D9D2C3)", margin: "5px 0 4px" }}
            />
            {popup.address && (
              <div style={{ fontSize: 11, color: "var(--app-ink-2, #4A4636)" }}>
                {popup.address}{popup.municipality ? ` · ${popup.municipality}` : ""}
              </div>
            )}
            {!popup.address && popup.municipality && (
              <div style={{ fontSize: 11, color: "var(--app-ink-2, #4A4636)" }}>
                {popup.municipality}
              </div>
            )}
            {(popup.statusLabel ||
              popup.applicationType ||
              popup.recordType ||
              popup.referenceId ||
              popup.permitId) && (
              <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.4, color: "var(--app-ink-2, #4A4636)" }}>
                {popup.statusLabel && <strong>{popup.statusLabel}</strong>}
                {popup.applicationType && (
                  <span>{popup.statusLabel ? ` · ${popup.applicationType}` : popup.applicationType}</span>
                )}
                {popup.recordType && (
                  <span>{popup.statusLabel || popup.applicationType ? ` · ${popup.recordType}` : popup.recordType}</span>
                )}
                {popup.referenceId && <span>{` · ${popup.referenceId}`}</span>}
                {popup.permitId && <span>{` · ${popup.permitId}`}</span>}
              </div>
            )}
            {(popup.reviewBody || popup.district) && (
              <div style={{ marginTop: 4, fontSize: 10.5, lineHeight: 1.4, color: "var(--app-ink-2, #4A4636)" }}>
                {popup.reviewBody}
                {popup.reviewBody && popup.district ? " · " : ""}
                {popup.district ? `District ${popup.district}` : ""}
              </div>
            )}
            {popup.summary && (
              <div
                style={{
                  marginTop: 5,
                  fontSize: 10.5,
                  lineHeight: 1.4,
                  color: "var(--app-ink-2, #4A4636)",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 3,
                  overflow: "hidden",
                }}
              >
                {popup.summary}
              </div>
            )}
            {popup.milestone && (
              <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.4, color: "var(--app-ink-2, #4A4636)" }}>
                <strong>Current milestone:</strong> {popup.milestone}
                {formatCountyDate(popup.milestoneAt)
                  ? ` · ${formatCountyDate(popup.milestoneAt)}`
                  : ""}
              </div>
            )}
            {formatCountyDate(popup.sourceUpdatedAt) && (
              <div style={{ marginTop: 4, fontSize: 10.5, lineHeight: 1.35, color: "var(--app-ink-3, #5C5A50)" }}>
                Source record updated {formatCountyDate(popup.sourceUpdatedAt)}.
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.4, color: "var(--app-ink-3, #5C5A50)" }}>
              {popup.sourceLabel
                ? `From ${popup.sourceLabel}.`
                : OVERLAY.get(popup.key)?.sources}
            </div>
            {formatCountyDate(popup.checkedAt) && (
              <div style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.35, color: "var(--app-ink-3, #5C5A50)" }}>
                {popup.sourceStatus === "stale" ? "Last successful check" : "Checked by Radius"}{" "}
                {formatCountyDate(popup.checkedAt)}.
              </div>
            )}
            {(popup.caveat || OVERLAY.get(popup.key)?.caveat) && (
              <div style={{ marginTop: 4, fontSize: 10.5, lineHeight: 1.4, color: "var(--app-ink-3, #5C5A50)" }}>
                {popup.caveat || OVERLAY.get(popup.key)?.caveat}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {popup.key !== "planning" && (
                <a
                  href={directionsHref(popup.lat, popup.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    minHeight: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 12px",
                    borderRadius: 999,
                    background: "var(--app-brand, #B5462B)",
                    color: "var(--app-on-brand, #FCFBF8)",
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Directions ↗
                </a>
              )}
              {popup.detailsUrl && (
                <a
                  href={popup.detailsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    minHeight: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 12px",
                    borderRadius: 999,
                    background: "var(--app-brand, #B5462B)",
                    color: "var(--app-on-brand, #FCFBF8)",
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  County record ↗
                </a>
              )}
              {popup.sourceUrl && (
                <a
                  href={popup.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    minHeight: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 8px",
                    fontSize: 11,
                    fontWeight: 650,
                    color: "var(--app-brand, #B5462B)",
                  }}
                >
                  {popup.detailsUrl ? "Layer source ↗" : "Source ↗"}
                </a>
              )}
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

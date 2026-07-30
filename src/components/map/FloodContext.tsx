"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Info, Waves, X } from "lucide-react";
import { Layer, Popup, Source, useMap } from "react-map-gl/mapbox";
import type { FloodContextFC } from "./types";

const SOURCE_ID = "radius-county-flood-context";
const FILL_ID = "radius-county-flood-context-fill";
const EDGE_ID = "radius-county-flood-context-edge";
const POINT_ID = "radius-county-flood-context-point";

type ContextPopup = FloodContextFC["features"][number]["properties"] & {
  lng: number;
  lat: number;
};

/**
 * Known high-water context that appears with the existing Roads view.
 *
 * The treatment is intentionally quiet and blue: these are places to keep in
 * mind, not proof of current flooding. Live NWS alerts, gauges, and road
 * closures remain the authority for what is happening now.
 */
export default function FloodContext({
  show,
  data,
}: {
  show: boolean;
  data: FloodContextFC;
}) {
  const { current: map } = useMap();
  const [popup, setPopup] = useState<ContextPopup | null>(null);

  useEffect(() => {
    const instance = map?.getMap();
    if (!instance || !show || data.features.length === 0) return;
    const layerIds = [FILL_ID, POINT_ID];
    const onClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const value = (key: string) =>
        typeof properties[key] === "string" && properties[key]
          ? String(properties[key])
          : undefined;
      const kind = value("kind");
      if (
        kind !== "mapped_high_water_area" &&
        kind !== "warning_sign" &&
        kind !== "past_water_rescue"
      ) return;
      const at =
        feature.geometry.type === "Point"
          ? {
              lng: (feature.geometry as GeoJSON.Point).coordinates[0],
              lat: (feature.geometry as GeoJSON.Point).coordinates[1],
            }
          : { lng: event.lngLat.lng, lat: event.lngLat.lat };
      setPopup({
        ...at,
        id: value("id") ?? `${kind}-${at.lng}-${at.lat}`,
        kind,
        title:
          value("title") ??
          (kind === "mapped_high_water_area"
            ? "Known high-water area"
            : kind === "warning_sign"
              ? "Flood warning sign"
              : "Past water-rescue location"),
        creek: value("creek"),
        currentStatus: "Not a live flooding report",
        sourceUrl:
          value("sourceUrl") ??
          "https://www.frederickcountymd.gov/",
      });
    };
    const enter = () => {
      instance.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      instance.getCanvas().style.cursor = "";
    };

    const mounted = layerIds.filter((id) => instance.getLayer(id));
    for (const id of mounted) {
      instance.on("click", id, onClick);
      instance.on("mouseenter", id, enter);
      instance.on("mouseleave", id, leave);
    }
    return () => {
      for (const id of mounted) {
        instance.off("click", id, onClick);
        instance.off("mouseenter", id, enter);
        instance.off("mouseleave", id, leave);
      }
    };
  }, [data, map, show]);

  if (!show || data.features.length === 0) return null;

  return (
    <>
      <Source
        id={SOURCE_ID}
        type="geojson"
        data={data as unknown as GeoJSON.FeatureCollection}
      >
        <Layer
          id={FILL_ID}
          type="fill"
          filter={[
            "any",
            ["==", ["geometry-type"], "Polygon"],
            ["==", ["geometry-type"], "MultiPolygon"],
          ]}
          paint={{
            "fill-color": "#397D9A",
            "fill-opacity": 0.13,
          }}
        />
        <Layer
          id={EDGE_ID}
          type="line"
          filter={[
            "any",
            ["==", ["geometry-type"], "Polygon"],
            ["==", ["geometry-type"], "MultiPolygon"],
          ]}
          paint={{
            "line-color": "#397D9A",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 15, 2],
            "line-opacity": 0.62,
            "line-dasharray": [2, 1.5],
          }}
        />
        <Layer
          id={POINT_ID}
          type="circle"
          filter={["==", ["geometry-type"], "Point"]}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 15, 7],
            "circle-color": [
              "case",
              ["==", ["get", "kind"], "warning_sign"],
              "#D78B2E",
              "#397D9A",
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          }}
        />
      </Source>

      {popup ? (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={12}
          closeButton={false}
          closeOnClick={false}
          className="radius-map-popup"
          onClose={() => setPopup(null)}
        >
          <article className="w-[min(78vw,19rem)] p-1 text-left">
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--app-cool) 16%, white)",
                  color: "var(--app-cool)",
                }}
              >
                <Waves className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.11em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Frederick County flood context
                </p>
                <h3
                  className="mt-0.5 text-[15px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {popup.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="grid min-h-11 min-w-11 place-items-center rounded-full"
                aria-label="Close flood-context details"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {popup.creek ? (
              <p
                className="mt-2 text-[12px] font-medium"
                style={{ color: "var(--app-ink-2)" }}
              >
                {popup.creek}
              </p>
            ) : null}
            <p
              className="mt-2 flex gap-1.5 text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              This is mapped risk context, not a current flood or closure report.
            </p>
            <a
              href={popup.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              Open the official source
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </article>
        </Popup>
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ExternalLink, TrafficCone, X } from "lucide-react";
import { Layer, Popup, Source, useMap } from "react-map-gl/mapbox";
import type { RoadWorkZoneFC } from "./types";

const SOURCE_ID = "radius-wzdx-work-zones";
const CASING_ID = "radius-wzdx-work-zones-casing";
const LINE_ID = "radius-wzdx-work-zones-line";
const HIT_ID = "radius-wzdx-work-zones-hit";
const POINT_ID = "radius-wzdx-work-zones-point";
const POINT_HIT_ID = "radius-wzdx-work-zones-point-hit";

type WorkZonePopup = RoadWorkZoneFC["features"][number]["properties"] & {
  lng: number;
  lat: number;
};

function timeLabel(value?: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/**
 * Official Maryland WZDx geometry under the map's existing Traffic control.
 *
 * Work zones are context, not another mode: the lines appear alongside
 * congestion and CHART incidents and disappear with the same switch. A broad
 * invisible hit line keeps thin road geometry easy to tap on a phone.
 */
export default function RoadWorkZones({
  show,
  data,
}: {
  show: boolean;
  data: RoadWorkZoneFC;
}) {
  const { current: map } = useMap();
  const [popup, setPopup] = useState<WorkZonePopup | null>(null);

  useEffect(() => {
    const instance = map?.getMap();
    if (!instance || !show || data.features.length === 0) return;

    const onClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const string = (key: string) =>
        typeof properties[key] === "string" && properties[key]
          ? String(properties[key])
          : undefined;
      const road = string("road") ?? "Frederick County road";
      setPopup({
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
        id: string("id") ?? `${road}-${event.lngLat.lng}-${event.lngLat.lat}`,
        road,
        title: string("title") ?? "Active road work",
        detail: string("detail"),
        laneImpact: string("laneImpact"),
        status: string("status"),
        startAt: string("startAt"),
        endAt: string("endAt"),
        updatedAt: string("updatedAt"),
        sourceUrl:
          string("sourceUrl") ??
          "https://chart.maryland.gov/",
      });
    };
    const enter = () => {
      instance.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      instance.getCanvas().style.cursor = "";
    };

    const hitLayers = [HIT_ID, POINT_HIT_ID].filter((id) =>
      instance.getLayer(id),
    );
    if (hitLayers.length === 0) return;
    for (const id of hitLayers) {
      instance.on("click", id, onClick);
      instance.on("mouseenter", id, enter);
      instance.on("mouseleave", id, leave);
    }
    return () => {
      for (const id of hitLayers) {
        instance.off("click", id, onClick);
        instance.off("mouseenter", id, enter);
        instance.off("mouseleave", id, leave);
      }
    };
  }, [data, map, show]);

  if (!show || data.features.length === 0) return null;

  const end = timeLabel(popup?.endAt);
  const updated = timeLabel(popup?.updatedAt);

  return (
    <>
      <Source
        id={SOURCE_ID}
        type="geojson"
        data={data as unknown as GeoJSON.FeatureCollection}
      >
        <Layer
          id={CASING_ID}
          type="line"
          filter={["==", ["geometry-type"], "LineString"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": "#5B321D",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 12, 4, 16, 8],
            "line-opacity": 0.72,
          }}
        />
        <Layer
          id={LINE_ID}
          type="line"
          filter={["==", ["geometry-type"], "LineString"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": "#F4A340",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 12, 2.25, 16, 4.5],
            "line-dasharray": [1.2, 1.1],
            "line-opacity": 0.95,
          }}
        />
        <Layer
          id={HIT_ID}
          type="line"
          filter={["==", ["geometry-type"], "LineString"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": "#000000",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 12, 16, 22],
            "line-opacity": 0,
          }}
        />
        <Layer
          id={POINT_ID}
          type="circle"
          filter={["==", ["geometry-type"], "Point"]}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8],
            "circle-color": "#F4A340",
            "circle-stroke-color": "#5B321D",
            "circle-stroke-width": 2,
            "circle-opacity": 0.96,
          }}
        />
        <Layer
          id={POINT_HIT_ID}
          type="circle"
          filter={["==", ["geometry-type"], "Point"]}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 14, 14, 22],
            "circle-color": "#000000",
            "circle-opacity": 0,
          }}
        />
      </Source>

      {popup ? (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
          className="radius-map-popup"
          onClose={() => setPopup(null)}
        >
          <article className="w-[min(78vw,19rem)] p-1 text-left">
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--app-warning) 18%, white)",
                  color: "var(--app-warning-press)",
                }}
              >
                <TrafficCone className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.11em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Maryland WZDx · Road work
                </p>
                <h3
                  className="mt-0.5 text-[15px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {popup.road}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="grid min-h-11 min-w-11 place-items-center rounded-full"
                aria-label="Close road-work details"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <p
              className="mt-2 text-[13px] font-medium leading-snug"
              style={{ color: "var(--app-ink)" }}
            >
              {popup.title}
            </p>
            {popup.laneImpact || popup.detail ? (
              <p
                className="mt-1 text-[12px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {[popup.laneImpact, popup.detail].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <div
              className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {popup.status ? <span>{popup.status}</span> : null}
              {end ? <span>Expected through {end}</span> : null}
              {updated ? <span>Updated {updated}</span> : null}
            </div>
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

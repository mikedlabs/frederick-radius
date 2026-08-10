"use client";

import { useEffect, useState } from "react";
import { useLiveLayerGate, type LiveLayerGate } from "./liveLayerGate";
import { ExternalLink, Info, Snowflake, X } from "lucide-react";
import { Layer, Popup, Source, useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import type { SnowRouteFC } from "./types";

const SOURCE_ID = "radius-county-snow-routes";
const LINE_ID = "radius-county-snow-routes-line";
const HIT_ID = "radius-county-snow-routes-hit";

type SnowPopup = SnowRouteFC["features"][number]["properties"] & {
  lng: number;
  lat: number;
};

function statusLabel(status: SnowPopup["reportedStatus"]): string {
  switch (status) {
    case "clear":
      return "Clear";
    case "narrow_clear":
      return "Narrow clear";
    case "emergency_access":
      return "Emergency access";
    case "closed":
      return "Closed";
    default:
      return "Status unknown";
  }
}

function reportedTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

/**
 * Current County SnowCommand route reports, folded into the existing Roads
 * view. These are route-operation statuses, never plow vehicle positions or a
 * guarantee that a road is safe.
 */
export default function SnowRoutes({
  show,
  data,
  gate,
}: {
  show: boolean;
  data: SnowRouteFC;
  /** Puts this internally-owned popup under AppMap's one-foreground gate. */
  gate?: LiveLayerGate;
}) {
  const { current: map } = useMap();
  const [popup, setPopup] = useState<SnowPopup | null>(null);
  useLiveLayerGate(gate, () => setPopup(null));

  useEffect(() => {
    const instance = map?.getMap();
    if (!instance || !show || data.features.length === 0) return;
    const onClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const text = (key: string) =>
        typeof properties[key] === "string" && properties[key]
          ? String(properties[key])
          : undefined;
      const reportedStatus = text("reportedStatus");
      if (
        reportedStatus !== "clear" &&
        reportedStatus !== "narrow_clear" &&
        reportedStatus !== "emergency_access" &&
        reportedStatus !== "closed" &&
        reportedStatus !== "unknown"
      ) {
        return;
      }
      gate?.onWillOpen();
      setPopup({
        id: text("id") ?? "county-snow-route",
        district: text("district"),
        reportedStatus,
        observedAt: text("observedAt"),
        sourceUrl:
          text("sourceUrl") ??
          "https://fcgis.frederickcountymd.gov/server_pub/rest/services/FeatureServices/SnowCommand/FeatureServer",
        roadSafety: "not_established",
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      });
    };
    const enter = () => {
      instance.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      instance.getCanvas().style.cursor = "";
    };
    if (!instance.getLayer(HIT_ID)) return;
    instance.on("click", HIT_ID, onClick);
    instance.on("mouseenter", HIT_ID, enter);
    instance.on("mouseleave", HIT_ID, leave);
    return () => {
      instance.off("click", HIT_ID, onClick);
      instance.off("mouseenter", HIT_ID, enter);
      instance.off("mouseleave", HIT_ID, leave);
    };
  }, [data, gate, map, show]);

  if (!show || data.features.length === 0) return null;

  return (
    <>
      <Source
        id={SOURCE_ID}
        type="geojson"
        data={data as unknown as GeoJSON.FeatureCollection}
      >
        <Layer
          id={LINE_ID}
          type="line"
          paint={{
            "line-color": [
              "match",
              ["get", "reportedStatus"],
              "closed",
              "#B42318",
              "emergency_access",
              "#C2410C",
              "narrow_clear",
              "#B07A1E",
              "clear",
              "#315A43",
              "#5C5A50",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 15, 4],
            "line-opacity": 0.82,
          }}
        />
        <Layer
          id={HIT_ID}
          type="line"
          paint={{ "line-color": "#000000", "line-width": 16, "line-opacity": 0 }}
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
                  background:
                    "color-mix(in srgb, var(--app-cool) 16%, white)",
                  color: "var(--app-cool)",
                }}
              >
                <Snowflake className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.11em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  County snow-route report
                </p>
                <h3
                  className="mt-0.5 text-[15px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {statusLabel(popup.reportedStatus)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="grid min-h-11 min-w-11 place-items-center rounded-full"
                aria-label="Close snow-route details"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {popup.district ? (
              <p
                className="mt-2 text-[12px] font-medium"
                style={{ color: "var(--app-ink-2)" }}
              >
                District {popup.district}
              </p>
            ) : null}
            {reportedTime(popup.observedAt) ? (
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Reported {reportedTime(popup.observedAt)}
              </p>
            ) : null}
            <p
              className="mt-2 flex gap-1.5 text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              This is a route-operation report, not a plow location or proof
              that the road is safe.
            </p>
            <a
              href={popup.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              Open Frederick County GIS
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </article>
        </Popup>
      ) : null}
    </>
  );
}

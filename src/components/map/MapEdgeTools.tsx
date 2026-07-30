"use client";

import {
  BusFront,
  Camera,
  CircleParking,
  CloudRain,
  Footprints,
  Helicopter,
  Images,
  LoaderCircle,
  LocateFixed,
  Siren,
  Toilet,
  TrafficCone,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { LiveLayerHealth } from "@/lib/live-layer-health";
import type { RotorcraftLayerStatus } from "./LiveRotorcraft";
import {
  activeMapEdgeOverlayCount,
  MAP_EDGE_OVERLAY_IDS,
  type MapEdgeOverlayId,
  type MapEdgeOverlayState,
} from "./mapEdgeToolsModel";

type IncidentSummary = {
  id: string;
  kind: string;
  location: string;
  sourceLabel: string;
  ageLabel: string;
};

function rotorcraftSummary(status: RotorcraftLayerStatus | null): string {
  if (!status) return "Checking public ADS-B coverage…";
  if (!status.available) {
    return "Coverage unavailable · absence is not confirmed";
  }
  if (status.stale) {
    return "Last public observation is stale · current activity unknown";
  }
  if (status.fmhCount > 0) return "Possible FMH flight activity";
  if (status.trooperCount > 0) {
    return "Trooper airborne in Frederick County";
  }
  if (status.count > 0) {
    return `${status.count} public helicopter observation${
      status.count === 1 ? "" : "s"
    }`;
  }
  return "No public observations · coverage incomplete";
}

export type MapEdgeToolsProps = {
  awake: boolean;
  onWake: () => void;
  locating: boolean;
  located: boolean;
  onLocate: () => void;
  overlays: MapEdgeOverlayState;
  onToggle: (id: MapEdgeOverlayId, next: boolean) => void;
  incidentHealth: LiveLayerHealth;
  recentIncidentCount: number;
  latestIncident: IncidentSummary | null;
  onFocusIncident: (id: string) => void;
  rotorcraftStatus: RotorcraftLayerStatus | null;
};

const TOOL_META: Record<
  MapEdgeOverlayId,
  {
    label: string;
    shortLabel: string;
    title: string;
    color: string;
    icon: LucideIcon;
  }
> = {
  incidents: {
    label: "Scanner reports",
    shortLabel: "Reports",
    title: "Current public road-impact reports from FrederickScanner",
    color: "var(--app-brand)",
    icon: Siren,
  },
  aviation: {
    label: "Helicopter activity",
    shortLabel: "Air",
    title:
      "Public helicopter observations, possible FMH activity, and publicly identified Trooper flights",
    color: "#D89B2B",
    icon: Helicopter,
  },
  traffic: {
    label: "Traffic flow",
    shortLabel: "Traffic",
    title: "Mapbox congestion with official Maryland WZDx work zones",
    color: "#D35F2D",
    icon: TrafficCone,
  },
  radar: {
    label: "Weather radar",
    shortLabel: "Radar",
    title:
      "RainViewer precipitation radar with NOAA lightning density when current",
    color: "var(--app-cool)",
    icon: CloudRain,
  },
  parking: {
    label: "Parking",
    shortLabel: "Parking",
    title: "Downtown garages and live availability",
    color: "var(--app-cool)",
    icon: CircleParking,
  },
  transit: {
    label: "Transit",
    shortLabel: "Transit",
    title: "TransIT routes, stops, and live buses",
    color: "var(--app-cool)",
    icon: BusFront,
  },
  trails: {
    label: "Trails",
    shortLabel: "Trails",
    title: "County trail lines",
    color: "var(--app-positive)",
    icon: Footprints,
  },
  cameras: {
    label: "Traffic cameras",
    shortLabel: "Cameras",
    title: "Live Maryland CHART road cameras",
    color: "var(--app-cool)",
    icon: Camera,
  },
  aerial: {
    label: "Aerial photos",
    shortLabel: "Aerial",
    title: "Frederick Radius seasonal aerial photo archive",
    color: "var(--app-brand-press)",
    icon: Images,
  },
};

export default function MapEdgeTools({
  awake,
  onWake,
  locating,
  located,
  onLocate,
  overlays,
  onToggle,
  incidentHealth,
  recentIncidentCount,
  latestIncident,
  onFocusIncident,
  rotorcraftStatus,
}: MapEdgeToolsProps) {
  const activeCount = activeMapEdgeOverlayCount(overlays);

  return (
    <aside
      className="map-edge-tools"
      data-awake={awake ? "true" : "false"}
      data-has-active={activeCount > 0 || undefined}
      aria-label="Quick map actions"
      onPointerEnter={onWake}
      onFocusCapture={onWake}
      onKeyDownCapture={onWake}
    >
      <div className="map-edge-tools-rail">
        <button
          type="button"
          className="map-edge-tool map-edge-tool-primary map-edge-tool-locate"
          data-on={located || undefined}
          onClick={onLocate}
          aria-label="Find me"
          aria-busy={locating || undefined}
          title="Move the map to your location"
        >
          {locating ? (
            <LoaderCircle
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              strokeWidth={2.15}
              aria-hidden
            />
          ) : (
            <LocateFixed className="h-5 w-5" strokeWidth={2.15} aria-hidden />
          )}
          <span className="map-edge-tool-label">
            <span className="map-edge-tool-label-long">
              {locating ? "Finding you…" : "Find me"}
            </span>
            <span className="map-edge-tool-label-short">
              {locating ? "Finding…" : "Near me"}
            </span>
          </span>
        </button>

        <Link
          href="/amenities"
          prefetch={false}
          className="map-edge-tool map-edge-tool-primary map-edge-tool-essential"
          title="Find the closest mapped restroom, water, trash, dog needs, seating, or outlet"
          aria-label="Find a nearby essential"
          onClick={onWake}
        >
          <Toilet className="h-5 w-5" strokeWidth={2.15} aria-hidden />
          <span className="map-edge-tool-label">
            <span className="map-edge-tool-label-long">Nearby essentials</span>
            <span className="map-edge-tool-label-short">Essentials</span>
          </span>
        </Link>

        {!overlays.incidents &&
          recentIncidentCount > 0 &&
          incidentHealth.status === "ready" && (
            <button
              type="button"
              className="map-edge-tool map-edge-tool-active"
              data-attention="true"
              aria-pressed="false"
              aria-label={`${recentIncidentCount} recent public incident${
                recentIncidentCount === 1 ? "" : "s"
              } from Frederick Scanner. Show on map`}
              title={`${recentIncidentCount} recent public incident${
                recentIncidentCount === 1 ? "" : "s"
              } from Frederick Scanner`}
              onClick={() => {
                onToggle("incidents", true);
                if (latestIncident) onFocusIncident(latestIncident.id);
              }}
              style={{ "--tool-color": TOOL_META.incidents.color } as React.CSSProperties}
            >
              <Siren className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
              <span className="map-edge-tool-label">
                {recentIncidentCount} public report
                {recentIncidentCount === 1 ? "" : "s"}
              </span>
              <span className="map-edge-tool-badge" aria-hidden>
                {recentIncidentCount}
              </span>
            </button>
          )}

        {!overlays.aviation &&
          rotorcraftStatus?.available &&
          !rotorcraftStatus.stale &&
          (rotorcraftStatus.fmhCount > 0 ||
            rotorcraftStatus.trooperCount > 0) && (
            <button
              type="button"
              className="map-edge-tool map-edge-tool-active"
              data-attention="true"
              aria-pressed="false"
              aria-label={`${
                rotorcraftStatus.fmhCount > 0
                  ? "Possible FMH flight activity"
                  : "Trooper airborne in Frederick County"
              }. Show on map`}
              title={
                rotorcraftStatus.fmhCount > 0
                  ? "Possible FMH flight activity"
                  : "Trooper airborne in Frederick County"
              }
              onClick={() => onToggle("aviation", true)}
              style={
                {
                  "--tool-color": TOOL_META.aviation.color,
                } as React.CSSProperties
              }
            >
              <Helicopter
                className="h-[18px] w-[18px]"
                strokeWidth={2.25}
                aria-hidden
              />
              <span className="map-edge-tool-label">
                {rotorcraftStatus.fmhCount > 0
                  ? "Possible FMH activity"
                  : "Trooper airborne"}
              </span>
              <span className="map-edge-tool-badge" aria-hidden>
                {Math.max(
                  rotorcraftStatus.fmhCount,
                  rotorcraftStatus.trooperCount,
                )}
              </span>
            </button>
          )}

        {MAP_EDGE_OVERLAY_IDS.filter((id) => overlays[id]).map((id) => {
            const meta = TOOL_META[id];
            const Icon = meta.icon;
            const isScanner = id === "incidents";
            const isAviation = id === "aviation";
            const aviationAttention =
              isAviation &&
              Boolean(
                rotorcraftStatus &&
                  rotorcraftStatus.available &&
                  !rotorcraftStatus.stale &&
                  (rotorcraftStatus.fmhCount > 0 ||
                    rotorcraftStatus.trooperCount > 0),
              );
            return (
              <button
                key={id}
                type="button"
                className="map-edge-tool map-edge-tool-active"
                data-on="true"
                data-attention={
                  (isScanner &&
                    recentIncidentCount > 0 &&
                    incidentHealth.status === "ready") ||
                  aviationAttention
                    ? "true"
                    : undefined
                }
                aria-pressed="true"
                aria-label={
                  isAviation && aviationAttention
                    ? `${rotorcraftSummary(rotorcraftStatus)}. Hide ${meta.label}`
                    : `Hide ${meta.label}`
                }
                title={
                  isAviation && aviationAttention
                    ? rotorcraftSummary(rotorcraftStatus)
                    : `Hide ${meta.label}`
                }
                onClick={() => onToggle(id, false)}
                style={{ "--tool-color": meta.color } as React.CSSProperties}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                <span className="map-edge-tool-label">
                  {isAviation && aviationAttention
                    ? rotorcraftStatus!.fmhCount > 0
                      ? "Possible FMH activity"
                      : "Trooper airborne"
                    : `${meta.shortLabel} on`}
                </span>
                {isScanner && incidentHealth.count > 0 && (
                  <span className="map-edge-tool-badge" aria-hidden>
                    {incidentHealth.count}
                  </span>
                )}
                {isAviation &&
                  rotorcraftStatus &&
                  rotorcraftStatus.count > 0 && (
                    <span className="map-edge-tool-badge" aria-hidden>
                      {rotorcraftStatus.count}
                    </span>
                  )}
              </button>
            );
          })}
      </div>
    </aside>
  );
}

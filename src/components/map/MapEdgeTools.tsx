"use client";

import {
  BusFront,
  Camera,
  ChevronRight,
  CircleParking,
  CloudRain,
  Footprints,
  Helicopter,
  Images,
  Layers3,
  LoaderCircle,
  LocateFixed,
  Siren,
  TimerReset,
  TrafficCone,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

function scannerSummary(health: LiveLayerHealth): string {
  if (health.status === "unavailable") return "Source unavailable";
  if (health.status === "disabled") return "Checking FrederickScanner…";
  if (health.status === "stale") {
    return health.count > 0
      ? `${health.count} cached public report${health.count === 1 ? "" : "s"} · source stale`
      : "The last source update is stale";
  }
  if (health.count > 0) {
    return `${health.count} current public report${health.count === 1 ? "" : "s"}`;
  }
  return "No public reports in the latest response";
}

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
  unavailable?: Partial<Record<MapEdgeOverlayId, boolean>>;
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
    title: "Mapbox congestion and road closures",
    color: "#D35F2D",
    icon: TrafficCone,
  },
  radar: {
    label: "Weather radar",
    shortLabel: "Radar",
    title: "Animated precipitation radar from RainViewer",
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
  unavailable = {},
  onToggle,
  incidentHealth,
  recentIncidentCount,
  latestIncident,
  onFocusIncident,
  rotorcraftStatus,
}: MapEdgeToolsProps) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const activeCount = activeMapEdgeOverlayCount(overlays);

  useEffect(() => {
    const closeForMapGesture = () => setOpen(false);
    window.addEventListener("fr:map-edge-gesture", closeForMapGesture);
    return () =>
      window.removeEventListener("fr:map-edge-gesture", closeForMapGesture);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      flyoutRef.current
        ?.querySelector<HTMLButtonElement>(
          ".map-edge-tool-choice:not(:disabled)",
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  return (
    <aside
      className="map-edge-tools"
      data-awake={awake || open ? "true" : "false"}
      data-open={open || undefined}
      data-has-active={activeCount > 0 || undefined}
      aria-label="Quick map tools"
      onPointerEnter={onWake}
      onFocusCapture={onWake}
      onKeyDownCapture={(event) => {
        onWake();
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          event.preventDefault();
          close();
        }
      }}
    >
      {open && (
        <div
          ref={flyoutRef}
          className="map-edge-tools-flyout"
          aria-label="Map layer tools"
        >
          <div className="map-edge-tools-flyout-head">
            <span>Live map tools</span>
            <button type="button" onClick={close} aria-label="Close map tools">
              Close
            </button>
          </div>
          <div className="map-edge-tools-grid">
            {MAP_EDGE_OVERLAY_IDS.map((id) => {
              const meta = TOOL_META[id];
              const Icon = meta.icon;
              const disabled = unavailable[id] ?? false;
              const isScanner = id === "incidents";
              const isAviation = id === "aviation";
              const count = isScanner
                ? incidentHealth.count
                : isAviation
                  ? rotorcraftStatus?.count ?? null
                  : null;
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
                  className="map-edge-tool-choice"
                  data-on={overlays[id] || undefined}
                  data-attention={
                    (isScanner &&
                      recentIncidentCount > 0 &&
                      incidentHealth.status === "ready") ||
                    aviationAttention
                      ? "true"
                      : undefined
                  }
                  aria-pressed={overlays[id]}
                  disabled={disabled}
                  title={disabled ? `${meta.label} is unavailable` : meta.title}
                  onClick={() => onToggle(id, !overlays[id])}
                  style={{ "--tool-color": meta.color } as React.CSSProperties}
                >
                  <span className="map-edge-tool-choice-icon" aria-hidden>
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.15} />
                  </span>
                  <span>
                    <strong>{meta.label}</strong>
                    <small>
                      {isScanner
                        ? scannerSummary(incidentHealth)
                        : isAviation
                          ? rotorcraftSummary(rotorcraftStatus)
                          : meta.title}
                    </small>
                  </span>
                  {(isScanner || isAviation) &&
                    count !== null &&
                    count > 0 && (
                    <span
                      className="map-edge-tool-count"
                      aria-label={`${count} ${
                        isScanner ? "reports" : "observations"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {latestIncident && (
            <button
              type="button"
              className="map-edge-incident-jump"
              onClick={() => {
                onFocusIncident(latestIncident.id);
                close();
              }}
            >
              <span className="map-edge-incident-kicker">Newest public report</span>
              <strong>
                {latestIncident.kind} · {latestIncident.location}
              </strong>
              <small>
                {latestIncident.sourceLabel} · {latestIncident.ageLabel}
              </small>
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            </button>
          )}

          {overlays.traffic && (
            <p className="map-edge-traffic-key">
              <strong>Traffic key</strong> · Amber is moderate, orange is heavy,
              red is severe, and dashed red marks closures.
            </p>
          )}

          {overlays.aviation && (
            <p className="map-edge-traffic-key">
              <strong>Aircraft coverage</strong> · Public ADS-B can miss
              helicopters. FMH movement labels are possible trajectories, not
              confirmed landings or departures.
            </p>
          )}
        </div>
      )}

      <div className="map-edge-tools-rail">
        <Link
          href="/map?mode=radius"
          className="map-edge-tool map-edge-tool-primary"
          title="Choose a start point and see what is within walking, biking, or driving time"
          aria-label="What can I reach?"
          onClick={onWake}
        >
          <TimerReset className="h-5 w-5" strokeWidth={2.15} aria-hidden />
          <span className="map-edge-tool-label">
            <span className="map-edge-tool-label-long">What can I reach?</span>
            <span className="map-edge-tool-label-short">Reach</span>
          </span>
        </Link>

        <button
          type="button"
          className="map-edge-tool map-edge-tool-primary"
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

        <button
          ref={menuButtonRef}
          type="button"
          className="map-edge-tool map-edge-tool-primary"
          data-on={open || undefined}
          onClick={() => {
            onWake();
            setOpen((current) => !current);
          }}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={
            activeCount > 0
              ? `Map tools, ${activeCount} active`
              : "Open map tools"
          }
          title="Open live and local map tools"
        >
          <Layers3 className="h-5 w-5" strokeWidth={2.15} aria-hidden />
          <span className="map-edge-tool-label">
            <span className="map-edge-tool-label-long">Map tools</span>
            <span className="map-edge-tool-label-short">Tools</span>
          </span>
          {activeCount > 0 && (
            <span className="map-edge-tool-badge" aria-hidden>
              {activeCount}
            </span>
          )}
        </button>

        {!open &&
          !overlays.incidents &&
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

        {!open &&
          !overlays.aviation &&
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

        {!open &&
          MAP_EDGE_OVERLAY_IDS.filter((id) => overlays[id]).map((id) => {
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

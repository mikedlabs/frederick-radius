"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveLayerHealth } from "@/lib/live-layer-health";
import {
  EMPTY_ROAD_WORK_ZONE_FC,
  type RoadWorkZoneFC,
} from "./types";
import type { LiveLayerGate } from "./liveLayerGate";
import RoadWorkZones from "./RoadWorkZones";

const ENDPOINT = "/api/overlays/road-closures";
const POLL_MS = 60_000;
const CLIENT_TIMEOUT_MS = 8_000;

export type OfficialRoadClosureBounds = [
  [number, number],
  [number, number],
];

function collection(value: unknown): RoadWorkZoneFC | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { type?: unknown; features?: unknown };
  return raw.type === "FeatureCollection" && Array.isArray(raw.features)
    ? (value as RoadWorkZoneFC)
    : null;
}

function boundsOf(data: RoadWorkZoneFC): OfficialRoadClosureBounds | null {
  const coordinates: Array<[number, number]> = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      coordinates.push([value[0], value[1]]);
      return;
    }
    for (const item of value) visit(item);
  };
  for (const feature of data.features) {
    const geometry = feature.geometry as { coordinates?: unknown } | null;
    visit(geometry?.coordinates);
  }
  if (coordinates.length === 0) return null;
  return [
    [
      Math.min(...coordinates.map(([lng]) => lng)),
      Math.min(...coordinates.map(([, lat]) => lat)),
    ],
    [
      Math.max(...coordinates.map(([lng]) => lng)),
      Math.max(...coordinates.map(([, lat]) => lat)),
    ],
  ];
}

function currentCount(data: RoadWorkZoneFC): number {
  return data.features.filter(
    (feature) => feature.properties.lifecycle === "current",
  ).length;
}

/**
 * Official active/scheduled SHA closures under the existing Traffic switch.
 * It deliberately owns no button: Roads Now turns it on with the other travel
 * evidence. A failed refresh keeps the last visible geometry but marks it
 * stale for scene logic instead of clearing the road and implying calm.
 */
export default function OfficialRoadClosures({
  show,
  gate,
  onHealth,
  onBounds,
}: {
  show: boolean;
  gate?: LiveLayerGate;
  onHealth?: (health: LiveLayerHealth) => void;
  onBounds?: (bounds: OfficialRoadClosureBounds | null) => void;
}) {
  const [data, setData] = useState<RoadWorkZoneFC>(EMPTY_ROAD_WORK_ZONE_FC);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const checkedAtRef = useRef<string | null>(null);
  const onHealthRef = useRef(onHealth);
  const onBoundsRef = useRef(onBounds);
  useEffect(() => {
    onHealthRef.current = onHealth;
  }, [onHealth]);
  useEffect(() => {
    onBoundsRef.current = onBounds;
  }, [onBounds]);

  useEffect(() => {
    if (!show) return;
    let alive = true;
    let inFlight: AbortController | null = null;

    const reportUnavailable = () => {
      const cached = dataRef.current;
      const count = currentCount(cached);
      onHealthRef.current?.({
        status: cached.features.length > 0 ? "stale" : "unavailable",
        count,
        source: "Maryland SHA road closures",
        timestamp: checkedAtRef.current,
      });
    };

    const load = async () => {
      if (inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      const timer = window.setTimeout(
        () => controller.abort(),
        CLIENT_TIMEOUT_MS,
      );
      try {
        const response = await fetch(ENDPOINT, {
          headers: { Accept: "application/geo+json, application/json" },
          signal: controller.signal,
          cache: "no-cache",
        });
        if (!response.ok) {
          if (alive) reportUnavailable();
          return;
        }
        const parsed = collection(await response.json().catch(() => null));
        if (!parsed) {
          if (alive) reportUnavailable();
          return;
        }
        if (!alive) return;
        const checkedAt = response.headers.get("x-radius-source-checked-at");
        const sourceStatus = response.headers.get("x-radius-source-status");
        checkedAtRef.current = checkedAt;
        dataRef.current = parsed;
        setData(parsed);
        onBoundsRef.current?.(boundsOf(parsed));
        const count = currentCount(parsed);
        onHealthRef.current?.({
          status:
            sourceStatus === "stale"
              ? "stale"
              : count > 0
                ? "ready"
                : "empty",
          count,
          reportedCount: parsed.features.length,
          source: "Maryland SHA road closures",
          timestamp: checkedAt,
        });
      } catch {
        if (alive) reportUnavailable();
      } finally {
        window.clearTimeout(timer);
        if (inFlight === controller) inFlight = null;
      }
    };

    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      inFlight?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [show]);

  return (
    <RoadWorkZones
      show={show}
      data={data}
      gate={gate}
      sourceKey="sha-road-closures"
      defaultSourceLabel="Maryland SHA · Road closure"
    />
  );
}

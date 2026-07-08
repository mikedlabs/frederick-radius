"use client";

import { useMemo } from "react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import type { MapPinPlace } from "./types";

/**
 * MapList — the map's list face. The same currently-filtered pins, turned
 * into a scannable roll the user can read top to bottom instead of hunting
 * the canvas. Rows carry the field-guide essentials (category plate, name,
 * open line, distance-from-you when we hold a fix); tapping one flies the
 * map to that pin and opens its peek. Nearest-first when located, else the
 * incoming (feature-score) order.
 *
 * Honest empty state: when a filter matches nothing, say so plainly rather
 * than showing a blank sheet.
 */

function openLine(p: MapPinPlace): { text: string; tone: string } | null {
  switch (p.open_status.state) {
    case "open":
      return { text: "Open now", tone: "var(--app-positive)" };
    case "closing-soon":
      return { text: "Closes soon", tone: "var(--app-warning-press, #8F5600)" };
    case "closed":
      return { text: "Closed", tone: "var(--app-ink-3)" };
    default:
      return null;
  }
}

export default function MapList({
  places,
  userLoc,
  onPick,
}: {
  places: MapPinPlace[];
  userLoc: LngLat | null;
  onPick: (place: MapPinPlace) => void;
}) {
  const rows = useMemo(() => {
    if (!userLoc) return places.slice(0, 200);
    return [...places]
      .map((p) => ({ p, d: p.geom ? haversineMeters(userLoc, p.geom) : Infinity }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 200)
      .map((x) => x.p);
  }, [places, userLoc]);

  return (
    <div className="map-list" role="region" aria-label="Places, as a list">
      {rows.length === 0 ? (
        <div className="map-list-empty">
          <p className="font-serif map-list-empty-title">Nothing matches yet</p>
          <p className="map-list-empty-sub">
            Loosen a filter in the dock, or switch back to the map to browse the
            whole county.
          </p>
        </div>
      ) : (
        <ul className="map-list-rows">
          {rows.map((p) => {
            const cat = CATEGORY_BY_SLUG[p.category];
            const color = cat?.color ?? "var(--app-brand)";
            const open = openLine(p);
            const dist =
              userLoc && p.geom ? formatDistance(haversineMeters(userLoc, p.geom)) : null;
            return (
              <li key={p.slug}>
                <button
                  type="button"
                  className="map-list-row tap-44"
                  onClick={() => {
                    haptic("light");
                    onPick(p);
                  }}
                >
                  <span
                    aria-hidden
                    className="map-list-dot"
                    style={{ background: color }}
                  />
                  <span className="map-list-main">
                    <span className="map-list-name">{p.name}</span>
                    <span className="map-list-sub">
                      <span style={{ color }}>{cat?.name ?? p.category}</span>
                      {open && (
                        <>
                          <span aria-hidden className="map-list-mid">·</span>
                          <span style={{ color: open.tone, fontWeight: 600 }}>
                            {open.text}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  {dist && <span className="map-list-dist">{dist}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

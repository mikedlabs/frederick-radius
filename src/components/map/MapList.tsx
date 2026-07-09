"use client";

import { useMemo } from "react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import type { MapPinPlace } from "./types";

/**
 * MapList — the map's list face. The same currently-filtered pins, turned
 * into a scannable roll the user can read top to bottom instead of hunting
 * the canvas. Rows carry the field-guide essentials (category plate, name,
 * town, open line, distance-from-you when we hold a fix); tapping one flies
 * the map to that pin and opens its peek. Nearest-first when located; with
 * no fix, open-now leads and the pins' feature score breaks ties, so the
 * first screen is a browsable ranking rather than whatever order arrived
 * (which fronted a run of golf clubs on the whole-county view).
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
    if (!userLoc) {
      const openScore = (p: MapPinPlace) =>
        p.open_status.state === "open" || p.open_status.state === "closing-soon" ? 1 : 0;
      return [...places]
        .sort(
          (a, b) =>
            openScore(b) - openScore(a) ||
            (b.feature_score ?? 0) - (a.feature_score ?? 0),
        )
        .slice(0, 200);
    }
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
            // The town anchors a whole-county roll ("Golf · Ijamsville") the
            // way /nearby and /category cards already do — without it a row
            // like "Whiskey Creek Golf Club · Golf" places nothing.
            const town = MUNICIPALITY_BY_SLUG[p.municipality]?.name;
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
                      {town && (
                        <>
                          <span aria-hidden className="map-list-mid">·</span>
                          <span>{town}</span>
                        </>
                      )}
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

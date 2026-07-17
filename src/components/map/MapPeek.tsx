"use client";

import { useState } from "react";
import { Bookmark, CornerUpRight, X } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { useIsSaved, useToggleSave } from "@/hooks/useSaved";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import type { EventPin, MapPinPlace } from "./types";

/**
 * MapPeek — the quick-peek card that rises from the bottom when a pin is
 * tapped. A compact place card the user can act on WITHOUT leaving the
 * map: a static-map thumbnail, the live open-now line, distance (only
 * when we actually hold a fix — honest), and the two verbs that matter
 * from a pin — Save and Directions. "Open page" hands off to the full
 * PlaceSheet for the deep read.
 *
 * This upgrades the old cramped Mapbox popup into a real bottom peek: it
 * lives in normal DOM (over the map, under the nav) so it can be a proper
 * ≥44px-target card instead of a tooltip anchored to a moving pin.
 */

/** The one-line open state, in the field-guide voice. Counts stay out of
 *  it; this is a status, not a tally. */
function openLine(p: MapPinPlace): { text: string; tone: string } {
  const s = p.open_status;
  switch (s.state) {
    case "open":
      return { text: "Open now", tone: "var(--app-positive)" };
    case "closing-soon":
      return { text: "Closes soon", tone: "var(--app-warning-press, #8F5600)" };
    case "closed":
      return { text: "Closed now", tone: "var(--app-ink-3)" };
    default:
      return { text: "Hours not listed", tone: "var(--app-ink-3)" };
  }
}

export default function MapPeek({
  place,
  hostedEvent = null,
  userLoc,
  onClose,
  onDetails,
}: {
  place: MapPinPlace;
  /** The soonest upcoming event hosted AT this place (venue join), when
   *  the active event window holds one. Renders as one quiet line. */
  hostedEvent?: EventPin | null;
  userLoc: LngLat | null;
  onClose: () => void;
  /** Open the full PlaceSheet for the deep read. */
  onDetails: () => void;
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const catColor = cat?.color ?? "var(--app-brand)";
  const saved = useIsSaved("place", place.slug);
  const toggleSave = useToggleSave("place", place.slug);
  const open = openLine(place);
  const [imgOk, setImgOk] = useState(true);

  const dist =
    userLoc && place.geom
      ? formatDistance(haversineMeters(userLoc, place.geom))
      : null;

  // The static-map thumbnail — the image "already available" for a pin
  // that ships no photo in the slim payload. A pin marks where it sits, so
  // a small map crop reads as the place at a glance. Fails soft to a
  // category-tinted band (the Referer-restricted token can 403 off-domain).
  const pin = cat?.color && /^#[0-9a-fA-F]{6}$/.test(cat.color)
    ? cat.color.slice(1).toLowerCase()
    : "e14328";
  const staticSrc = place.geom
    ? `/api/static-map?lng=${place.geom.lng.toFixed(5)}&lat=${place.geom.lat.toFixed(5)}&pin=${pin}&size=320x150`
    : "";

  const directionsHref = place.geom
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.geom.lat},${place.geom.lng}`
    : "#";

  return (
    <div className="map-peek" role="dialog" aria-label={place.name}>
      <button
        type="button"
        className="map-peek-close tap-44"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
      </button>

      <button type="button" className="map-peek-body" onClick={onDetails}>
        <span className="map-peek-thumb" style={{ background: catColor }}>
          {imgOk && staticSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- static Mapbox crop, outside next/image
            <img
              src={staticSrc}
              alt=""
              width={80}
              height={80}
              decoding="async"
              className="field-map-image"
              onError={() => setImgOk(false)}
            />
          )}
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat" style={{ color: catColor }}>
            {cat?.name ?? place.category}
          </span>
          <span className="map-peek-name font-serif">{place.name}</span>
          <span className="map-peek-meta">
            <span style={{ color: open.tone, fontWeight: 600 }}>{open.text}</span>
            {dist && (
              <>
                <span aria-hidden className="map-peek-dot">·</span>
                <span className="map-peek-dist">{dist}</span>
              </>
            )}
          </span>
          {/* Cross-joins (2026-07-17 map audit): the verified deal and the
              soonest hosted event, each one quiet truncated line. The pin
              already carries deal_hook; the event rides in via the venue
              join. Nothing renders when neither exists. */}
          {place.deal_hook && (
            <span
              className="map-peek-meta block truncate"
              style={{ display: "block", color: "var(--app-accent-press)", fontWeight: 600 }}
            >
              {place.deal_hook}
            </span>
          )}
          {hostedEvent && (
            <span
              className="map-peek-meta block truncate"
              style={{ display: "block", color: "var(--app-brand-2)", fontWeight: 600 }}
            >
              {hostedEvent.title} ·{" "}
              {new Intl.DateTimeFormat("en-US", {
                timeZone: "America/New_York",
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(hostedEvent.starts_at))}
            </span>
          )}
        </span>
      </button>

      <div className="map-peek-acts">
        <button
          type="button"
          className="map-peek-act"
          data-on={saved || undefined}
          aria-pressed={saved}
          onClick={() => {
            haptic("light");
            track("map_peek", { pick: saved ? "unsave" : "save" });
            toggleSave();
          }}
        >
          <Bookmark
            className="h-4 w-4"
            strokeWidth={2}
            fill={saved ? "currentColor" : "none"}
            aria-hidden
          />
          {saved ? "Saved" : "Save"}
        </button>
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
          onClick={() => {
            haptic("light");
            track("map_peek", { pick: "directions" });
          }}
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
      </div>
    </div>
  );
}

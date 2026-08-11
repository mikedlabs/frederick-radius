"use client";

import { useEffect, useId, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  CornerUpRight,
  Share2,
} from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { directionsHref } from "@/lib/map/directionsHref";
import { formatHoursLine, type OpenStatus } from "@/lib/hours";
import { useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import PlacePhoto from "@/components/place/PlacePhoto";
import { GooglePhotoAttributionLine } from "@/components/place/GoogleAttribution";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import type { EventPin, MapPinPlace } from "./types";
import type { NearbyUtility } from "./mapNearby";
import {
  buildMapPeekDecisionSurface,
  mapDecisionFreshnessLabel,
  type MapPeekDecisionCue,
} from "./mapDecisionScenes";
import MapResultSurface from "./MapResultSurface";

type MapCardDetails = {
  slug: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  google_photo_url?: string;
  hero_image?: string;
  google_photo_attribution?: GooglePhotoAttribution;
  google_maps_uri?: string;
  open_status?: OpenStatus;
  hours_updated_at?: string;
};

function statusTone(status: OpenStatus): string {
  switch (status.state) {
    case "open":
      return "var(--app-positive)";
    case "closing-soon":
      return "var(--app-warning-press, #8F5600)";
    default:
      return "var(--app-ink-3)";
  }
}

function decisionCueLabel(cue: MapPeekDecisionCue): string {
  if (cue.kind === "event") return "Next here";
  if (cue.kind === "special") return "Special";
  if (cue.kind === "utility") return "Closest useful point";
  return "Getting here";
}

function DecisionCueSource({ cue }: { cue: MapPeekDecisionCue }) {
  if (!cue.sourceLabel) return null;
  const sourceDate = mapDecisionFreshnessLabel(cue.observedAt);
  return (
    <p>
      <strong>Source</strong>{" "}
      {cue.sourceUrl ? (
        <a
          href={cue.sourceUrl}
          className="underline underline-offset-2"
          {...(cue.sourceUrl.startsWith("http")
            ? { target: "_blank", rel: "noreferrer" }
            : {})}
        >
          {cue.sourceLabel}
        </a>
      ) : cue.sourceLabel}
      {sourceDate ? ` · checked ${sourceDate}` : ""}
    </p>
  );
}

/**
 * A selected place should answer the first practical questions without
 * replacing the map. Heavy data is hydrated only for the one tapped pin:
 * authentic reviewed photo, street address, and the current hours verdict.
 * Secondary context stays behind one "Around here" disclosure.
 */
export default function MapPeek({
  place,
  hostedEvent = null,
  nearestGarage = null,
  nearbyUtilities = [],
  distanceOrigin,
  distanceOriginLabel,
  onClose,
  onDetails,
}: {
  place: MapPinPlace;
  hostedEvent?: EventPin | null;
  nearestGarage?: { name: string; distM: number; available: number | null } | null;
  nearbyUtilities?: NearbyUtility[];
  /** Device location when available. Without one, omit distance. */
  distanceOrigin: LngLat | null;
  distanceOriginLabel: "from you" | "from map center";
  onClose: () => void;
  onDetails: () => void;
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const catColor = cat?.color ?? "var(--app-brand)";
  const saved = useIsFollowed(place.slug);
  const toggleSave = useToggleFollow(place.slug, "map_peek");
  const [details, setDetails] = useState<MapCardDetails | null>(null);
  const [detailsResolvedSlug, setDetailsResolvedSlug] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  // A fixed card clock keeps ranking deterministic for the life of this peek
  // and avoids changing event copy between unrelated photo/details updates.
  const [decisionClock] = useState(() => new Date().toISOString());
  const activeDetails = details?.slug === place.slug ? details : null;
  const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name;
  const status = activeDetails?.open_status ?? place.open_status;
  const hoursLine = formatHoursLine(status);
  const dist =
    distanceOrigin && place.geom
      ? formatDistance(haversineMeters(distanceOrigin, place.geom))
      : null;
  const address = activeDetails?.address?.trim();
  const locationLine = address || town;
  const photoUrl =
    activeDetails?.google_photo_url ??
    activeDetails?.hero_image;
  const photoPending = !activeDetails && detailsResolvedSlug !== place.slug;
  const dirHref = place.geom ? directionsHref(place.geom.lat, place.geom.lng) : "#";
  const nameId = useId();
  const descriptionId = useId();
  const decisionSurface = buildMapPeekDecisionSurface({
    place,
    hostedEvent,
    nearestGarage,
    nearbyUtilities,
    now: decisionClock,
  });
  const decisionCue = decisionSurface?.lead ?? null;
  const decisionAlternatives = decisionSurface?.alternatives ?? [];
  const aroundCount = decisionCue ? 1 + decisionAlternatives.length : 0;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/places/map-card/${encodeURIComponent(place.slug)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { place?: MapCardDetails | null } | null) => {
        if (body?.place?.slug === place.slug) setDetails(body.place);
        setDetailsResolvedSlug(place.slug);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") {
          // Pin data still provides the name, status, category, and actions.
          setDetailsResolvedSlug(place.slug);
        }
      });
    return () => controller.abort();
  }, [place.slug]);

  const sharePlace = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("place", place.slug);
    url.searchParams.delete("event");
    haptic("light");
    track("map_share", { surface: "place", slug: place.slug });
    try {
      if (navigator.share) {
        await navigator.share({
          title: place.name,
          text: `${place.name} on the Frederick Radius map.`,
          url: url.toString(),
        });
      } else {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("copied");
        window.setTimeout(() => setShareStatus("idle"), 2200);
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("copied");
        window.setTimeout(() => setShareStatus("idle"), 2200);
      } catch {
        // Leave the card intact when browser sharing is unavailable.
      }
    }
  };

  return (
    <MapResultSurface
      className="map-peek"
      labelledBy={nameId}
      describedBy={descriptionId}
      closeLabel={`Close ${place.name}`}
      onClose={onClose}
    >
      <div className="map-peek-body" data-map-place-slug={place.slug}>
        <button
          type="button"
          className="map-peek-visual"
          data-loading={photoPending || undefined}
          onClick={onDetails}
          aria-label={`Open details for ${place.name}`}
        >
          {photoUrl ? (
            <>
              <PlacePhoto
                src={photoUrl}
                alt={`Photo of ${place.name}`}
                glyph={place.name.slice(0, 1)}
                color={catColor}
                sizes="78px"
                className="absolute inset-0 h-full w-full"
              />
              {activeDetails?.google_photo_url && (
                <span className="map-peek-photo-credit">
                  <GooglePhotoAttributionLine
                    attribution={activeDetails.google_photo_attribution}
                    placeGoogleMapsUri={activeDetails.google_maps_uri}
                    compact
                    showAvatar={false}
                  />
                </span>
              )}
            </>
          ) : (
            <span
              aria-hidden
              className="map-peek-category-mark"
              style={{ "--map-peek-color": catColor } as React.CSSProperties}
            >
              {place.name.slice(0, 1)}
            </span>
          )}
        </button>

        <div className="map-peek-text">
          <span className="map-peek-cat" style={{ color: catColor }}>
            {cat?.name ?? place.category}
          </span>
          <button type="button" className="map-peek-title-button" onClick={onDetails}>
            <span id={nameId} className="map-peek-name font-serif">{place.name}</span>
          </button>
          {locationLine && <span className="map-peek-address">{locationLine}</span>}
          <span className="map-peek-meta">
            <span style={{ color: statusTone(status), fontWeight: 650 }}>{hoursLine}</span>
            {dist && (
              <>
                <span aria-hidden className="map-peek-dot">·</span>
                <span className="map-peek-dist">{dist} {distanceOriginLabel}</span>
              </>
            )}
          </span>
          <button type="button" className="map-peek-details-link" onClick={onDetails}>
            Details
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </div>

      {aroundCount > 0 && (
        <details className="map-peek-around">
          <summary data-map-decision-lead={decisionCue?.candidateId}>
            {decisionCue?.headline ?? "Around here"}
            <span>{aroundCount}</span>
            <ChevronDown className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </summary>
          <div className="map-peek-around-body">
            {decisionCue && (
              <p data-map-decision-cue={decisionCue.kind}>
                <strong>{decisionCueLabel(decisionCue)}</strong> {decisionCue.detail}
              </p>
            )}
            {decisionCue && <DecisionCueSource cue={decisionCue} />}
            {decisionAlternatives.length > 0 && (
              <div
                data-map-decision-alternatives
                className="grid gap-2 pt-1"
                style={{ borderTop: "1px solid var(--app-border)" }}
              >
                {decisionAlternatives.map((alternative) => (
                  <div
                    key={alternative.candidateId}
                    data-map-decision-alternative={alternative.candidateId}
                  >
                    <p>
                      <strong>{decisionCueLabel(alternative)}</strong> {alternative.detail}
                    </p>
                    <DecisionCueSource cue={alternative} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      <span id={descriptionId} className="sr-only">
        {cat?.name ?? place.category}. {hoursLine}.
        {locationLine ? ` ${locationLine}.` : ""}
        {dist ? ` ${dist} ${distanceOriginLabel}.` : ""}
        Open details, save, share, or get directions.
      </span>

      <div className="map-peek-acts">
        <a
          href={dirHref}
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
        <button
          type="button"
          className="map-peek-act"
          data-on={saved || undefined}
          aria-pressed={saved}
          onClick={() => {
            haptic("light");
            track("map_peek", { pick: saved ? "unsave" : "save" });
            void toggleSave();
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
        <button
          type="button"
          className="map-peek-act map-peek-act-share"
          onClick={() => void sharePlace()}
          aria-label={shareStatus === "copied" ? "Link copied" : `Share ${place.name}`}
        >
          {shareStatus === "copied"
            ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
            : <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />}
          <span>{shareStatus === "copied" ? "Copied" : "Share"}</span>
        </button>
      </div>
    </MapResultSurface>
  );
}

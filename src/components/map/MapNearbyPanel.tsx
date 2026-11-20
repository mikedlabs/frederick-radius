"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import CategoryIcon from "@/components/place/CategoryIcon";
import PlaceCardPhoto, { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { formatDistance, haversineMeters, isValidCoord, type LngLat } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import {
  recordPlaceCardPhotoResult, selectedPlaceCardPhoto,
  type PlaceCardPhotoPlan, type PlaceCardPhotoState,
} from "@/lib/place-card-photo";
import { LOCAL_DISCOVERY_IDENTITIES } from "@/lib/today/discovery-places";
import { TODAY_PHOTO_APPEARANCE_REVIEWS } from "@/lib/today/place-photo-appearance";
import { todaySavedPlacePhotoPlan } from "@/lib/today/saved-place-photo";
import { rankPlacesInView } from "./MapInViewPlacesDisclosure";
import type { MapPinPlace } from "./types";
import styles from "./MapNearbyPanel.module.css";

type PanelProps = {
  places: readonly MapPinPlace[];
  sortOrigin: LngLat | null;
  userLoc: LngLat | null;
  selectedSlug?: string | null;
  onPick: (place: MapPinPlace) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

const PAGE_SIZE = 5;
const NO_PHOTO: PlaceCardPhotoPlan = { key: "no-approved-map-photo", sources: [] };
const SHORT_TITLES = new Map(
  LOCAL_DISCOVERY_IDENTITIES.filter((place) => place.shortName).map((place) => [place.slug, place.shortName]),
);
const PHOTO_CANDIDATES = new Set([
  ...LOCAL_DISCOVERY_IDENTITIES.map((place) => place.slug),
  ...TODAY_PHOTO_APPEARANCE_REVIEWS.map((review) => review.slug),
]);

function NearbyPlace({
  place, origin, fromDevice, heading, selected, onPick, plan,
}: {
  place: MapPinPlace;
  origin: LngLat | null;
  fromDevice: boolean;
  heading?: string;
  selected: boolean;
  onPick: PanelProps["onPick"];
  plan: PlaceCardPhotoPlan;
}) {
  const metaId = useId();
  const [photoState, setPhotoState] = useState<PlaceCardPhotoState | null>(null);
  const photo = selectedPlaceCardPhoto(plan, photoState);
  const loaded = Boolean(photo && photoState?.planKey === plan.key && photoState.loadedSrc === photo.src);
  const needsCredit = photo?.kind === "curated" || (photo?.kind === "owned" && photo.referenceContext === "appearance-unverified");
  const category = CATEGORY_BY_SLUG[place.category]?.name ?? place.category;
  const title = SHORT_TITLES.get(place.slug) ?? place.name;
  const distance = origin && isValidCoord(place.geom)
    ? formatDistance(haversineMeters(origin, place.geom))
    : null;

  return (
    <>
      <button
        type="button"
        className={styles.open}
        data-map-nearby-place={place.slug}
        data-lead={Boolean(heading)}
        data-has-photo-plan={plan.sources.length > 0}
        aria-current={selected ? "location" : undefined}
        aria-label={title === place.name ? title : `${title}, ${place.name}`}
        aria-describedby={metaId}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          haptic("light");
          onPick(place);
        }}
      >
        <span className={styles.media} data-map-nearby-media={place.slug}
          data-photo-source={photo?.kind} data-photo-state={photo ? loaded ? "ready" : "pending" : "fallback"}>
          {photo ? (
            <PlaceCardPhoto source={photo} width={160} sizes="(max-width: 379px) 82px, 128px"
              onResult={(src, result) => setPhotoState((previous) =>
                recordPlaceCardPhotoResult(plan, previous, src, result))} />
          ) : (
            <CategoryIcon slug={place.category} className={styles.glyph} strokeWidth={1.65} />
          )}
        </span>
        <span className={styles.copy}>
          {heading && <span className={styles.heading}>{heading}</span>}
          <strong data-map-nearby-name className={styles.name}>{title}</strong>
          <span id={metaId} className={styles.meta}>
            {category}{distance && <> · {distance} {fromDevice ? "from you" : "from map center"}</>}
          </span>
        </span>
      </button>
      {loaded && needsCredit && <div className={styles.credit}>
        <PlaceCardPhotoCredit source={photo} loaded touchTarget compact discloseModifications />
      </div>}
    </>
  );
}

export default function MapNearbyPanel({
  places, sortOrigin, userLoc, onPick, selectedSlug, expanded, onExpandedChange,
}: PanelProps) {
  const listId = useId();
  const origin = isValidCoord(sortOrigin) ? sortOrigin : null;
  const ranked = useMemo(() => rankPlacesInView(places, origin), [places, origin]);
  const [count, setCount] = useState(PAGE_SIZE);
  if (!expanded && count !== PAGE_SIZE) setCount(PAGE_SIZE);
  const candidates = useMemo(() => ranked.filter((place) => PHOTO_CANDIDATES.has(place.slug)), [ranked]);
  // Evaluate current appearance against today's date on each render, and only
  // for the small approved cohort actually present in the committed view.
  const photos = new Map<string, PlaceCardPhotoPlan>();
  for (const { slug } of candidates) {
    const plan = todaySavedPlacePhotoPlan(slug);
    if (plan.sources.length) photos.set(slug, plan);
  }
  const first = expanded ? ranked[0] : ranked.find((place) => photos.has(place.slug)) ?? ranked[0];
  if (!first) return null;

  const fromDevice = Boolean(origin && userLoc && isValidCoord(userLoc) &&
    origin.lng === userLoc.lng && origin.lat === userLoc.lat);
  const heading = fromDevice ? "Near you" : "In this view";
  const remaining = Math.max(0, ranked.length - count);
  const hasMore = ranked.length > 1;
  const toggleText = expanded ? "Less" : `All ${ranked.length.toLocaleString("en-US")}`;

  return (
    <section aria-label={heading} className={styles.panel} data-map-nearby-panel
      data-expanded={expanded ? "true" : "false"}>
      <div className={styles.lead}>
        <NearbyPlace key={first.slug} place={first} origin={origin} fromDevice={fromDevice}
          plan={photos.get(first.slug) ?? NO_PHOTO}
          selected={selectedSlug === first.slug} heading={heading} onPick={onPick} />
        {hasMore && (
          <button className={styles.toggle} type="button" data-map-nearby-toggle
            aria-expanded={expanded} aria-controls={listId}
            aria-label={expanded ? `${toggleText}, collapse nearby places` : `${toggleText} places in this view`}
            onClick={() => {
              haptic("light");
              onExpandedChange(!expanded);
            }}>
            {expanded ? <ChevronDown aria-hidden size={16} /> : <ChevronUp aria-hidden size={16} />}
            <span>{toggleText}</span>
          </button>
        )}
      </div>
      {hasMore && <div id={listId} hidden={!expanded}>
        {expanded && <>
          <ul className={styles.list} aria-label="More places in this view">
            {ranked.slice(1, count).map((place) => (
              <li key={place.slug} className={styles.row}>
                <NearbyPlace place={place} origin={origin} fromDevice={fromDevice}
                  plan={photos.get(place.slug) ?? NO_PHOTO}
                  selected={selectedSlug === place.slug} onPick={onPick} />
              </li>
            ))}
          </ul>
          {remaining > 0 && <button type="button" className={styles.more} aria-controls={listId}
            onClick={() => setCount((previous) => previous + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, remaining)} more
          </button>}
        </>}
      </div>}
    </section>
  );
}

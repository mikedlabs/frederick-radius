"use client";

import { Suspense, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import PlaceCardPhoto, { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { DaypartPick } from "@/lib/loaders/daypartPicks";
import { withBrowseReturnTo } from "@/lib/browse-return";
import { getScope, parseScope, scopeToParam, subscribeScopeChange } from "@/lib/scope";
import { useTodayPlacePhoto } from "./useTodayPlacePhoto";
import styles from "./TodayPlacePreview.module.css";

export type TodayPlaceAvailability = "current" | "opening-soon";

const subscribe = (listener: () => void) => subscribeScopeChange(() => listener());

/** The cached first paint has real native destinations, without inventing a
 * URL lens. Native browser Back retains the originating Today URL. */
function PreviewActions({ place, detailHref, mapHref, availability }: {
  place: DaypartPick;
  availability: TodayPlaceAvailability;
  detailHref: string;
  mapHref: string;
}) {
  return (
    <div className={styles.actions}>
        <Link href={detailHref} prefetch={false} aria-label={`View place: ${place.name}`}
          data-today-place-lead={availability === "current" ? true : undefined}
          data-today-opening-soon={availability === "opening-soon" ? true : undefined}
          data-place-availability={availability === "opening-soon" ? availability : undefined}
          data-decision-impression="true" data-decision-surface="today" data-decision-entity="place"
          data-decision-id={place.slug} data-decision-position={availability === "opening-soon" ? availability : "lead"} data-decision-action="open">
          View place <ArrowRight aria-hidden />
        </Link>
        <Link href={mapHref} prefetch={false} aria-label={`Map: ${place.name}`}><MapPin aria-hidden />Map</Link>
      </div>
  );
}

/** Only actions read request-specific parameters. Their own boundary lets the
 * surrounding exact image and factual card remain in the cached first paint. */
function ScopedPreviewActions({ place, availability }: { place: DaypartPick; availability: TodayPlaceAvailability }) {
  const storedScope = useSyncExternalStore(subscribe, getScope, () => null);
  const params = useSearchParams();
  const scope = parseScope(params?.get("in")) ?? storedScope ?? "county";
  const returnParams = new URLSearchParams(params?.toString() ?? "");
  returnParams.set("in", scopeToParam(scope));
  const returnTo = `/today?${returnParams.toString()}`;
  const detailHref = withBrowseReturnTo(`/places/${place.slug}`, returnTo);
  const mapParams = new URLSearchParams({ place: place.slug, in: scopeToParam(scope) });
  const mapHref = withBrowseReturnTo(`/map?${mapParams.toString()}`, returnTo);
  return <PreviewActions place={place} detailHref={detailHref} mapHref={mapHref} availability={availability} />;
}

/** One exact place, with facts and navigation useful even without imagery.
 * The selected source owns its credit; neither action wraps a credit link. */
export default function TodayPlacePreview({ place, category, hydratePhoto = false, className = "", availability = "current" }: {
  place: DaypartPick;
  category: string;
  hydratePhoto?: boolean;
  className?: string;
  availability?: TodayPlaceAvailability;
}) {
  const photo = useTodayPlacePhoto(place, 360, hydratePhoto);
  const fact = place.fact || (availability === "opening-soon" ? "Opening time available"
    : place.confidence === "confirmed" ? "Open now" : place.confidence === "likely" ? "Likely open" : "Hours not confirmed");
  const location = [place.where, place.distance].filter(Boolean).join(" · ");

  return (
    <article data-today-place-card={availability === "opening-soon" ? availability : "lead"}
      data-today-place-preview={availability === "current" ? true : undefined}
      data-today-opening-soon-preview={availability === "opening-soon" ? true : undefined}
      data-place-availability={availability === "opening-soon" ? availability : undefined}
      data-has-photo={Boolean(photo.source)} className={`${styles.preview} ${className}`}>
      {photo.source && <div className={styles.media}>
        <PlaceCardPhoto key={photo.source.src} decodeIdentity={photo.sourceKey} source={photo.source} onResult={photo.onResult}
          width={360} deferGoogleBytes sizes="(min-width: 640px) 520px, calc(100vw - 32px)" />
      </div>}
      <div className={styles.facts}>
        <p className={styles.category}>{CATEGORY_BY_SLUG[category]?.name ?? category.replace(/-/g, " ")}</p>
        <h3 data-today-pick-name className={styles.name}>{place.name}</h3>
        <div data-today-pick-context className={styles.context}>
          <p data-today-pick-fact className={styles.fact}>{fact}</p>
          {location && <p data-today-pick-location className={styles.location}>{location}</p>}
        </div>
      </div>
      <Suspense fallback={<PreviewActions place={place} availability={availability} detailHref={`/places/${place.slug}`}
        mapHref={`/map?${new URLSearchParams({ place: place.slug }).toString()}`} />}>
        <ScopedPreviewActions place={place} availability={availability} />
      </Suspense>
      <PlaceCardPhotoCredit source={photo.source} loaded={photo.loaded} touchTarget />
    </article>
  );
}

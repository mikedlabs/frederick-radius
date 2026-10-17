"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { DaypartPick } from "@/lib/loaders/daypartPicks";
import {
  placeCardPhotoPlan,
  placePhotoFailureSignalSrc,
  recordPlaceCardPhotoResult,
  selectedPlaceCardPhoto,
  type PlaceCardPhotoPlan,
  type PlaceCardPhotoResult,
  type PlaceCardPhotoState,
} from "@/lib/place-card-photo";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { useTodayPhotoCredit } from "./useTodayPhotoCredit";

type PhotoInput = Pick<DaypartPick, "slug" | "photo" | "photoAttribution">;
type SelectionState = {
  selectionKey: string;
  result: PlaceCardPhotoState;
  loadedSourceIdentity: string | null;
};

/** Late exact credit can add a Google fallback to an unchanged selection.
 * Rebase only that selection's results, so exhausted free sources stay failed. */
function resultForPlan(state: SelectionState | null, selectionKey: string, plan: PlaceCardPhotoPlan) {
  return state?.selectionKey === selectionKey
    ? { ...state.result, planKey: plan.key }
    : null;
}

/** Today uses the same exact-place sources as the map and Find. Only its
 * existing visible brief card may hydrate Google credit, after free choices
 * fail; healthy owned/Commons imagery never needs that metadata request. */
export function useTodayPlacePhoto(place: PhotoInput, width: number, hydrateGoogleCredit: boolean) {
  const freePlan = placeCardPhotoPlan({
    slug: place.slug,
    google_photo_url: place.photo?.startsWith("/images/") ? place.photo : undefined,
  }, width, { preferNonGoogle: true });
  // Updating only the paid fallback must not discard the unchanged free
  // source's decoded credit or retry it after failure. Google source URLs and
  // credit changes remain guarded separately by their complete identity.
  const selectionKey = JSON.stringify([place.slug, width, freePlan.sources]);
  const [state, setState] = useState<SelectionState | null>(null);
  const freeSource = selectedPlaceCardPhoto(freePlan, resultForPlan(state, selectionKey, freePlan));
  const unsuitableGoogle = freePlan.sources.some((source) => source.kind === "curated" && source.photo.preferCurated);
  const rawSource = place.photo ? placePhotoFailureSignalSrc(proxyPhotoAtWidth(place.photo, width)) : null;
  const rawFailed = state?.selectionKey === selectionKey && Boolean(rawSource && state.result.failedSources.includes(rawSource));
  const { credit } = useTodayPhotoCredit(place,
    hydrateGoogleCredit && !freeSource && !unsuitableGoogle && !rawFailed);
  const plan = placeCardPhotoPlan({
    slug: place.slug,
    google_photo_url: place.photo ?? undefined,
    google_photo_attribution: credit,
  }, width, { preferNonGoogle: true });
  const source = selectedPlaceCardPhoto(plan, resultForPlan(state, selectionKey, plan));
  // Include the source metadata, not only its URL: a changed credit cannot
  // borrow a previous source's decoded/visible attribution state.
  const sourceIdentity = source ? JSON.stringify(source) : null;
  const committed = useRef<{ selectionKey: string; sourceIdentity: string | null } | null>(null);
  useLayoutEffect(() => {
    committed.current = { selectionKey, sourceIdentity };
    return () => { committed.current = null; };
  }, [selectionKey, sourceIdentity]);
  const onResult = (src: string, result: PlaceCardPhotoResult) => {
    if (committed.current?.selectionKey !== selectionKey ||
      committed.current.sourceIdentity !== sourceIdentity) return;
    setState((previous) => {
      const next = recordPlaceCardPhotoResult(plan, resultForPlan(previous, selectionKey, plan), src, result);
      return { selectionKey, result: next,
        loadedSourceIdentity: result === "loaded" && next.loadedSrc === src ? sourceIdentity : null };
    });
  };

  return {
    source,
    sourceIdentity,
    loaded: Boolean(source && state?.selectionKey === selectionKey && state.loadedSourceIdentity === sourceIdentity),
    onResult,
  };
}

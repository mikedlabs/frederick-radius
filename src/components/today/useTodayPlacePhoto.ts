"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DaypartPick } from "@/lib/loaders/daypartPicks";
import {
  placeCardPhotoPlan, placePhotoFailureSignalSrc, recordPlaceCardPhotoResult, selectedPlaceCardPhoto,
  type PlaceCardPhotoPlan, type PlaceCardPhotoResult, type PlaceCardPhotoState,
} from "@/lib/place-card-photo";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { useTodayPhotoCredit } from "./useTodayPhotoCredit";

type Selection = Readonly<{ key: string }>;
type Display = Readonly<{ selection: Selection; sourceKey: string | null }>;
type SelectionState = { selection: Selection; rawSource: string | null; result: PlaceCardPhotoState; loadedDisplay: Display | null };
type PhotoInput = Pick<DaypartPick, "slug" | "photo" | "photoAttribution">;

/** Late existing credit may expand this selection's fallback plan. Preserve
 * failed free sources while keeping another place/resource's state separate. */
function resultForPlan(state: SelectionState | null, selection: Selection, plan: PlaceCardPhotoPlan, rawSource: string | null) {
  if (state?.selection !== selection) return null;
  // A replaced paid candidate may start a new paid lifecycle, without retrying
  // failed free files or hiding the credit on an unchanged decoded free file.
  const failedSources = state.rawSource === rawSource ? state.result.failedSources
    : state.result.failedSources.filter((src) => plan.sources.some((source) => source.kind !== "google" && source.src === src));
  return { ...state.result, planKey: plan.key, failedSources };
}

/** Exact free imagery leads. The existing brief lead/OpeningSoon allowance is
 * the only metadata hydration path; supplied exact credit retains its existing
 * eligibility. Rendering and paid byte ownership remain in PlaceCardPhoto. */
export function useTodayPlacePhoto(place: PhotoInput, width: number, hydrateGoogleCredit: boolean) {
  const freePlan = placeCardPhotoPlan({
    slug: place.slug,
    google_photo_url: place.photo?.startsWith("/images/") ? place.photo : undefined,
  }, width);
  const selectionKey = String(JSON.stringify([place.slug, width, freePlan.sources]));
  // A return to A after B is a fresh lifecycle, even for an identical URL.
  const selection = useMemo(() => Object.freeze({ key: selectionKey }), [selectionKey]);
  const [state, setState] = useState<SelectionState | null>(null);
  const rawSource = place.photo ? placePhotoFailureSignalSrc(proxyPhotoAtWidth(place.photo, width)) : null;
  const freeSource = selectedPlaceCardPhoto(freePlan, resultForPlan(state, selection, freePlan, rawSource));
  const unsuitableGoogle = freePlan.sources.some((source) => source.kind === "curated" && source.photo.preferCurated);
  const rawFailed = state?.selection === selection && Boolean(rawSource && state.result.failedSources.includes(rawSource));
  const { credit } = useTodayPhotoCredit(place,
    hydrateGoogleCredit && !freeSource && !unsuitableGoogle && !rawFailed);
  const basePlan = placeCardPhotoPlan({ slug: place.slug, google_photo_url: place.photo ?? undefined, google_photo_attribution: credit }, width);
  const sources = [...basePlan.sources.filter((source) => source.kind !== "google"), ...basePlan.sources.filter((source) => source.kind === "google")];
  const plan = { key: JSON.stringify([place.slug, sources]), sources };
  const source = selectedPlaceCardPhoto(plan, resultForPlan(state, selection, plan, rawSource));
  const sourceKey = source ? String(JSON.stringify([selectionKey, source])) : null;
  const display = useMemo(() => Object.freeze({ selection, sourceKey }), [selection, sourceKey]);
  const committed = useRef<Display | null>(null);
  useLayoutEffect(() => {
    committed.current = display;
    return () => { committed.current = null; };
  }, [display]);
  const onResult = (src: string, result: PlaceCardPhotoResult) => {
    if (committed.current !== display) return;
    setState((previous) => {
      const next = recordPlaceCardPhotoResult(plan, resultForPlan(previous, selection, plan, rawSource), src, result);
      return { selection, rawSource, result: next, loadedDisplay: result === "loaded" && next.loadedSrc === src ? display : null };
    });
  };
  return { source, sourceKey, onResult, loaded: Boolean(source && state?.selection === selection && state.loadedDisplay === display) };
}

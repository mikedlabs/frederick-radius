"use client";

import {
  createContext,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import Image, { type ImageProps } from "next/image";
import {
  isPlacePhotoFailureSignal,
  placePhotoFailureSignalSrc,
} from "@/components/place/PlaceHeroMedia";

/**
 * Honest photo state for every surface that paints a place or venue photo.
 *
 * The place-photo proxy answers a failure (daily cap, rate limit, missing key,
 * upstream error) with a 200 image so an <img> never shows a broken icon. That
 * success status means a plain `<Image>` cannot tell a fallback plate from a
 * photograph, and surfaces used to crop the plate or print a photographer's
 * credit under it. This hook asks the proxy for its transparent 1px failure
 * signal (the same contract PlaceHeroMedia already uses) and reports:
 *
 * - `loading`: a photo was requested and has not settled. Show the photo slot,
 *   never its credit.
 * - `ready`: a real image decoded. Credit may render now.
 * - `missing`: there is no photo, or the request failed or returned the
 *   signal. Render the surface's designed photoless state and no credit.
 *
 * The status is keyed to the source, so a sheet whose photo arrives late or
 * changes does not inherit the previous photo's verdict.
 */
export type PlacePhotoStatus = "loading" | "ready" | "missing";

export type PlacePhotoState = {
  /** The source to paint, already asking the proxy for its failure signal. */
  src: string | null;
  status: PlacePhotoStatus;
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
};

export function usePlacePhotoState(
  rawSrc: string | null | undefined,
): PlacePhotoState {
  const src = rawSrc ? placePhotoFailureSignalSrc(rawSrc) : null;
  const [settled, setSettled] = useState<{
    src: string;
    status: "ready" | "missing";
  } | null>(null);
  const status: PlacePhotoStatus = !src
    ? "missing"
    : settled?.src === src
      ? settled.status
      : "loading";

  return {
    src,
    status,
    onLoad: (event) => {
      if (!src) return;
      setSettled({
        src,
        status: isPlacePhotoFailureSignal(event.currentTarget)
          ? "missing"
          : "ready",
      });
    },
    onError: () => {
      if (src) setSettled({ src, status: "missing" });
    },
  };
}

/**
 * Scope form of the same state, for server-rendered layouts whose photo,
 * credit and photoless fallback live in separate subtrees (a card whose
 * credit sits outside its link, a page hero whose frame changes shape).
 * The scope is a client boundary; everything passed through it may still be
 * server-rendered.
 */
const PlacePhotoContext = createContext<PlacePhotoState | null>(null);

export function PlacePhotoScope({
  src,
  children,
}: {
  src: string | null | undefined;
  children: ReactNode;
}) {
  const state = usePlacePhotoState(src);
  return (
    <PlacePhotoContext.Provider value={state}>
      {children}
    </PlacePhotoContext.Provider>
  );
}

function usePlacePhotoScope(): PlacePhotoState {
  const state = useContext(PlacePhotoContext);
  if (!state) {
    throw new Error("Place photo scope components must render inside PlacePhotoScope.");
  }
  return state;
}

/** The scope's photo. It unmounts as soon as the photo is known missing. */
export function PlacePhotoScopeImage({
  alt,
  ...props
}: Omit<ImageProps, "src" | "onLoad" | "onError" | "unoptimized">) {
  const { src, status, onLoad, onError } = usePlacePhotoScope();
  if (!src || status === "missing") return null;
  return (
    <Image
      {...props}
      alt={alt}
      src={src}
      unoptimized={src.startsWith("/api/place-photo")}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

/**
 * Render children only in one photo state:
 * - `visible`: a photo is loading or loaded (the photo slot and its overlays);
 * - `ready`: a real image loaded (photo credit);
 * - `missing`: no usable photo (the designed photoless layout).
 */
export function PlacePhotoWhen({
  is,
  children,
}: {
  is: "visible" | "ready" | "missing";
  children: ReactNode;
}) {
  const { status } = usePlacePhotoScope();
  const show =
    is === "visible" ? status !== "missing" : status === is;
  return show ? <>{children}</> : null;
}

/** A header whose frame differs between its photo and photoless layouts. */
export function PlacePhotoHeader({
  photoClassName,
  missingClassName,
  ...props
}: Omit<ComponentPropsWithoutRef<"header">, "className"> & {
  photoClassName: string;
  missingClassName: string;
}) {
  const { status } = usePlacePhotoScope();
  return (
    <header
      {...props}
      className={status === "missing" ? missingClassName : photoClassName}
    />
  );
}

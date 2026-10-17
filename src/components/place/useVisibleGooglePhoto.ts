"use client";

import { useEffect, useRef, useState } from "react";
import {
  GOOGLE_PHOTO_BYTES_ROOT_MARGIN,
  loadPlacePhotoBytes,
  peekPlacePhotoBytes,
  type PlacePhotoBytes,
} from "@/lib/place-photo-bytes";

export type VisibleGooglePhoto = {
  status: "idle" | "loading" | "ready" | "fallback";
  objectUrl?: string;
  reason?: string;
};

function fromCache(src: string | null): VisibleGooglePhoto | null {
  if (!src) return null;
  const cached = peekPlacePhotoBytes(src);
  if (cached?.kind === "photo") return { status: "ready", objectUrl: cached.objectUrl };
  if (cached?.kind === "fallback") return { status: "fallback", reason: cached.reason };
  return null;
}

/**
 * Fetch `/api/place-photo` only after the card's photo frame enters the
 * viewport. A small rootMargin keeps offscreen Nearby cards off the daily cap.
 */
export function useVisibleGooglePhoto(
  src: string | null,
  enabled: boolean,
): {
  frameRef: React.RefObject<HTMLSpanElement | null>;
  bytes: VisibleGooglePhoto;
} {
  const frameRef = useRef<HTMLSpanElement>(null);
  const [requested, setRequested] = useState<{ src: string; bytes: VisibleGooglePhoto } | null>(null);
  const cached = enabled ? fromCache(src) : null;
  const bytes = !enabled || !src
    ? { status: "idle" as const }
    : cached ?? (requested?.src === src ? requested.bytes : { status: "idle" as const });

  useEffect(() => {
    if (!enabled || !src || fromCache(src)) return;

    let active = true;
    let started = false;
    const apply = (entry: PlacePhotoBytes) => {
      if (!active) return;
      setRequested({
        src,
        bytes: entry.kind === "photo"
          ? { status: "ready", objectUrl: entry.objectUrl }
          : { status: "fallback", reason: entry.reason },
      });
    };
    const start = () => {
      if (started) return;
      started = true;
      setRequested({ src, bytes: { status: "loading" } });
      void loadPlacePhotoBytes(src).then(apply);
    };

    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") {
      const scheduled = queueMicrotask(start);
      return () => { active = false; void scheduled; };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
      },
      { rootMargin: GOOGLE_PHOTO_BYTES_ROOT_MARGIN },
    );
    observer.observe(frame);
    return () => { active = false; observer.disconnect(); };
  }, [enabled, src]);

  return { frameRef, bytes };
}

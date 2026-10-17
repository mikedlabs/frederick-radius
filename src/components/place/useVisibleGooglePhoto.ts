"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GOOGLE_PHOTO_BYTES_ROOT_MARGIN, loadPlacePhotoBytes } from "@/lib/place-photo-bytes";

export type VisibleGooglePhoto =
  | { status: "idle" | "loading" }
  | { status: "ready"; objectUrl: string }
  | { status: "fallback"; reason: string };

/** Metadata may arrive near the viewport, but paid bytes wait for the actual
 * frame. A display URL belongs only to this mounted source, never a tab cache. */
export function useVisibleGooglePhoto(src: string | null, enabled: boolean): {
  frameRef: React.RefObject<HTMLSpanElement | null>;
  bytes: VisibleGooglePhoto;
} {
  const frameRef = useRef<HTMLSpanElement>(null);
  // A → B → A, or disable → enable, is a new display lifecycle even when
  // the final string matches an earlier source whose URL was already revoked.
  const identity = useMemo(() => ({ src, enabled }), [src, enabled]);
  const [requested, setRequested] = useState<{ identity: typeof identity; bytes: VisibleGooglePhoto } | null>(null);
  const bytes: VisibleGooglePhoto = enabled && src && requested?.identity === identity
    ? requested.bytes : { status: "idle" };

  useEffect(() => {
    const { src, enabled } = identity;
    if (!enabled || !src) return;
    let active = true;
    let started = false;
    let objectUrl: string | undefined;
    const start = () => {
      if (!active || started) return;
      started = true;
      setRequested({ identity, bytes: { status: "loading" } });
      void loadPlacePhotoBytes(src).then((entry) => {
        if (!active) return;
        if (entry.kind === "fallback") {
          setRequested({ identity, bytes: { status: "fallback", reason: entry.reason } });
          return;
        }
        try {
          objectUrl = URL.createObjectURL(entry.blob);
          setRequested({ identity, bytes: { status: "ready", objectUrl } });
        } catch {
          setRequested({ identity, bytes: { status: "fallback", reason: "display-unavailable" } });
        }
      });
    };
    const frame = frameRef.current;
    if (!frame) return;
    let stopObserving: () => void;
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
      }, { rootMargin: GOOGLE_PHOTO_BYTES_ROOT_MARGIN });
      observer.observe(frame);
      stopObserving = () => observer.disconnect();
    } else {
      // Browsers without IntersectionObserver still respect viewport loading.
      const check = () => {
        const rect = frame.getBoundingClientRect();
        if (rect.bottom > -48 && rect.top < window.innerHeight + 48) {
          start();
          stopObserving();
        }
      };
      stopObserving = () => {
        window.removeEventListener("scroll", check, true);
        window.removeEventListener("resize", check);
      };
      window.addEventListener("scroll", check, { passive: true, capture: true });
      window.addEventListener("resize", check, { passive: true });
      queueMicrotask(check);
    }
    return () => {
      active = false;
      stopObserving();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [identity]);

  return { frameRef, bytes };
}

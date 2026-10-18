"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { EventCardVisual } from "./eventVisuals";

type VisualSelection = { identity: string | null; failed: boolean };
type PendingImageInspection = {
  owner: VisualSelection;
  onUnavailable?: () => void;
  dispose: () => void;
};

/** A selection owns its callbacks, even when A is selected again after B.
 * URL equality alone cannot distinguish a new request from an abandoned one. */
export function useEventVisualLifecycle(visual: EventCardVisual | null) {
  const identity = visual ? visual.key + "\u0000" + visual.src : null;
  const [selection, setSelection] = useState<VisualSelection>({ identity, failed: false });
  // Adjust before committing changed media; keep the factual DOM in place.
  if (selection.identity !== identity) setSelection({ identity, failed: false });
  const currentSelection = useRef<VisualSelection | null>(selection);
  const pendingImages = useRef(new Map<HTMLImageElement, PendingImageInspection>());
  useLayoutEffect(() => {
    currentSelection.current = selection;
    const inspections = pendingImages.current;
    return () => {
      currentSelection.current = null;
      for (const pending of inspections.values()) {
        if (pending.owner === selection) pending.dispose();
      }
    };
  }, [selection]);
  const ownsSelection = () => identity !== null && !selection.failed && currentSelection.current === selection;
  const failImage = () => {
    if (!ownsSelection()) return false;
    // Reject a second callback immediately, before React commits the fallback.
    currentSelection.current = null;
    for (const pending of pendingImages.current.values()) {
      if (pending.owner === selection) pending.dispose();
    }
    setSelection({ ...selection, failed: true });
    return true;
  };

  /** Next may notify onLoad before a lazy image has selected or decoded pixels.
   * Only real intrinsic dimensions or a native error settle that inspection.
   * Returns true only when this call accepts a genuine failure. */
  const inspectLoadedImage = (image: HTMLImageElement, onUnavailable?: () => void): boolean => {
    if (!ownsSelection()) return false;
    // Intrinsic sizes are density-adjusted: a real one-pixel signal can round
    // to zero at DPR3. A completed selected source is settled, while Next's
    // premature callback has no currentSrc and must await its native result.
    const settledSource = image.complete && Boolean(image.currentSrc);
    if ((image.naturalWidth > 0 && image.naturalHeight > 0) || settledSource) {
      pendingImages.current.get(image)?.dispose();
      if (image.naturalWidth <= 1 || image.naturalHeight <= 1) {
        if (!failImage()) return false;
        onUnavailable?.();
        return true;
      }
      return false;
    }

    const existing = pendingImages.current.get(image);
    if (existing?.owner === selection) {
      existing.onUnavailable = onUnavailable;
      return false;
    }
    existing?.dispose();
    const onNativeLoad = () => {
      if (!ownsSelection()) pending.dispose();
      else inspectLoadedImage(image, pending.onUnavailable);
    };
    const onNativeError = () => {
      pending.dispose();
      if (failImage()) pending.onUnavailable?.();
    };
    const pending: PendingImageInspection = {
      owner: selection,
      onUnavailable,
      dispose: () => {
        image.removeEventListener("load", onNativeLoad);
        image.removeEventListener("error", onNativeError);
        if (pendingImages.current.get(image) === pending) pendingImages.current.delete(image);
      },
    };
    pendingImages.current.set(image, pending);
    image.addEventListener("load", onNativeLoad);
    image.addEventListener("error", onNativeError);
    return false;
  };

  return {
    identity,
    visibleVisual: selection.identity === identity && !selection.failed ? visual : null,
    failImage,
    inspectLoadedImage,
  };
}

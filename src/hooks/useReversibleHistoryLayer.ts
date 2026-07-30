"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

const HISTORY_LAYER_KEY = "__frederickRadiusLayer";

function currentLayerId(): string | null {
  if (typeof window === "undefined") return null;
  const state = window.history.state as Record<string, unknown> | null;
  return typeof state?.[HISTORY_LAYER_KEY] === "string"
    ? String(state[HISTORY_LAYER_KEY])
    : null;
}

function pushLayer(id: string) {
  if (typeof window === "undefined" || currentLayerId() === id) return;
  const state =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  window.history.pushState(
    { ...state, [HISTORY_LAYER_KEY]: id },
    "",
    window.location.href,
  );
}

/**
 * Leave a temporary, same-URL history layer before navigating somewhere else.
 *
 * Waiting for popstate prevents the layer's duplicate history entry from
 * becoming a dead Back stop behind the destination page. The callback remains
 * attached even if the closing overlay unmounts during the traversal.
 */
export function navigateAfterHistoryLayer(id: string, next: () => void) {
  if (typeof window === "undefined" || currentLayerId() !== id) {
    next();
    return;
  }
  window.addEventListener(
    "popstate",
    () => {
      window.setTimeout(next, 0);
    },
    { once: true },
  );
  window.history.back();
}

/**
 * Gives a modal surface native-app Back behavior without putting UI state in
 * the URL. Opening pushes one same-URL history entry; browser Back dismisses
 * the surface, while Close/Escape remove that entry themselves.
 *
 * `id` must remain stable while a lazy fallback is replaced by the real
 * surface. That lets both mounts share one history entry instead of stacking
 * two.
 */
export function useReversibleHistoryLayer({
  active,
  id,
  onDismiss,
}: {
  active: boolean;
  id: string;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useLayoutEffect(() => {
    if (!active || !id) return;
    pushLayer(id);
    const onPopState = () => {
      if (currentLayerId() !== id) dismissRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active, id]);

  const dismissOnly = useCallback(() => {
    dismissRef.current();
  }, []);

  const dismiss = useCallback(() => {
    dismissRef.current();
    if (currentLayerId() === id) window.history.back();
  }, [id]);

  const leave = useCallback(
    (next: () => void) => {
      dismissRef.current();
      navigateAfterHistoryLayer(id, next);
    },
    [id],
  );

  return useMemo(
    () => ({ dismiss, dismissOnly, leave }),
    [dismiss, dismissOnly, leave],
  );
}

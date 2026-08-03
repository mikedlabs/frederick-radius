"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

const HISTORY_LAYER_KEY = "__frederickRadiusLayer";
const HISTORY_LAYER_SCROLL_KEY = "__frederickRadiusLayerScrollY";

function currentLayerId(): string | null {
  if (typeof window === "undefined") return null;
  const state = window.history.state as Record<string, unknown> | null;
  return typeof state?.[HISTORY_LAYER_KEY] === "string"
    ? String(state[HISTORY_LAYER_KEY])
    : null;
}

function currentLayerScrollY(): number | null {
  if (typeof window === "undefined") return null;
  const state = window.history.state as Record<string, unknown> | null;
  const value = state?.[HISTORY_LAYER_SCROLL_KEY];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function restoreLayerScroll(scrollY: number | null) {
  if (typeof window === "undefined" || scrollY === null) return;
  const restore = () => window.scrollTo({ top: scrollY, behavior: "auto" });
  // A history traversal and the React unmount can each settle layout after
  // popstate. Restore across those two frames so a same-route sheet never
  // drops someone at the top of the page they were using.
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
}

function pushLayer(id: string, scrollY: number) {
  if (typeof window === "undefined" || currentLayerId() === id) return;
  const state =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  window.history.pushState(
    {
      ...state,
      [HISTORY_LAYER_KEY]: id,
      [HISTORY_LAYER_SCROLL_KEY]: scrollY,
    },
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
  returnScrollY: requestedReturnScrollY,
}: {
  active: boolean;
  id: string;
  onDismiss: () => void;
  /** Scroll coordinate captured before a sticky/fixed trigger receives focus. */
  returnScrollY?: number | null;
}) {
  const dismissRef = useRef(onDismiss);
  const returnScrollYRef = useRef<number | null>(null);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useLayoutEffect(() => {
    if (!active || !id) return;
    const returnScrollY =
      requestedReturnScrollY ?? currentLayerScrollY() ?? window.scrollY;
    returnScrollYRef.current = returnScrollY;
    pushLayer(id, returnScrollY);
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const onPopState = () => {
      if (currentLayerId() !== id) {
        dismissRef.current();
        restoreLayerScroll(returnScrollYRef.current);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, [active, id, requestedReturnScrollY]);

  const dismissOnly = useCallback(() => {
    dismissRef.current();
  }, []);

  const dismiss = useCallback(() => {
    const returnScrollY = currentLayerScrollY() ?? returnScrollYRef.current;
    dismissRef.current();
    if (currentLayerId() === id) {
      // This listener is intentionally independent of the component effect:
      // dismissing can unmount the surface before popstate is delivered.
      window.addEventListener(
        "popstate",
        () => restoreLayerScroll(returnScrollY),
        { once: true },
      );
      window.history.back();
    } else {
      restoreLayerScroll(returnScrollY);
    }
  }, [id]);

  const leave = useCallback(
    (next: () => void) => {
      dismissRef.current();
      navigateAfterHistoryLayer(id, next);
    },
    [id],
  );

  const leaveTo = useCallback(
    (href: string) => {
      if (typeof window === "undefined") return;
      const destination = new URL(href, window.location.href);

      if (destination.origin !== window.location.origin) {
        window.location.assign(destination);
        return;
      }

      const path = `${destination.pathname}${destination.search}${destination.hash}`;
      if (currentLayerId() === id) {
        // Replace the temporary overlay entry itself. App Router transitions
        // can be overwritten by the same-URL history layer's pending restore;
        // a browser replace is atomic, loads the intended route, and keeps one
        // clean Back step to the page beneath Find.
        window.location.replace(path);
      } else {
        // This hook also renders inside server-safe lazy fallbacks, so keep it
        // independent of Next's App Router context. The ordinary branch is an
        // edge case (an active sheet normally owns the history layer), and a
        // native same-origin navigation is reliable in every host.
        window.location.assign(path);
      }
    },
    [id],
  );

  return useMemo(
    () => ({ dismiss, dismissOnly, leave, leaveTo }),
    [dismiss, dismissOnly, leave, leaveTo],
  );
}

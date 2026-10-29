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
const HISTORY_URL_REPLACED = "fr:history-layer-url-replaced";
export const HISTORY_LAYER_URL_RESTORED = "fr:history-layer-url-restored";

/** Mirror shareable state without discarding Next's state or an overlay owner. */
export function replaceHistoryLayerUrl(url: string) {
  const value: unknown = window.history.state;
  const previous = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const state = { ...previous };
  // Next's patched API treats its own flags as an internal write and skips
  // query-context updates. Let it reattach those flags while retaining ours.
  delete state.__NA;
  delete state._N;
  delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
  window.history.replaceState(state, "", url);
  // The plain native API (including tests) has no framework wrapper.
  const flags = Object.fromEntries(["__NA", "_N", "__PRIVATE_NEXTJS_INTERNALS_TREE"].filter(key => Object.hasOwn(previous, key)).map(key => [key, previous[key]]));
  if (!window.history.state?.__NA && Object.entries(flags).some(([key, value]) => window.history.state?.[key] !== value)) {
    window.history.replaceState({ ...window.history.state, ...flags }, "", url);
  }
  window.dispatchEvent(new Event(HISTORY_URL_REPLACED));
}

function restoreSamePathUrl(href: string): boolean {
  if (new URL(href).pathname !== window.location.pathname) return false;
  // A preceding popstate listener may already have queued Next's old URL.
  // Commit through its external bridge, then reconcile the editor's URL reader.
  replaceHistoryLayerUrl(href);
  window.dispatchEvent(new Event(HISTORY_LAYER_URL_RESTORED));
  return true;
}

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

function restoreLayerScroll(scrollY: number | null, expectedHref?: string) {
  if (typeof window === "undefined" || scrollY === null) return;
  const restore = () => {
    if (!expectedHref || window.location.href === expectedHref) window.scrollTo({ top: scrollY, behavior: "auto" });
  };
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
  preserveUrlOnDismiss = false,
}: {
  active: boolean;
  id: string;
  onDismiss: () => void;
  /** Scroll coordinate captured before a sticky/fixed trigger receives focus. */
  returnScrollY?: number | null;
  /** Only an in-place editor may commit its latest query to the underlying entry. */
  preserveUrlOnDismiss?: boolean;
}) {
  const dismissRef = useRef(onDismiss);
  const returnScrollYRef = useRef<number | null>(null);
  const latestHrefRef = useRef<string | null>(null);
  const returningRef = useRef(false);
  const generationRef = useRef(0);
  const isDismissing = useCallback(() => returningRef.current, []);
  const ownsGeneration = useCallback((generation: number) => generationRef.current === generation, []);

  // Opt-in continuations outlive a closing component, but never rewrite or
  // navigate after a different-path traversal has already won.
  const returnFromEditor = useCallback((href: string, scrollY: number | null, next?: () => void) => {
    if (returningRef.current) return;
    returningRef.current = true;
    window.addEventListener("popstate", () => {
      returningRef.current = false;
      if (!restoreSamePathUrl(href)) return;
      if (next) window.setTimeout(() => {
        if (window.location.href === href) next();
      }, 0);
      else restoreLayerScroll(scrollY, href);
    }, { once: true, capture: true });
    window.history.back();
  }, []);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useLayoutEffect(() => {
    const generation = ++generationRef.current;
    if (!active || !id) return;
    const returnScrollY =
      requestedReturnScrollY ?? currentLayerScrollY() ?? window.scrollY;
    returnScrollYRef.current = returnScrollY;
    pushLayer(id, returnScrollY);
    latestHrefRef.current = window.location.href;
    const rememberUrl = () => {
      if (currentLayerId() === id) latestHrefRef.current = window.location.href;
    };
    if (preserveUrlOnDismiss) window.addEventListener(HISTORY_URL_REPLACED, rememberUrl);
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const onPopState = () => {
      if (currentLayerId() !== id) {
        const href = preserveUrlOnDismiss ? latestHrefRef.current : null;
        const restored = href ? restoreSamePathUrl(href) : false;
        dismissRef.current();
        if (!href || restored) restoreLayerScroll(returnScrollYRef.current, href ?? undefined);
      }
    };
    window.addEventListener("popstate", onPopState, preserveUrlOnDismiss);
    return () => {
      window.removeEventListener("popstate", onPopState, preserveUrlOnDismiss);
      window.removeEventListener(HISTORY_URL_REPLACED, rememberUrl);
      window.history.scrollRestoration = previousScrollRestoration;
      if (preserveUrlOnDismiss) queueMicrotask(() => {
        // Strict Mode reattachment, explicit dismissal and a real route change
        // each retain their own ownership; an abandoned same-page layer does not.
        const href = latestHrefRef.current;
        if (ownsGeneration(generation) && !returningRef.current && href && currentLayerId() === id && window.location.pathname === new URL(href).pathname) {
          returnFromEditor(href, returnScrollY);
        }
      });
    };
  }, [active, id, requestedReturnScrollY, preserveUrlOnDismiss, returnFromEditor, ownsGeneration]);

  const dismissOnly = useCallback(() => {
    dismissRef.current();
  }, []);

  const dismiss = useCallback(() => {
    if (preserveUrlOnDismiss && returningRef.current) return;
    const returnScrollY = currentLayerScrollY() ?? returnScrollYRef.current;
    const href = window.location.href;
    const owned = currentLayerId() === id;
    if (preserveUrlOnDismiss && owned) returnFromEditor(href, returnScrollY);
    dismissRef.current();
    if (owned && !preserveUrlOnDismiss) {
      // This listener is intentionally independent of the component effect:
      // dismissing can unmount the surface before popstate is delivered.
      window.addEventListener(
        "popstate",
        () => restoreLayerScroll(returnScrollY),
        { once: true },
      );
      window.history.back();
    } else if (!owned) {
      restoreLayerScroll(returnScrollY, preserveUrlOnDismiss ? href : undefined);
    }
  }, [id, preserveUrlOnDismiss, returnFromEditor]);

  const leave = useCallback(
    (next: () => void) => {
      if (preserveUrlOnDismiss && returningRef.current) return;
      if (preserveUrlOnDismiss && currentLayerId() === id) {
        returnFromEditor(window.location.href, returnScrollYRef.current, next);
        dismissRef.current();
      } else {
        dismissRef.current();
        navigateAfterHistoryLayer(id, next);
      }
    },
    [id, preserveUrlOnDismiss, returnFromEditor],
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
      if (preserveUrlOnDismiss && currentLayerId() === id) {
        leave(() => window.location.assign(destination));
      } else if (currentLayerId() === id) {
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
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(path);
      }
    },
    [id, preserveUrlOnDismiss, leave],
  );

  return useMemo(
    () => ({ dismiss, dismissOnly, leave, leaveTo, isDismissing }),
    [dismiss, dismissOnly, leave, leaveTo, isDismissing],
  );
}

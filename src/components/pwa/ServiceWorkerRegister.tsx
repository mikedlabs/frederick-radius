"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

export const UPDATE_PROMPT_DURATION_MS = 10_000;
export const UPDATE_PROMPT_SNOOZE_MS = 30 * 60 * 1_000;
const UPDATE_PROMPT_SNOOZE_KEY = "fr.update-prompt-snoozed-at.v1";
const UPDATE_PROMPT_PRESENTED_KEY = "fr.update-prompt-presented-at.v1";
const FAIR_OFFLINE_PATHS = new Set([
  "/fair",
  "/moments/great-frederick-fair-2026",
]);

type FairOfflineWorker = Pick<ServiceWorker, "postMessage">;
type FairOfflineRegistration = { active: FairOfflineWorker | null };
type FairOfflineContainer = {
  ready: PromiseLike<FairOfflineRegistration>;
};

export function shouldWarmFairOffline(pathname: string, search: string): boolean {
  return search === "" && FAIR_OFFLINE_PATHS.has(pathname);
}

/**
 * Ask an active worker to warm the public Fair workspace. On a visitor's
 * first-ever install there is no active worker yet, so wait for the ready
 * registration and message the newly activated worker instead.
 */
export async function requestFairOfflineWarm(
  pathname: string,
  search: string,
  registration: FairOfflineRegistration,
  serviceWorkers: FairOfflineContainer,
): Promise<boolean> {
  if (!shouldWarmFairOffline(pathname, search)) return false;
  try {
    const worker = registration.active ?? (await serviceWorkers.ready).active;
    if (!worker) return false;
    worker.postMessage({ type: "CACHE_FAIR" });
    return true;
  } catch {
    return false;
  }
}

/**
 * "Later" means later, including after an in-app route change. The app shell
 * can remount this registrar while the same worker is still waiting; without
 * a short session-scoped snooze, every remount presents the same update again.
 */
export function shouldOfferUpdatePrompt(
  snoozedAt: number | null,
  presentedAt: number | null,
  now = Date.now(),
): boolean {
  const wasSnoozedRecently =
    snoozedAt !== null &&
    Number.isFinite(snoozedAt) &&
    now - snoozedAt < UPDATE_PROMPT_SNOOZE_MS;
  const wasPresentedRecently =
    presentedAt !== null &&
    Number.isFinite(presentedAt) &&
    now - presentedAt < UPDATE_PROMPT_SNOOZE_MS;
  return !wasSnoozedRecently && !wasPresentedRecently;
}

/**
 * Keep update controls reachable without covering the map's thumb controls.
 * The global toaster normally belongs above BottomNav; Map owns that same
 * lower shelf, so its update notice uses Sonner's supported top position.
 */
export function updatePromptPresentation(pathname: string, narrowViewport = false) {
  return {
    duration: UPDATE_PROMPT_DURATION_MS,
    position:
      pathname === "/map"
        ? "top-center"
        : narrowViewport
          ? "bottom-center"
          : "bottom-right",
  } as const;
}

/**
 * A fresh service-worker install can also fire `controllerchange`. Reloading
 * for that event steals whatever the visitor tapped or typed during the first
 * seconds of their first visit. Only an update the visitor explicitly accepted
 * is allowed to refresh the page, and it may do so once.
 */
export function shouldReloadForAcceptedUpdate(
  updateAccepted: boolean,
  alreadyReloaded: boolean,
): boolean {
  return updateAccepted && !alreadyReloaded;
}

/**
 * Registers the hand-rolled service worker, production only (a dev SW
 * just fights hot reload). Renders nothing.
 *
 * Two responsibilities:
 *
 *   1. Register `/sw.js` once on `load`. Failure is fire-and-forget —
 *      the worker is network-first for navigations, so a missing or
 *      stale registration can never degrade the live site.
 *
 *   2. When a *new* version of the worker installs while the user is
 *      still on the old one, surface a Sonner toast offering to
 *      refresh. Clicking the action posts `SKIP_WAITING` to the new
 *      worker; the resulting `controllerchange` event reloads the
 *      page so the user sees the latest build without losing where
 *      they were beyond a single tap. Without this, the new code
 *      would only take over after the user manually closed every
 *      tab — which is what was happening before A5.
 */
export default function ServiceWorkerRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Skip ONLY true local dev (registering on localhost fights HMR).
    // Gate on the runtime hostname, NOT `process.env.NODE_ENV`: the deploy
    // build inlined NODE_ENV as non-"production", so the old
    // `if (NODE_ENV !== "production") return` let the minifier dead-code-
    // eliminate this entire effect body — the SW never registered for real
    // users (no offline, no update toast, no install; verified on prod:
    // getRegistrations() was empty and no chunk referenced /sw.js).
    // `location.hostname` is read at runtime and can't be optimized away.
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return;
    }

    let toastId: string | number | undefined;
    let updateAccepted = false;
    let reloaded = false;
    let registration: ServiceWorkerRegistration | null = null;

    const snoozedAt = (): number | null => {
      try {
        const stored = window.sessionStorage.getItem(UPDATE_PROMPT_SNOOZE_KEY);
        if (!stored) return null;
        const value = Number(stored);
        return Number.isFinite(value) ? value : null;
      } catch {
        return null;
      }
    };

    const snoozeUpdatePrompt = () => {
      try {
        window.sessionStorage.setItem(
          UPDATE_PROMPT_SNOOZE_KEY,
          String(Date.now()),
        );
      } catch {
        // A blocked storage API should never block the update controls.
      }
    };

    const presentedAt = (): number | null => {
      try {
        const stored = window.sessionStorage.getItem(UPDATE_PROMPT_PRESENTED_KEY);
        if (!stored) return null;
        const value = Number(stored);
        return Number.isFinite(value) ? value : null;
      } catch {
        return null;
      }
    };

    const markUpdatePromptPresented = () => {
      try {
        window.sessionStorage.setItem(
          UPDATE_PROMPT_PRESENTED_KEY,
          String(Date.now()),
        );
      } catch {
        // A blocked storage API should never block the update controls.
      }
    };

    /**
     * Show the "Update available" toast for a specific waiting worker.
     * Remains long enough to act on without permanently occupying app chrome.
     * Another update dismisses the old notice before offering the new one.
     */
    const promptForUpdate = (waiting: ServiceWorker) => {
      if (!shouldOfferUpdatePrompt(snoozedAt(), presentedAt())) return;
      // Both an already-waiting registration and updatefound can describe the
      // same worker. Persist this before creating the toast so route changes
      // or a second registrar cannot surface duplicate notices.
      markUpdatePromptPresented();
      if (toastId !== undefined) {
        toast.dismiss(toastId);
      }
      toastId = toast("A new version is ready", {
        ...updatePromptPresentation(
          window.location.pathname,
          window.matchMedia("(max-width: 639px)").matches,
        ),
        description: "Refresh to see the latest.",
        action: {
          label: "Refresh",
          onClick: () => {
            updateAccepted = true;
            waiting.postMessage({ type: "SKIP_WAITING" });
          },
        },
        // Keep both choices explicit for keyboard and screen-reader users.
        // "Later" dismisses this waiting worker across route changes, then
        // offers it again after the short session-scoped snooze expires.
        cancel: {
          label: "Later",
          onClick: snoozeUpdatePrompt,
        },
      });
    };

    /**
     * Wire up a registration: if there's already a waiting worker
     * (e.g. a returning user who got the new SW on a previous visit
     * but never activated it), prompt immediately. Otherwise listen
     * for the next install.
     */
    const wire = (reg: ServiceWorkerRegistration) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        promptForUpdate(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // "installed" + an existing controller = a true update,
          // not a fresh first install (which has no controller yet).
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            promptForUpdate(installing);
          }
        });
      });
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(wire)
        .catch(() => {
          // Registration failures are non-fatal — the app works fine
          // without the SW; we just lose offline + the update toast.
        });
    };
    // Register after first paint without racing the `load` event: if the
    // page already finished loading (the effect can run after `load` has
    // fired, especially on a fast cache hit), register immediately;
    // otherwise wait for `load`. The old code only ever added the listener,
    // so a load that had already fired meant onLoad never ran.
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad);
    }

    // Re-check for a new service worker whenever the user returns to the
    // app. The browser only looks for an updated /sw.js on a fresh
    // navigation, so an INSTALLED PWA (or a long-lived tab) can sit for
    // hours on the old build — the "new version ready" toast never fires
    // because the browser never noticed the deploy. Calling reg.update()
    // on focus/visibility forces that check on every return, so a deploy
    // surfaces within a tap of reopening the app. Errors are ignored:
    // a failed update check just means we try again next time.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);

    // A controller can change for two different reasons: a fresh first install
    // or an accepted update. The first must stay invisible because reloading
    // there can erase the visitor's first action. An accepted update still
    // reloads once so the new build takes over immediately.
    const onControllerChange = () => {
      if (!shouldReloadForAcceptedUpdate(updateAccepted, reloaded)) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      if (toastId !== undefined) toast.dismiss(toastId);
    };
  }, []);

  // The global registrar survives App Router navigation. Run this separately
  // from registration so entering Fair from elsewhere in Radius still warms
  // the offline workspace; a direct first visit waits for the first worker to
  // become ready through the same path.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return;
    }
    if (!shouldWarmFairOffline(pathname, window.location.search)) return;

    void navigator.serviceWorker.ready
      .then((registration) =>
        requestFairOfflineWarm(
          pathname,
          window.location.search,
          registration,
          navigator.serviceWorker,
        ),
      )
      .catch(() => {});
  }, [pathname]);

  return null;
}

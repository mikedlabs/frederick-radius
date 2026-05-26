"use client";

import { useEffect } from "react";
import { toast } from "sonner";

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
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let toastId: string | number | undefined;
    let reloaded = false;

    /**
     * Show the "Update available" toast for a specific waiting worker.
     * Persistent until the user acts on it (or another update lands,
     * in which case we dismiss the old one first).
     */
    const promptForUpdate = (waiting: ServiceWorker) => {
      if (toastId !== undefined) {
        toast.dismiss(toastId);
      }
      toastId = toast("A new version is ready", {
        description: "Refresh to see the latest.",
        action: {
          label: "Refresh",
          onClick: () => {
            waiting.postMessage({ type: "SKIP_WAITING" });
          },
        },
        duration: Infinity,
      });
    };

    /**
     * Wire up a registration: if there's already a waiting worker
     * (e.g. a returning user who got the new SW on a previous visit
     * but never activated it), prompt immediately. Otherwise listen
     * for the next install.
     */
    const wire = (reg: ServiceWorkerRegistration) => {
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
    window.addEventListener("load", onLoad);

    // When the user accepts the prompt, the new SW activates and
    // fires `controllerchange`. Reload once so they're served by the
    // new worker immediately. Guarded so a rapid second event (rare
    // but possible) doesn't trigger a refresh loop.
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      if (toastId !== undefined) toast.dismiss(toastId);
    };
  }, []);
  return null;
}

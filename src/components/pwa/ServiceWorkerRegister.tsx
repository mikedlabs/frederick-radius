"use client";

import { useEffect } from "react";

/**
 * Registers the hand-rolled service worker, production only (a dev SW
 * just fights hot reload). Renders nothing. Registration is fire and
 * forget; the worker itself is network-first so a failed or stale
 * registration can never degrade the live site.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}

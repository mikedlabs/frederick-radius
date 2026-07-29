"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSavedList } from "@/hooks/useSaved";
import {
  OFFLINE_PREFERENCES_CHANGE_EVENT,
  persistOfflineDeviceSnapshot,
} from "@/lib/offline-snapshot";
import { SCOPE_CHANGE_EVENT } from "@/lib/scope";

/**
 * Mirrors a deliberately tiny device summary into IndexedDB after a successful
 * online app render. It never copies exact location, recent activity, notes,
 * account data, tokens, or the saved ids themselves.
 */
export default function OfflineSnapshotSync() {
  const pathname = usePathname();
  const saved = useSavedList();

  useEffect(() => {
    const sync = () => {
      if (navigator.onLine === false) return;
      try {
        void persistOfflineDeviceSnapshot(saved, window.localStorage).catch(() => {});
      } catch {
        // IndexedDB/localStorage may be unavailable in private or locked-down
        // browser contexts. The normal online app remains fully usable.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(SCOPE_CHANGE_EVENT, sync);
    window.addEventListener(OFFLINE_PREFERENCES_CHANGE_EVENT, sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(SCOPE_CHANGE_EVENT, sync);
      window.removeEventListener(OFFLINE_PREFERENCES_CHANGE_EVENT, sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, saved]);

  return null;
}

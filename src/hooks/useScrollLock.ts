import { useEffect } from "react";
import { acquireScrollLock } from "@/lib/scroll-lock";

/**
 * Hold the page scroll lock while `active`. Every overlay shares the counted
 * lock in lib/scroll-lock, so stacked overlays close in any order. Code that
 * locks outside React's effect lifecycle calls `acquireScrollLock()` directly.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireScrollLock();
  }, [active]);
}

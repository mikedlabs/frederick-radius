import { useLayoutEffect } from "react";
import { acquireScrollLock } from "@/lib/scroll-lock";

/**
 * Hold the page scroll lock while `active`. Every overlay shares the counted
 * lock in lib/scroll-lock, so stacked overlays close in any order. Code that
 * locks outside React's effect lifecycle calls `acquireScrollLock()` directly.
 *
 * A layout effect applies the lock in the same commit that opens the overlay,
 * so the page never paints or takes a scroll with the overlay open and the
 * page still scrollable. React 19 runs no layout effects on the server and no
 * longer warns about them there, and the lock only touches the DOM in the
 * effect body.
 */
export function useScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    return acquireScrollLock();
  }, [active]);
}

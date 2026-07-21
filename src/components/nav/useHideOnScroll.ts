"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Auto-hide on scroll: chrome slides out of view when the user scrolls down
 * past a threshold and slides back the instant they scroll up — the iOS /
 * Mobile-Safari standard. Extracted from TopBar so the top bar and the bottom
 * nav breathe TOGETHER: one scroll signal, both bars answering it, instead of
 * two bars with different ideas about when to hide.
 *
 * Always pinned near the top of the document (no flicker at top of page) and
 * while `disabled` (e.g. the search overlay is open).
 */
export function useHideOnScroll(disabled: boolean) {
  // Track only what scroll position says; the disabled override is applied at
  // render time below so we don't cascade a setState from an effect when
  // `disabled` flips.
  const [scrollHidden, setScrollHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        if (y < 80) setScrollHidden(false);
        else if (dy > 6) setScrollHidden(true);
        else if (dy < -4) setScrollHidden(false);
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return disabled ? false : scrollHidden;
}

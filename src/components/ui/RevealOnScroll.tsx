"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals its children with a gentle rise + fade as they scroll into
 * view — the editorial "printed guide unfolding" feel for below-the-fold
 * sections on /today.
 *
 * No flash-of-hidden-content: children render VISIBLE by default, so
 * SSR, no-JS, crawlers, and anything already in view on load all show
 * immediately. Only after hydration, and only for sections that are
 * still BELOW the fold (the user can't see them yet), do we prime them
 * hidden and then reveal on scroll. Reduced-motion users never get the
 * transform. Fails open if IntersectionObserver is unavailable.
 */
export default function RevealOnScroll({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [primed, setPrimed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Already on screen at mount → leave it; don't animate (avoids a
    // pointless flash for above-the-fold content).
    const rect = el.getBoundingClientRect();
    const belowFold = rect.top > window.innerHeight * 0.92;
    if (!belowFold) return;
    // Below the fold and off-screen — safe to prime hidden without the
    // user seeing the hide.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- priming happens off-screen (below the fold) so it's never a visible flash; this is the no-FOUC scroll-reveal pattern
    setPrimed(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPrimed(false);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={primed ? "primed" : "in"}
      className={`reveal-on-scroll ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

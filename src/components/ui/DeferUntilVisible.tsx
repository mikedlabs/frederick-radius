"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders `placeholder` until the element scrolls near the viewport, then
 * swaps in `children`. Use it to wrap heavy, below-the-fold widgets — the
 * Mapbox mini-map especially — so their JS chunk (mapbox-gl is ~200KB+)
 * only downloads when the user actually scrolls to them. That keeps the
 * initial render of common pages (place detail, town pages) snappy: the
 * map no longer competes for the main thread on first paint.
 *
 * Fails open: if IntersectionObserver is unavailable, it renders the real
 * children immediately, so nothing is ever hidden from a browser that
 * can't observe visibility (or from crawlers).
 */
export default function DeferUntilVisible({
  children,
  placeholder = null,
  /** Start loading a bit before the element enters view so it's ready by
   *  the time the user reaches it. */
  rootMargin = "250px",
  minHeight,
}: {
  children: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
  minHeight?: number | string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} style={minHeight != null ? { minHeight } : undefined}>
      {visible ? children : placeholder}
    </div>
  );
}

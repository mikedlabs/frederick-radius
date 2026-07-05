"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * CondensingHeader — a sticky header that reports when the reader has
 * scrolled past its resting position, so it can swap a tall "expanded" view
 * for a compact pinned strip. This is the shared behavior behind the /pulse
 * masthead and the /today sky hero (which condense on scroll while keeping
 * the day's anchor in view).
 *
 * Behavior only, no baked-in look: a 1px sentinel above the sticky container
 * is watched with an IntersectionObserver (cheap — no scroll listener), and
 * the condensed state is handed to a render-prop child AND mirrored onto the
 * sticky wrapper as `data-state="expanded" | "condensed"` for CSS hooks. The
 * consumer owns the transition (height, crossfade), so each page keeps its
 * own materials — and can use `motion-reduce:` / `data-state` selectors to
 * honor prefers-reduced-motion however it likes.
 *
 * `top` is the sticky offset (e.g. the app top-bar height); `offset` shifts
 * the trigger point earlier via the observer's root margin.
 */
export default function CondensingHeader({
  children,
  top = "0px",
  offset = 0,
  className = "",
  style,
}: {
  /** Render-prop: receives whether the header is currently condensed. */
  children: (state: { condensed: boolean }) => ReactNode;
  /** CSS length for `position: sticky; top:` (e.g. "var(--app-topbar-h)"). */
  top?: string;
  /** Extra pixels to scroll before condensing. */
  offset?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting),
      { threshold: 0, rootMargin: `${-Math.max(0, offset)}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [offset]);

  return (
    <>
      {/* Resting-position marker. When it scrolls out the top, we condense. */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
      <div
        data-state={condensed ? "condensed" : "expanded"}
        className={className}
        style={{ position: "sticky", top, zIndex: 20, ...style }}
      >
        {children({ condensed })}
      </div>
    </>
  );
}

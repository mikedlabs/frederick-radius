"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * CountUp — animates a number from 0 to `value` once on mount, so the beta
 * cover's live stats read as the county "powering on" instead of a static
 * figure. Eases out over ~0.9s. Honors prefers-reduced-motion (and SSR): the
 * first paint shows 0, then it animates client-side; reduced-motion users jump
 * straight to the final value. Formatting matches the rest of the page
 * (en-US thousands separators, tabular figures via the caller's class).
 */
export default function CountUp({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [n, setN] = useState(0);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount sync to the final value when motion is off; no animation loop
      setN(value);
      return;
    }
    const dur = 900;
    let start: number | null = null;
    let raf = 0;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={className} style={style}>
      {n.toLocaleString("en-US")}
    </span>
  );
}

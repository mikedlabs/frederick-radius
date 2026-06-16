"use client";

import { useEffect, useState } from "react";

/**
 * LiveClock — the current Eastern time, ticking. Tiny client island for the
 * SkyHero header so the page's date/time lives in the header itself. The page
 * is force-dynamic so the SSR value is already request-time; the tick keeps it
 * current. suppressHydrationWarning covers seconds-level SSR/hydration drift.
 */
export default function LiveClock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return (
    <span className={className} style={style} suppressHydrationWarning>
      {time}
    </span>
  );
}

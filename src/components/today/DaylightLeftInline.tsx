"use client";

import { useEffect, useState } from "react";
import { sunTimes } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * "· Xh Ym of daylight left" — appended to the weather header (TodayCard).
 *
 * Client-side + minute-ticking on purpose: daylight-left is minute-precision,
 * so rendering it in the SERVER weather card would freeze it at the cached
 * render time. Computes from the live clock, shows only during the day and
 * only when >= 20 min of light remain (else nothing). Moved here from
 * TodayContext, which used to print a duplicate "Sunset 8:40 PM" alongside it.
 */
export default function DaylightLeftInline() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount client clock; SSR can't compute minute-precision daylight without a hydration mismatch
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const sun = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  if (!(sun.sunrise && sun.sunset && now >= sun.sunrise && now < sun.sunset)) return null;
  const mins = Math.round((sun.sunset.getTime() - now.getTime()) / 60_000);
  if (mins < 20) return null;
  const left = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return (
    <span suppressHydrationWarning>
      {"  ·  "}
      {left} of daylight left
    </span>
  );
}

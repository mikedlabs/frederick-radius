"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";

/**
 * PersonalGreetingLine — a soft headline that sits between the date
 * eyebrow and the main weather-aware greeting on Today.
 *
 *   Friday · 6:21 PM
 *   Evening in Brunswick.        ← THIS line
 *   Golden hour. Window seat or rooftop?
 *
 * Premium tier of the personalization story: instead of just hinting
 * with a chip that the app knows where you are, the app SAYS it as
 * its own line. The greeting becomes the user's neighborhood, not
 * the generic "Frederick".
 *
 * Renders nothing when no home muni is set, so first-time visitors
 * keep the existing two-line header (eyebrow + main headline). The
 * Eastern hour is read at mount + the muni slug from localStorage,
 * both via useSyncExternalStore for SSR-safety (no hydration flash).
 */

const subscribeNoop = () => () => {};

/**
 * "morning" / "afternoon" / "evening" / "night" — same buckets the
 * AdaptiveGreeting copy uses so the two lines never disagree about
 * what time of day it is. Returns null on the server snapshot so
 * SSR renders nothing; the client picks the bucket post-hydrate.
 */
function getEasternBand(): "morning" | "afternoon" | "evening" | "night" | null {
  if (typeof window === "undefined") return null;
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const BAND_LABEL: Record<Exclude<ReturnType<typeof getEasternBand>, null>, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Tonight",
};

export default function PersonalGreetingLine() {
  const muniSlug = useSyncExternalStore(
    subscribeNoop,
    () => getHomeMuni(),
    () => null,
  );
  const band = useSyncExternalStore(subscribeNoop, getEasternBand, () => null);

  if (!muniSlug || !band) return null;
  const muni = MUNICIPALITY_BY_SLUG[muniSlug];
  if (!muni) return null;

  return (
    <Link
      href={`/m/${muni.slug}`}
      className="block text-[15px] font-medium leading-snug tracking-tight transition active:scale-[0.99] sm:text-[17px]"
      style={{
        color: "currentColor",
        opacity: 0.78,
      }}
      aria-label={`${BAND_LABEL[band]} in ${muni.name}. Open the town page.`}
    >
      {BAND_LABEL[band]} in {muni.name}.
    </Link>
  );
}

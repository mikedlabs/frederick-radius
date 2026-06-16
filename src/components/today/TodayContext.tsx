"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun } from "lucide-react";
import { nextSunHint } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getHomeMuni } from "@/lib/personalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * TodayContext — a slim, self-hiding line under the SkyHero: a personal
 * salutation when a home town is set ("Evening in Brunswick.") and the
 * golden-hour cue when the light window is open. The date/time itself now
 * lives in the hero header; this carries only the contextual extras, and
 * renders nothing when there's neither (so the page stays calm). No divider.
 *
 * Client + live (golden-hour window ticks); personalization reads localStorage
 * post-mount only, so no SSR/hydration mismatch.
 */
export default function TodayContext() {
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag so the client-only salutation + golden-hour cue render post-hydration (no SSR/localStorage mismatch)
    setMounted(true);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const homeSlug = mounted ? getHomeMuni() : null;
  const homeMuni = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;
  const hour24 = mounted ? Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(now)) : 0;
  const greet = hour24 < 12 ? "Morning" : hour24 < 17 ? "Afternoon" : hour24 < 21 ? "Evening" : "Late night";

  const hint = mounted ? nextSunHint(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng) : null;
  let golden: string | null = null;
  if (hint) {
    const clock = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d);
    if (now >= hint.from && hint.to) {
      golden = `Golden hour now · best light until ${clock(hint.to)}`;
    } else {
      const mins = Math.max(1, Math.round((hint.from.getTime() - now.getTime()) / 60_000));
      golden = `Golden hour ${clock(hint.from)} · in ${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}`;
    }
  }

  if (!homeMuni && !golden) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug" suppressHydrationWarning>
      {homeMuni && (
        <span style={{ color: "var(--app-ink-3)" }}>
          {greet} in{" "}
          <Link href={`/m/${homeMuni.slug}`} className="font-semibold" style={{ color: "var(--app-brand)" }}>
            {homeMuni.name}
          </Link>
          .
        </span>
      )}
      {homeMuni && golden && <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>}
      {golden && (
        <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--app-accent)" }}>
          <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {golden}
        </span>
      )}
    </p>
  );
}

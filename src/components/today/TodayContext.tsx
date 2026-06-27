"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun } from "lucide-react";
import { nextSunHint, sunTimes } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getHomeMuni } from "@/lib/personalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { isEventToday } from "@/lib/eventWhenLabel";
import type { GoldenHourEvent } from "@/lib/events/golden-pairing";

/** Word-boundary truncation so a long event name never cuts mid-word. */
function clampTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max).lastIndexOf(" ");
  return `${(cut > 8 ? s.slice(0, cut) : s.slice(0, max)).trimEnd()}…`;
}

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
export default function TodayContext({ goldenEvent }: { goldenEvent?: GoldenHourEvent | null }) {
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

  const clock = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d);
  const hint = mounted ? nextSunHint(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng) : null;
  let golden: string | null = null;
  if (hint) {
    if (now >= hint.from && hint.to) {
      golden = `Golden hour now · best light until ${clock(hint.to)}`;
    } else {
      const mins = Math.max(1, Math.round((hint.from.getTime() - now.getTime()) / 60_000));
      golden = `Golden hour ${clock(hint.from)} · in ${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}`;
    }
  }

  // Daylight-left cue — shown only when the golden-hour line ISN'T (so the two
  // never stack): during daylight, name sunset + how much light is left. It
  // gives the all-day "should I head out now?" read that golden hour only
  // answers near dusk. Hidden once the sun is down (nothing to promise).
  let daylight: string | null = null;
  if (mounted && !golden) {
    const sun = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
    if (sun.sunrise && sun.sunset && now >= sun.sunrise && now < sun.sunset) {
      const mins = Math.round((sun.sunset.getTime() - now.getTime()) / 60_000);
      if (mins >= 20) {
        const left = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
        daylight = `Sunset ${clock(sun.sunset)} · ${left} of daylight left`;
      }
    }
  }

  // Pair the live light window with an outdoor draw — shown ONLY while golden
  // hour is ACTIVE (now past golden start), and re-validated against the LIVE
  // client clock so the cue and the event never disagree on tense. An event
  // that's on now reads "on now: X"; one starting imminently in the window
  // reads with its time. Never shown beside the upcoming ("in 1h") cue.
  let goldenEventClause: { label: string; slug: string } | null = null;
  if (mounted && hint && goldenEvent && now >= hint.from) {
    const startMs = Date.parse(goldenEvent.starts_at);
    const sunsetMs = hint.to ? hint.to.getTime() : 0;
    if (!Number.isNaN(startMs) && isEventToday(goldenEvent.starts_at, now) && startMs <= sunsetMs) {
      const nowMs = now.getTime();
      const endMs = Date.parse(goldenEvent.ends_at);
      const onNow =
        startMs <= nowMs &&
        (goldenEvent.isAllDay || (!Number.isNaN(endMs) && endMs > nowMs) || nowMs - startMs <= 3 * 60 * 60_000);
      const title = clampTitle(goldenEvent.title, 34);
      if (onNow) {
        goldenEventClause = { label: `on now: ${title}`, slug: goldenEvent.slug };
      } else if (startMs > nowMs) {
        const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(startMs));
        goldenEventClause = { label: `${time} ${title}`, slug: goldenEvent.slug };
      }
    }
  }

  // One "sun line": the golden-hour cue near dusk, otherwise the daylight-left
  // read during the day. Never both (daylight is computed only when !golden).
  const sunLine = golden ?? daylight;

  if (!homeMuni && !sunLine) return null;

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
      {homeMuni && sunLine && <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>}
      {sunLine && (
        <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--app-ink-2)" }}>
          <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-accent)" }} />
          {sunLine}
        </span>
      )}
      {goldenEventClause && (
        <>
          <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
          <Link href={`/events/${goldenEventClause.slug}`} className="font-medium" style={{ color: "var(--app-brand)" }}>
            {goldenEventClause.label}
          </Link>
        </>
      )}
    </p>
  );
}

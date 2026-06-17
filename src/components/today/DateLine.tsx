"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun } from "lucide-react";
import DecorativeDivider from "@/components/ui/DecorativeDivider";
import { nextSunHint } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getHomeMuni } from "@/lib/personalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * DateLine — the almanac MASTHEAD under the SkyHero: the page's publication
 * identity before the first answer.
 *
 *   - Row 1: weekday (serif Newsreader) + date (caps) | live clock (mono).
 *   - Row 2 (quiet, self-composing): a personal salutation when a home town
 *     is set ("Evening in Brunswick.", folding in the old HomeMuniChip), and
 *     a golden-hour cue when the light window is open ("Golden hour now ·
 *     best light until 8:27"). Renders nothing when neither applies.
 *   - Closed by one Catoctin-contour divider.
 *
 * Client + live: ticks on a real clock so the time + golden-hour window are
 * the actual current moment. Personalization + the sun cue render only after
 * mount (no SSR/localStorage mismatch); the weekday/date/time are request-time
 * (the page is force-dynamic) with suppressHydrationWarning for seconds drift.
 */
export default function DateLine() {
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag so the client-only salutation + golden-hour cue render post-hydration (no SSR/localStorage mismatch)
    setMounted(true);
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts }).format(now);
  const weekday = part({ weekday: "long" });
  const date = part({ month: "long", day: "numeric" });
  const time = part({ hour: "numeric", minute: "2-digit" });
  const hour24 = Number(part({ hour: "numeric", hour12: false }));

  // Personal salutation — only when a home town is set (the personalization
  // payoff, folding in the retired HomeMuniChip). Read post-mount only.
  const homeSlug = mounted ? getHomeMuni() : null;
  const homeMuni = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;
  const greet = hour24 < 12 ? "Morning" : hour24 < 17 ? "Afternoon" : hour24 < 21 ? "Evening" : "Late night";

  // Golden-hour cue — self-hiding (afternoon -> sunset only).
  const hint = mounted ? nextSunHint(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng) : null;
  let golden: string | null = null;
  if (hint) {
    const clock = (d: Date) =>
      new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d);
    if (now >= hint.from && hint.to) {
      golden = `Golden hour now · best light until ${clock(hint.to)}`;
    } else {
      const mins = Math.max(1, Math.round((hint.from.getTime() - now.getTime()) / 60_000));
      const inLabel = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
      golden = `Golden hour ${clock(hint.from)} · in ${inLabel}`;
    }
  }

  const hasRow2 = Boolean(homeMuni || golden);

  return (
    <div>
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className="font-serif text-[26px] font-semibold leading-none tracking-tight sm:text-[30px]"
            style={{ color: "var(--app-ink)" }}
            suppressHydrationWarning
          >
            {weekday}
          </p>
          <p
            className="mt-1 text-meta font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--app-ink-3)" }}
            suppressHydrationWarning
          >
            {date}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden className="live-dot inline-block" style={{ color: "var(--app-brand)" }} />
          <span
            className="font-mono text-[14px] font-semibold tabular-nums sm:text-[15px]"
            style={{ color: "var(--app-ink-2)" }}
            suppressHydrationWarning
          >
            {time}
          </span>
        </div>
      </header>

      {hasRow2 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug" suppressHydrationWarning>
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
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--app-ink-2)" }}>
              <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-accent)" }} />
              {golden}
            </span>
          )}
        </p>
      )}

      <DecorativeDivider variant="wave" className="mt-2 opacity-80" />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import HomeMuniChip from "./HomeMuniChip";

/**
 * DateLine — the temporal anchor above the SkyHero.
 *
 * Client + live: it ticks on a real clock, so the weekday, date, and time
 * are always the actual current moment (and the pulse dot is honest) —
 * never a build-time or cache-frozen value. /today also renders fresh
 * (force-dynamic), so the SSR pass already shows request-time; the tick
 * keeps it current after load. suppressHydrationWarning covers the
 * unavoidable seconds-level drift between the server render and hydration.
 *
 *   - Weekday: big serif (Newsreader) — anchors the page in time.
 *   - Date: small caps under the weekday — calendar fact.
 *   - Time: monospace + live pulse dot on the right — "right now".
 */
export default function DateLine({ asHeading = false }: { asHeading?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick the clock so the time stays live after load. The initial value
    // is already request-time (the page is force-dynamic), so no immediate
    // set is needed — the interval keeps it current.
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts }).format(now);
  const weekday = part({ weekday: "long" });
  const date = part({ month: "long", day: "numeric" });
  const time = part({ hour: "numeric", minute: "2-digit" });

  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {/* The weekday is the page's heading on the root Today surface
            (asHeading): a real <h1> the page was missing after the Ask
            front door retired in Session 1. Off the root it stays a
            styled <p> so other mounts don't introduce a second <h1>. */}
        {asHeading ? (
          <h1
            className="font-serif text-[26px] font-semibold leading-none tracking-tight sm:text-[30px]"
            style={{ color: "var(--app-ink)" }}
            suppressHydrationWarning
          >
            {weekday}
          </h1>
        ) : (
          <p
            className="font-serif text-[26px] font-semibold leading-none tracking-tight sm:text-[30px]"
            style={{ color: "var(--app-ink)" }}
            suppressHydrationWarning
          >
            {weekday}
          </p>
        )}
        <p
          className="mt-1 text-meta font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-3)" }}
          suppressHydrationWarning
        >
          {date}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          aria-hidden
          className="live-dot inline-block"
          style={{ color: "var(--app-brand)" }}
        />
        <span
          className="font-mono text-[14px] font-semibold tabular-nums sm:text-[15px]"
          style={{ color: "var(--app-ink-2)" }}
          suppressHydrationWarning
        >
          {time}
        </span>
        <HomeMuniChip />
      </div>
    </header>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * ForecastCard — collapsible disclosure for the hourly + 7-day weather
 * cards on /now. Default closed; remember the user's choice across
 * visits via localStorage.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────────────┐
 *   │  FORECAST       summary peek          ⌄ │   ← closed: tiny pill
 *   └──────────────────────────────────────────┘
 *
 *   ┌──────────────────────────────────────────┐
 *   │  FORECAST       summary peek          ⌃ │
 *   ├──────────────────────────────────────────┤
 *   │  HourlyForecast (server child)          │   ← expanded:
 *   │  WeeklyForecast (server child)          │      stacked cards
 *   └──────────────────────────────────────────┘
 *
 * The trigger is the only thing on /now until the user taps in.
 * Children are passed in (as server components from the page) so the
 * data fetch + render happens on the server even when collapsed —
 * the markup is already in the HTML, just hidden via CSS. Cheap to
 * reveal because no client-side data fetch fires on expand; the
 * trade is a ~1 KB HTML bump on first paint, paid for by a snappy
 * expand and zero spinner.
 *
 * `summary` is also a server-rendered ReactNode (typically the
 * ForecastSummary component) so the peek line is computed once on
 * the server and slotted into the trigger.
 */

const KEY = "fr:forecast-expanded:v1";

export default function ForecastCard({
  summary,
  children,
}: {
  /** One-line peek rendered next to "FORECAST" in the trigger. */
  summary: ReactNode;
  /** Hourly + weekly cards to reveal on expand. */
  children: ReactNode;
}) {
  // Default closed so /now reads as compact on first paint. The
  // useEffect below restores the user's preference after mount, so a
  // returning user who left it open sees it open again.
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate preference after mount; localStorage isn't readable during SSR
      if (stored === "true") setExpanded(true);
    } catch {
      // localStorage may be unavailable; ignore.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag for the SSR hydration guard
    setMounted(true);
  }, []);

  const toggle = () => {
    setExpanded((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <article
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={mounted ? expanded : false}
        aria-controls="forecast-content"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.998]"
      >
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          Forecast
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {summary}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-200"
          strokeWidth={2}
          style={{
            color: "var(--app-ink-3)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden
        />
      </button>
      <div
        id="forecast-content"
        className="space-y-3 border-t px-3 pb-3 pt-3"
        style={{
          borderColor: "var(--app-border)",
          display: expanded ? "block" : "none",
        }}
      >
        {children}
      </div>
    </article>
  );
}

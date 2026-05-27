"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * HourlyDisclosure — disclosure wrapper around the HourlyForecast
 * rail. Matches the WeatherMore + WeeklyCard pattern so the three
 * weather sub-sections (Hourly · 7-Day · More Details) all read as
 * uniform collapsible pills inside the consolidated weather panel.
 *
 * Default OPEN (unlike WeatherMore which defaults closed). The
 * hourly rail is the most-glanced piece of the panel — closing it
 * by default would hide the answer to "is it going to rain in the
 * next 4 hours" behind a tap. The user's choice is remembered
 * across visits via localStorage so a power user who hates hourly
 * can shut it once and keep it shut.
 *
 * Children (the HourlyForecast server component) render server-side
 * regardless of expanded state; toggling only hides the content via
 * display:none. No client-side fetch on expand.
 */

const KEY = "fr:wx-hourly-expanded:v1";

export default function HourlyDisclosure({
  summary,
  children,
}: {
  /** Short summary shown in the collapsed pill — e.g. "12 hours, peaks 80° at 7 PM". */
  summary?: ReactNode;
  children: ReactNode;
}) {
  // Defaults open. Hydration-safe: SSR renders open; the effect
  // pulls the user's stored preference and closes if they'd shut it.
  const [expanded, setExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "false") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate user preference from localStorage after mount
        setExpanded(false);
      }
    } catch {
      // ignore — localStorage may be unavailable
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag for the SSR hydration guard
    setMounted(true);
  }, []);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(KEY, next ? "true" : "false");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={mounted ? expanded : true}
        aria-controls="hourly-forecast-panel"
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition active:scale-[0.99]"
      >
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Hourly forecast
        </span>
        {summary && (
          <span
            className="min-w-0 flex-1 truncate text-[12px]"
            style={{ color: "var(--app-ink-2)" }}
          >
            {summary}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 transition-transform"
          strokeWidth={2.25}
          style={{
            color: "var(--app-ink-3)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      <div
        id="hourly-forecast-panel"
        hidden={!expanded}
        // Keep markup in the DOM so the inner HourlyForecast doesn't
        // re-mount and re-fetch on each toggle; just toggle visibility.
        style={{ display: expanded ? "block" : "none" }}
      >
        {children}
      </div>
    </div>
  );
}

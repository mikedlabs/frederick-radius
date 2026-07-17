"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * WeeklyCard — collapsible wrapper around the 7-day forecast.
 *
 * Default closed; the user's choice is remembered across visits via
 * localStorage (`fr:wx-week-expanded:v1`). The header always shows
 * an inline summary ("60° to 84° · 2 days of rain") so a reader can
 * decide whether to expand without opening it.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ 7-DAY FORECAST   60° to 84° · 2 rainy ⌄ │   ← closed
 *   └──────────────────────────────────────────┘
 *
 *   ┌──────────────────────────────────────────┐
 *   │ 7-DAY FORECAST   60° to 84° · 2 rainy ⌃ │
 *   ├──────────────────────────────────────────┤
 *   │ Today  ☼  60° ──●──── 80°                │
 *   │ Sun    ☼  62° ──── 78°                   │
 *   │ …                                        │
 *   └──────────────────────────────────────────┘
 *
 * The child (WeeklyForecast, a server component) renders into the
 * page HTML server-side regardless of expanded state — toggle is just
 * `display: none` on the body, so opening is instant with no spinner
 * and no client-side data fetch. Trade-off is ~1 KB extra HTML on
 * first paint, paid for by snappy reveal.
 */

const KEY = "fr:wx-week-expanded:v1";

export default function WeeklyCard({
  summary,
  children,
}: {
  /** The 1-line peek (typically <WeeklySummary />). */
  summary: ReactNode;
  /** The full 7-day card body (typically <WeeklyForecast />). */
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate user preference after mount; localStorage isn't readable during SSR
      if (stored === "true") setExpanded(true);
    } catch {
      // ignore — localStorage may be unavailable
    }
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
    // No self-chrome: this is a ROW inside the unified weather panel
    // (the parent supplies the single border + dividers). Standalone
    // border/rounding/shadow made the dropdowns read as disconnected
    // floating cards.
    <article>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={mounted ? expanded : false}
        aria-controls="weekly-content"
        className="min-h-11 flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.998]"
      >
        <span
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          7-day forecast
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
        id="weekly-content"
        className="border-t px-3 pb-3 pt-3"
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

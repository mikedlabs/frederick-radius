"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * WeatherMore — disclosure wrapper around the iOS-style 2-up grid of
 * secondary weather cards (Sun arc, Wind, Humidity, Feels Like,
 * Pressure, Visibility, Moon, Daylight).
 *
 * Default closed; the user's choice is remembered across visits via
 * localStorage (`fr:wx-more-expanded:v1`). Closed state is a single
 * pill: "More weather details · 7 cards ⌄". Open state reveals the
 * full grid.
 *
 * Children (the WeatherMoreGrid server component) render server-side
 * regardless of expanded state — the markup is in the page HTML,
 * toggle is just `display: none`. No spinner on expand, no client-
 * side fetch. Trade is a small HTML bump on first paint.
 */

const KEY = "fr:wx-more-expanded:v1";

export default function WeatherMore({ children }: { children: ReactNode }) {
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
    // Row inside the unified weather panel — no self-chrome (parent
    // supplies the single border + dividers).
    <article>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={mounted ? expanded : false}
        aria-controls="wx-more-content"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.998]"
      >
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          More weather details
        </span>
        {/* Collapsed summary — was the full list "Sun · Wind ·
            Humidity · Pressure · Visibility · Moon" which truncated
            to "...Pres..." on narrow viewports, reading as broken.
            Shortened to "7 cards" so the pill stays informative
            without ever clipping. The detail cards themselves load
            on expand. */}
        <span
          className="min-w-0 flex-1 text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Sun, wind, humidity, and more
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
        id="wx-more-content"
        className="border-t p-3"
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

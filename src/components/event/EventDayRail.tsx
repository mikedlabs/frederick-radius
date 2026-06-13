"use client";

import { useEffect, useRef, useState } from "react";

/**
 * EventDayRail — the pinned date rail for the P3 agenda (handoff
 * pattern P3). A horizontal row of day chips above the one event list;
 * tapping a day scrolls its group into view, and scrolling the list
 * moves the rail's active state (IntersectionObserver, the clean
 * equivalent of the reference's offsetTop+70 heuristic).
 *
 * It is a tiny client island ON PURPOSE: it receives only day metadata
 * (key, label, weekday, count) — never the event objects. The events
 * render server-side in the day groups (id="day-<key>"), so the event
 * array never crosses into the client bundle. That split is the whole
 * reason /events drops back under its payload budget.
 *
 * Counts come from the same filtered array that renders the cards, so a
 * rail number can't drift from its group.
 */
export type RailDay = {
  key: string;
  weekday: string;
  /** Day-of-month numeral. */
  dayNum: string;
  count: number;
  /** True for today's group — the rail labels it "Tonight". */
  isToday: boolean;
};

export default function EventDayRail({ days }: { days: RailDay[] }) {
  const [active, setActive] = useState(days[0]?.key ?? "");
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const groups = days
      .map((d) => document.getElementById(`day-${d.key}`))
      .filter((el): el is HTMLElement => el !== null);
    if (groups.length === 0) return;

    // Activate the group nearest the top of the viewport (a 96px offset
    // clears the sticky header + rail). Mirrors the reference's
    // "last group above scrollTop + threshold" with an observer.
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top?.target.id) setActive(top.target.id.replace("day-", ""));
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );
    groups.forEach((g) => io.observe(g));
    return () => io.disconnect();
  }, [days]);

  function jump(key: string) {
    const el = document.getElementById(`day-${key}`);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: y, behavior: "smooth" });
    setActive(key);
  }

  // Keep the active chip in view within the rail.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const chip = rail.querySelector<HTMLElement>(`[data-day="${active}"]`);
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <nav
      ref={railRef}
      aria-label="Jump to a day"
      className="shelf-rail sticky top-[var(--app-header-h,56px)] z-20 -mx-4 gap-1.5 px-4 py-2"
      style={{ background: "color-mix(in srgb, var(--app-bg) 88%, transparent)", backdropFilter: "blur(8px)" }}
    >
      {days.map((d) => {
        const on = d.key === active;
        return (
          <button
            key={d.key}
            type="button"
            data-day={d.key}
            onClick={() => jump(d.key)}
            aria-pressed={on}
            className="tap-44 flex shrink-0 flex-col items-center rounded-[var(--app-radius-md)] px-2.5 py-1.5 leading-none transition-colors"
            style={{
              background: on ? "var(--app-ink)" : "var(--app-bg-elevated)",
              color: on ? "var(--app-bg)" : "var(--app-ink-2)",
              boxShadow: on ? undefined : "var(--app-edge), var(--app-hi)",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">
              {d.isToday ? "Today" : d.weekday}
            </span>
            <span className="mt-0.5 font-serif text-[16px] font-semibold tabular-nums">
              {d.dayNum}
            </span>
            <span className="mt-0.5 text-[9.5px] font-semibold tabular-nums opacity-70">
              {d.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

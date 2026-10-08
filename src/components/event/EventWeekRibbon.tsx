"use client";

import { useState, useTransition, type CSSProperties } from "react";
import {
  ribbonMonthCaption,
  ribbonSelection,
  weekDayKeys,
  type RibbonSelection,
  type TimeKey,
} from "./boardCaption";

/**
 * EventWeekRibbon — the one date control on /events.
 *
 * Seven equal cells on a single `grid-cols-7` row, so the next seven days
 * always fit one screen width with no horizontal scroll. Each cell carries
 * the weekday letter, the day numeral and a 4px dot when the day has events.
 * Counts are not printed: they are supporting detail, so they live in each
 * cell's accessible name and in the answer sentence under the ribbon.
 *
 * The caption line above the cells names the month and holds the one
 * "This weekend" text button. Tapping a day picks that day alone (?d=),
 * including Saturday while the weekend is selected. The board's named lenses
 * (?lens=today, tonight, tomorrow and weekend) map onto the same cells
 * through ribbonSelection(), so shared links keep their answers.
 *
 * The selection is a 1.5px Ink outline with an Ink numeral, drawn as one
 * run across consecutive days (the weekend), never a Brick fill. Today keeps
 * its Brick-press weekday letter. A tap is acknowledged in the same frame;
 * the board's re-slice runs as a transition, so a busy feed cannot make the
 * ribbon look like it ignored the tap.
 *
 * Counts are the complete server-computed day summary, or the complete
 * filtered collection once one is loaded, never the bounded first paint
 * preview. `null` means a narrowed board is still loading: the cells stay
 * pickable but show no dots and announce no numbers rather than countywide
 * ones.
 */

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/** A tap the board has not finished applying yet. */
type PendingPick =
  | { kind: "day"; key: string | null }
  | { kind: "weekend"; on: boolean };

function pendingSelection(
  pick: PendingPick,
  weekendDays: readonly string[],
): RibbonSelection {
  if (pick.kind === "day") {
    return pick.key
      ? { days: [pick.key], pressedDay: pick.key, weekend: false }
      : { days: [], pressedDay: null, weekend: false };
  }
  return pick.on
    ? { days: [...weekendDays], pressedDay: null, weekend: true }
    : { days: [], pressedDay: null, weekend: false };
}

/** The selection outline for one cell: top and bottom always, a side only
 *  where the run ends, so the weekend reads as one outlined span. */
function outlineFor(selected: boolean, prev: boolean, next: boolean): CSSProperties {
  if (!selected) return {};
  const edge = "var(--app-ink)";
  const radius = "var(--app-radius-md)";
  return {
    boxShadow: [
      `inset 0 1.5px 0 0 ${edge}`,
      `inset 0 -1.5px 0 0 ${edge}`,
      prev ? null : `inset 1.5px 0 0 0 ${edge}`,
      next ? null : `inset -1.5px 0 0 0 ${edge}`,
    ]
      .filter(Boolean)
      .join(", "),
    borderTopLeftRadius: prev ? 0 : radius,
    borderBottomLeftRadius: prev ? 0 : radius,
    borderTopRightRadius: next ? 0 : radius,
    borderBottomRightRadius: next ? 0 : radius,
  };
}

export default function EventWeekRibbon({
  nowISO,
  countByDate,
  lens,
  day,
  weekendDays,
  onPickDay,
  onToggleWeekend,
}: {
  nowISO: string;
  countByDate: Record<string, number> | null;
  /** The board's time lens (?lens=). */
  lens: TimeKey;
  /** The picked day (?d=), which wins over the lens. */
  day: string | null;
  /** The Eastern days of the board's weekend window (Fri, Sat, Sun). */
  weekendDays: readonly string[];
  /** Pick one day, or null to clear the date selection. */
  onPickDay: (day: string | null) => void;
  /** Select (true) or clear (false) the weekend window. */
  onToggleWeekend: (on: boolean) => void;
}) {
  const [pending, setPending] = useState<PendingPick | null>(null);
  const [, startTransition] = useTransition();
  const committed = ribbonSelection({ lens, day, nowISO, weekendDays });
  const selection = pending ? pendingSelection(pending, weekendDays) : committed;
  const selected = new Set(selection.days);
  const countsKnown = countByDate !== null;

  const keys = weekDayKeys(nowISO);
  const days = keys.map((key, i) => {
    const date = new Date(`${key}T16:00:00Z`);
    const dow = date.getUTCDay();
    return {
      key,
      letter: WEEKDAY_LETTERS[dow],
      full: WEEKDAY_FULL[dow],
      dom: date.getUTCDate(),
      isToday: i === 0,
      count: countByDate?.[key] ?? 0,
    };
  });

  // Acknowledge the tap in this frame, then apply it to the board as a
  // transition so the cell or button never looks ignored.
  const commit = (pick: PendingPick, apply: () => void) => {
    setPending(pick);
    window.requestAnimationFrame(() => {
      startTransition(() => {
        apply();
        setPending(null);
      });
    });
  };

  return (
    <div role="group" aria-label="When" data-events-week-ribbon>
      {/* The caption line: the month the numerals belong to, and the one
          weekend shortcut, right-aligned at a 44px target. */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-meta-lg font-semibold" style={{ color: "var(--app-ink-2)" }}>
          {ribbonMonthCaption(keys)}
        </p>
        <button
          type="button"
          aria-pressed={selection.weekend}
          onClick={() => {
            const on = !selection.weekend;
            commit({ kind: "weekend", on }, () => onToggleWeekend(on));
          }}
          className={`inline-flex min-h-11 shrink-0 items-center px-1 text-meta-lg font-semibold underline-offset-4 ${
            selection.weekend ? "underline decoration-2" : ""
          }`}
          style={{
            color: selection.weekend ? "var(--app-ink)" : "var(--app-brand-press)",
          }}
        >
          This weekend
        </button>
      </div>

      {/* Below 360px the row borrows 12px of each gutter so every cell keeps
          a 44px target without an eighth cell or a sideways scroll. */}
      <div
        className="grid grid-cols-7 rounded-[var(--app-radius-lg)] p-0.5 max-[359px]:-mx-3"
        style={{
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-edge)",
        }}
      >
        {days.map((d, i) => {
          const isSelected = selected.has(d.key);
          const prevSelected = i > 0 && selected.has(days[i - 1].key);
          const nextSelected = i < days.length - 1 && selected.has(days[i + 1].key);
          const isPressed = selection.pressedDay === d.key;
          const inWeekend = selection.weekend && isSelected;
          const ariaLabel = `${d.full} ${d.dom}${d.isToday ? ", today" : ""}${
            countsKnown ? `, ${d.count} ${d.count === 1 ? "event" : "events"}` : ""
          }${inWeekend ? ", part of this weekend" : ""}`;
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={isPressed}
              aria-label={ariaLabel}
              data-selected={isSelected || undefined}
              onClick={() => {
                const next = isPressed ? null : d.key;
                commit({ kind: "day", key: next }, () => onPickDay(next));
              }}
              className="flex min-h-16 min-w-11 flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md)] transition-colors active:bg-[var(--app-bg-sunken)]"
              style={outlineFor(isSelected, prevSelected, nextSelected)}
            >
              <span
                className="text-caption font-semibold"
                style={{
                  lineHeight: 1,
                  color: d.isToday ? "var(--app-brand-press)" : "var(--app-ink-3)",
                }}
              >
                {d.letter}
              </span>
              <span
                className="text-title font-semibold tabular-nums"
                style={{ lineHeight: 1, color: "var(--app-ink)" }}
              >
                {d.dom}
              </span>
              {/* A dot says the day has events; the number lives in the
                  cell's name. While a narrowed board loads, every slot
                  stays blank at the same height. */}
              <span
                aria-hidden
                data-has-events={countsKnown && d.count > 0 ? "true" : undefined}
                className="block h-1 w-1 rounded-full"
                style={{
                  background:
                    countsKnown && d.count > 0 ? "var(--app-ink-3)" : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

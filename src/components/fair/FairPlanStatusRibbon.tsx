import { CalendarDays } from "lucide-react";

import type { FairPlan } from "@/lib/fair/plan";
import { buildFairPlanStatus } from "@/lib/fair/plan-status";

import type { FairDayDateOption } from "./types";

/**
 * A persistent orientation strip, not a second dashboard. The active view owns
 * its primary action; this strip only answers which day is selected and how
 * much of that plan is ready.
 */
export default function FairPlanStatusRibbon({
  plan,
  dates,
  selectedDate,
  onDateChange,
  savedCountsByDate,
  compact = false,
}: {
  plan: FairPlan;
  dates: FairDayDateOption[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  savedCountsByDate?: Readonly<Record<string, number>>;
  compact?: boolean;
}) {
  const status = buildFairPlanStatus(plan);

  return (
    <section
      id="fair-plan-status"
      data-fair-plan-status={compact ? "compact" : "full"}
      aria-label="Your Fair plan status"
      className="border-y"
      style={{
        borderColor: "var(--app-border-strong)",
        background: "var(--app-bg-elevated-solid)",
      }}
    >
      <div className="mx-auto grid min-h-[76px] max-w-[68rem] grid-cols-[minmax(0,1fr)_8rem] items-center gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
        <div className="min-w-0">
          <p
            className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Your Fair Day
          </p>
          <p
            data-fair-plan-summary
            className="mt-1 text-[14px] font-bold leading-snug sm:text-[15px]"
          >
            {status.readinessLabel}
            <span aria-hidden="true"> · </span>
            {status.savedStopsLabel}
          </p>
          {!compact && status.partySize > 0 ? (
            <p
              className="mt-0.5 text-[12px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {status.partyLabel}
            </p>
          ) : null}
        </div>

        <label
          data-fair-plan-date
          className="w-full shrink-0"
        >
          <span className="sr-only">Fair day in your plan</span>
          <select
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            aria-label="Fair day in your plan"
            className="h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] px-3 text-[12.5px] font-semibold sm:w-auto sm:max-w-[9.5rem]"
            style={{
              borderColor: "var(--app-control-border)",
              color: "var(--app-ink)",
            }}
          >
            {dates.map((day) => (
              <option key={day.date} value={day.date}>
                {day.weekdayLabel}, Sep {day.dayLabel}
                {(savedCountsByDate?.[day.date] ?? 0) > 0
                  ? ` · ${savedCountsByDate?.[day.date]} saved`
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

import {
  ChevronRight,
  MapPinned,
  Navigation,
  TicketCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import {
  buildFairPlanStatus,
  type FairPlanStatus,
} from "@/lib/fair/plan-status";
import type { FairPlan } from "@/lib/fair/plan";

import type { FairDayDateOption } from "./types";

export default function FairPlanStatusRibbon({
  plan,
  dates,
  selectedDate,
  onDateChange,
  onNextAction,
  compact = false,
}: {
  plan: FairPlan;
  dates: FairDayDateOption[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onNextAction: (status: FairPlanStatus) => void;
  compact?: boolean;
}) {
  const status = buildFairPlanStatus(plan);
  const travelReady = plan.readyKeys.includes("travel");
  const beforeKeys = ["ticket", "entry"] as const;
  const beforeReady = beforeKeys.filter((key) =>
    plan.readyKeys.includes(key),
  ).length;
  const stages: Array<{
    label: string;
    scope: string;
    detail: string;
    accent: string;
    icon: LucideIcon;
  }> = [
    {
      label: "Before",
      scope: "Tickets + entry",
      detail:
        beforeReady === 2
          ? "Ready"
          : beforeReady === 1
            ? "1 detail left"
            : "Start here",
      accent: "var(--app-brand-press)",
      icon: TicketCheck,
    },
    {
      label: "Travel",
      scope: "Arrive + return",
      detail: travelReady
        ? "Planned"
        : plan.arrivalChoice === "undecided"
          ? "Choose"
          : "Finish",
      accent: "var(--app-cool)",
      icon: Navigation,
    },
    {
      label: "At Fair",
      scope: "Your saved stops",
      detail:
        status.savedStopCount === 0
          ? "Add a stop"
          : `${status.savedStopCount} saved`,
      accent: "var(--app-accent-press)",
      icon: MapPinned,
    },
  ];

  return (
    <section
      data-fair-plan-status={compact ? "compact" : "full"}
      aria-label="Your Fair plan status"
      className="border-y py-3"
      style={{
        borderColor: "var(--app-border-strong)",
        background:
          "linear-gradient(90deg, var(--app-bg-elevated), var(--app-bg))",
      }}
    >
      <div className="mx-auto max-w-[48rem] px-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className="text-[10.5px] font-bold uppercase tracking-[0.13em]"
              style={{ color: "var(--app-brand-press)" }}
            >
              Your Fair plan
            </p>
            <p className="mt-1 text-[15px] font-bold leading-tight">
              {status.shortDateLabel}
              <span aria-hidden="true"> · </span>
              {status.savedStopsLabel}
            </p>
            <p
              className={`mt-0.5 text-[12px] font-semibold ${compact ? "hidden sm:block" : ""}`}
              style={{ color: "var(--app-ink-3)" }}
            >
              {status.partyLabel}
            </p>
          </div>

          <label className="shrink-0">
            <span className="sr-only">Fair day in your plan</span>
            <select
              value={selectedDate}
              onChange={(event) => onDateChange(event.target.value)}
              aria-label="Fair day in your plan"
              className="h-11 max-w-[9.5rem] rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 text-[12.5px] font-semibold"
              style={{
                borderColor: "var(--app-control-border)",
                color: "var(--app-ink)",
              }}
            >
              {dates.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.weekdayLabel}, Sep {day.dayLabel}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          className={`${compact ? "hidden" : "mt-3 grid"} grid-cols-3 divide-x border-y`}
          aria-label="Fair trip at a glance"
          style={{ borderColor: "var(--app-border-strong)" }}
        >
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.label}
                aria-label={`${stage.label}: ${stage.scope}. ${stage.detail}.`}
                className="min-w-0 px-2 py-2.5 first:pl-0 last:pr-0 sm:px-4"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="flex items-center gap-1.5">
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: stage.accent }}
                    aria-hidden="true"
                  />
                  <span
                    className="truncate text-[12.5px] font-bold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {stage.label}
                  </span>
                </span>
                <span
                  className="mt-1 block truncate text-[12px] leading-tight"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {stage.scope}
                </span>
                <span
                  className="mt-0.5 block truncate text-[12px] font-bold leading-tight tabular-nums"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {stage.detail}
                </span>
              </div>
            );
          })}
        </div>

        <div
          className={`${compact ? "mt-2" : "mt-3 border-t pt-3"} flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between`}
          style={{ borderColor: "var(--app-border)" }}
        >
          <p
            className={`min-w-0 text-[12.5px] leading-snug ${compact ? "hidden sm:block" : ""}`}
            style={{ color: "var(--app-ink-2)" }}
            aria-live="polite"
          >
            {status.stateLabel}
          </p>
          <Button
            className="w-full shrink-0 sm:w-auto"
            size="sm"
            onClick={() => onNextAction(status)}
            iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}
          >
            {status.nextActionLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

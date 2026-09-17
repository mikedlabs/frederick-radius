import type { FairPlan, FairPlanArrivalChoice } from "@/lib/fair/plan";

export const FAIR_DAY_PATH = "/moments/great-frederick-fair-2026" as const;

export type FairPlanNextAction =
  | "tickets"
  | "travel"
  | "entry"
  | "find"
  | "my-day";

export type FairPlanStatus = {
  selectedDate: string | null;
  dateLabel: string;
  shortDateLabel: string;
  savedStopCount: number;
  needsReviewStopCount: number;
  savedStopsLabel: string;
  partySize: number;
  partyLabel: string;
  handledPreparationCount: number;
  readinessLabel: string;
  summarySentence: string;
  stateLabel: string;
  nextAction: FairPlanNextAction;
  nextActionLabel: string;
  nextActionHref: string;
};

const ACTION_META: Record<
  FairPlanNextAction,
  { label: string; hash: string }
> = {
  tickets: { label: "Review tickets", hash: "fair-ready-ticket" },
  travel: { label: "Choose travel", hash: "travel" },
  entry: { label: "Review entry", hash: "fair-ready-entry" },
  find: { label: "Find one thing", hash: "find" },
  "my-day": { label: "Open My Day", hash: "my-day" },
};

const TRAVEL_LABEL: Record<FairPlanArrivalChoice, string> = {
  undecided: "Travel",
  drive: "Driving",
  transit: "County Transit",
  "drop-off": "Drop-off",
  walk: "Walking",
  bike: "Biking",
};

function selectedDateFromPlan(plan: FairPlan): string | null {
  const value = plan.selectedDayId?.replace(/^day-/, "") ?? null;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function fairDateLabel(date: string | null, short: boolean): string {
  if (!date) return "Choose a Fair day";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: short ? "short" : "long",
    month: short ? "short" : "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function nextActionForPlan(
  plan: FairPlan,
  currentSavedStopCount: number,
): FairPlanNextAction {
  if (!plan.readyKeys.includes("ticket")) return "tickets";
  if (
    plan.arrivalChoice === "undecided" ||
    !plan.readyKeys.includes("travel")
  ) {
    return "travel";
  }
  if (!plan.readyKeys.includes("entry")) return "entry";
  return currentSavedStopCount === 0 ? "find" : "my-day";
}

/**
 * One truthful status model for Today and every Fair mode. Legacy arrival and
 * return flags are deliberately ignored: older builds set both as soon as a
 * visitor selected a mode, which did not mean the trip had been checked.
 */
export function buildFairPlanStatus(plan: FairPlan): FairPlanStatus {
  const selectedDate = selectedDateFromPlan(plan);
  const selectedDayId = selectedDate ? `day-${selectedDate}` : null;
  const selectedDaySteps = selectedDayId
    ? plan.steps.filter((step) => step.dayId === selectedDayId)
    : [];
  const savedStopCount = selectedDaySteps.length;
  const needsReviewStopCount = selectedDaySteps.filter(
    (step) => step.sourceState === "changed-or-removed",
  ).length;
  const currentSavedStopCount = savedStopCount - needsReviewStopCount;
  const preparationKeys = ["ticket", "travel", "entry"] as const;
  const handledPreparationCount = preparationKeys.filter((key) =>
    plan.readyKeys.includes(key),
  ).length;
  const nextAction = nextActionForPlan(plan, currentSavedStopCount);
  const actionMeta = ACTION_META[nextAction];
  const dateLabel = fairDateLabel(selectedDate, false);
  const shortDateLabel = fairDateLabel(selectedDate, true);
  const savedStopsLabel =
    savedStopCount === 0
      ? "No saved stops"
      : `${savedStopCount} saved ${savedStopCount === 1 ? "stop" : "stops"}`;
  const partySize = plan.party.adults11Plus + plan.party.children10Under;
  const partyParts = [
    plan.party.adults11Plus > 0
      ? `${plan.party.adults11Plus} ${
          plan.party.adults11Plus === 1 ? "guest" : "guests"
        } age 11+`
      : null,
    plan.party.children10Under > 0
      ? `${plan.party.children10Under} ${
          plan.party.children10Under === 1 ? "guest" : "guests"
        } age 10 or under`
      : null,
  ].filter((part): part is string => part !== null);
  const partyLabel =
    partyParts.length > 0 ? partyParts.join(" · ") : "Party not set";
  const readinessLabel = `${handledPreparationCount} of 3 ready`;

  let stateLabel: string;
  if (nextAction === "tickets") {
    stateLabel = "Start with your ticket options.";
  } else if (nextAction === "travel") {
    stateLabel =
      plan.arrivalChoice === "undecided"
        ? "Choose how you will get there."
        : `${TRAVEL_LABEL[plan.arrivalChoice]} is selected but not marked ready.`;
  } else if (nextAction === "entry") {
    stateLabel = "Entry details still need review.";
  } else if (nextAction === "find") {
    stateLabel =
      needsReviewStopCount > 0
        ? `${needsReviewStopCount} saved ${needsReviewStopCount === 1 ? "stop needs" : "stops need"} review. Add a current Fair stop.`
        : "Preparation is ready. Add one Fair stop.";
  } else if (needsReviewStopCount > 0) {
    stateLabel = `${needsReviewStopCount} saved ${needsReviewStopCount === 1 ? "stop needs" : "stops need"} review before relying on this plan.`;
  } else {
    stateLabel = "Your preparation and saved plan are ready on this device.";
  }

  const stopSentence =
    savedStopCount === 0
      ? "has no saved stops yet"
      : `has ${savedStopCount} saved ${savedStopCount === 1 ? "stop" : "stops"}`;
  const preparationVerb = handledPreparationCount === 1 ? "is" : "are";
  const partySentence =
    partySize > 0
      ? ` for ${partySize} ${partySize === 1 ? "person" : "people"}`
      : "";
  const planSentence = selectedDate
    ? `Your ${dateLabel} plan`
    : "Your Fair plan";

  return {
    selectedDate,
    dateLabel,
    shortDateLabel,
    savedStopCount,
    needsReviewStopCount,
    savedStopsLabel,
    partySize,
    partyLabel,
    handledPreparationCount,
    readinessLabel,
    summarySentence: `${planSentence}${partySentence} ${stopSentence}, and ${handledPreparationCount} of 3 preparation steps ${preparationVerb} ready.`,
    stateLabel,
    nextAction,
    nextActionLabel:
      nextAction === "travel" && plan.arrivalChoice !== "undecided"
        ? "Finish travel plan"
        : actionMeta.label,
    nextActionHref: `${FAIR_DAY_PATH}#${actionMeta.hash}`,
  };
}

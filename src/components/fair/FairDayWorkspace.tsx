"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  House,
  ListChecks,
  MapPinned,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  TicketCheck,
  Trash2,
  Volume1,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import RippleMark from "@/components/brand/RippleMark";
import { Button } from "@/components/ui/Button";
import BottomDrawer from "@/components/ui/BottomDrawer";
import {
  addFairPlanItem,
  moveFairPlanItemWithinDay,
  readFairPlan,
  reconcileFairPlan,
  removeFairPlanItem,
  setFairPlanArrivalChoice,
  setFairPlanDay,
  setFairPlanParty,
  setFairPlanReady,
  writeFairPlan,
  type FairPlan,
  type FairPlanReadyKey,
} from "@/lib/fair/plan";
import {
  buildFairPlanStatus,
  type FairPlanStatus,
} from "@/lib/fair/plan-status";
import type { FairPracticalAnswer } from "@/lib/fair/practical-answers";
import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback-ui";
import { haptic } from "@/lib/haptics";

import FairPlanStatusRibbon from "./FairPlanStatusRibbon";
import FairPartyPlanner from "./FairPartyPlanner";
import FairPracticalAnswers from "./FairPracticalAnswers";
import FairDiscoveryChoices, {
  fairDiscoveryIntentMatches,
  fairDiscoveryIntentTitle,
  type FairDiscoveryIntentId,
} from "./FairDiscoveryChoices";
import FairGroundsMap from "./FairGroundsMap";
import FairTravelPanel from "./FairTravelPanel";
import type {
  FairDayArrivalView,
  FairDayOfferView,
  FairDayScheduleItemView,
  FairDayWorkspaceData,
} from "./types";

type FairMode = "now" | "find" | "map" | "my-day" | "travel";
type PreparationKey = Extract<FairPlanReadyKey, "ticket" | "entry">;
type FairPlanStorageState = "checking" | "available" | "unavailable";
type ScheduleFilter =
  | "all"
  | "animals"
  | "music"
  | "rides"
  | "food"
  | "services";

const FAIR_PRIMARY_MODES: Array<{
  id: FairMode;
  label: string;
  icon: typeof House;
}> = [
  { id: "now", label: "Today", icon: House },
  { id: "find", label: "Explore", icon: Search },
  { id: "map", label: "Map", icon: MapPinned },
  { id: "my-day", label: "My Day", icon: ListChecks },
];

const FAIR_MODE_IDS: FairMode[] = ["now", "find", "map", "my-day", "travel"];

const SCHEDULE_FILTERS: Array<{ id: ScheduleFilter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "animals", label: "Animals" },
  { id: "music", label: "Music" },
  { id: "rides", label: "Rides" },
  { id: "food", label: "Food" },
  { id: "services", label: "Services" },
];

const MODE_HEADING_IDS: Record<FairMode, string> = {
  now: "fair-now-heading",
  find: "fair-find-heading",
  map: "fair-grounds-map-heading",
  "my-day": "fair-my-day-heading",
  travel: "fair-travel-heading",
};

const MODE_PANEL_IDS: Record<FairMode, string> = {
  now: "fair-now-panel",
  find: "fair-find-panel",
  map: "fair-map-panel",
  "my-day": "fair-my-day-panel",
  travel: "fair-travel-panel",
};

const FAIR_PLAN_TOAST_ID = "fair-plan-feedback";

/** Keep shared links from the original Fair guide useful after the app redesign. */
export function fairModeFromHash(hash: string): FairMode | null {
  const normalized = hash.replace(/^#/, "").trim().toLocaleLowerCase();
  if (FAIR_MODE_IDS.includes(normalized as FairMode)) {
    return normalized as FairMode;
  }
  if (normalized === "fair-map") return "map";
  if (normalized === "plan") return "my-day";
  if (
    normalized === "leave" ||
    normalized === "fair-ready-arrival" ||
    normalized === "fair-ready-return" ||
    normalized === "fair-car-memory"
  ) {
    return "travel";
  }
  if (
    normalized === "answers" ||
    normalized === "fair-ready-ticket" ||
    normalized === "fair-ready-entry"
  ) {
    return "now";
  }
  return null;
}

function updateTimestamp(): string {
  return new Date().toISOString();
}

function fairDateShortLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function fairNextActionDetail(
  action: FairPlanStatus["nextAction"],
  storageState: FairPlanStorageState,
): string {
  if (action === "tickets") {
    return "Compare the reviewed ticket choices before the handoff to Etix.";
  }
  if (action === "travel") {
    return "Choose parking, Transit, drop-off, walking, or biking before you leave.";
  }
  if (action === "entry") {
    return "Keep your payment method and ticket access ready for the gate.";
  }
  if (action === "find") {
    return "Choose one thing you do not want to miss and Radius will start your timeline.";
  }
  if (storageState === "unavailable") {
    return "Your stops are arranged for this visit, but this browser is not storing them.";
  }
  if (storageState === "checking") {
    return "Your saved stops are arranged in one timeline.";
  }
  return "Your saved stops are arranged in one timeline on this device.";
}

function scheduleAccent(kind: FairDayScheduleItemView["kind"]): string {
  if (kind === "agriculture" || kind === "animal") return "var(--app-brand-2)";
  if (kind === "service") return "var(--app-cool)";
  if (kind === "concert") return "var(--app-accent-press)";
  return "var(--app-brand-press)";
}

function scheduleFilterMatches(
  item: FairDayScheduleItemView,
  filter: ScheduleFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "animals") {
    return item.kind === "animal" || item.kind === "agriculture";
  }
  if (filter === "music") return item.kind === "concert";
  if (filter === "rides") {
    return item.kind === "carnival" || item.kind === "motorsport";
  }
  if (filter === "food") return item.kind === "food";
  return item.kind === "service";
}

function isScheduleUtilityRow(item: FairDayScheduleItemView): boolean {
  return /^(?:deadline\b|parking fees begin\b|kids?\b.*admitted\b|[|]?(?:\s*(?:senior|military) day|\s*lunch bunch|\s*canned food drive))/i.test(
    item.title.trim(),
  );
}

function scheduleStartMinutes(label: string): number {
  const normalized = label.toLocaleLowerCase().replace(/\./g, "");
  if (/\bnoon\b/.test(normalized)) return 12 * 60;
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])m\b/);
  if (!match) return Number.POSITIVE_INFINITY;
  let hour = Number(match[1]) % 12;
  if (match[3] === "p") hour += 12;
  return hour * 60 + Number(match[2] ?? 0);
}

function compactPlaceLabel(placeLabel: string): string | null {
  if (!placeLabel.startsWith("Published place:")) return null;
  return placeLabel
    .replace(/^Published place:\s*/i, "")
    .replace(/\.$/, "")
    .trim();
}

function restoreFairPlanItemAtDayPosition(
  plan: FairPlan,
  item: FairDayScheduleItemView["sourceItem"],
  dayPosition: number,
  now: string,
): FairPlan {
  if (plan.steps.some((step) => step.scheduleItemId === item.id)) return plan;

  let restored = addFairPlanItem(plan, item, now);
  const currentDayPosition = restored.steps
    .filter((step) => step.dayId === item.dayId)
    .findIndex((step) => step.scheduleItemId === item.id);
  const targetDayPosition = Math.max(0, dayPosition);

  for (
    let position = currentDayPosition;
    position > targetDayPosition;
    position -= 1
  ) {
    restored = moveFairPlanItemWithinDay(restored, item.id, -1, now);
  }

  return restored;
}

function TicketPreparation({
  offers,
  data,
  plan,
  onPartyChange,
  onReadyChange,
}: {
  offers: FairDayOfferView[];
  data: FairDayWorkspaceData;
  plan: FairPlan;
  onPartyChange: (party: FairPlan["party"]) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const partyCount =
    plan.party.adults11Plus +
    plan.party.children10Under +
    plan.party.adultRiders +
    plan.party.childRiders;
  const [showCalculator, setShowCalculator] = useState(partyCount > 0);
  const ready = plan.readyKeys.includes("ticket");
  const eligibilityOffers = offers.filter(
    (offer) => offer.placement === "eligibility-promotion",
  );

  return (
    <div className="px-4 pb-6 pt-2 sm:px-6">
      <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        Tell Radius who is going only if you want a reviewed subtotal. Radius uses your counts only in this browser.
      </p>
      <div className="mt-4 grid gap-2 min-[380px]:grid-cols-2">
        <Button
          className="w-full"
          variant={showCalculator ? "primary" : "secondary"}
          aria-pressed={showCalculator}
          onClick={() => setShowCalculator((current) => !current)}
          iconLeft={<TicketCheck className="h-4 w-4" aria-hidden />}
        >
          Compare tickets
        </Button>
        <Button
          className="w-full"
          variant={ready ? "primary" : "secondary"}
          aria-pressed={ready}
          onClick={() => onReadyChange(!ready)}
          iconLeft={<Check className="h-4 w-4" aria-hidden />}
        >
          {ready ? "Tickets handled" : "I already have tickets"}
        </Button>
      </div>

      {showCalculator ? (
        <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
          <FairPartyPlanner
            party={plan.party}
            date={plan.selectedDayId?.replace(/^day-/, "") ?? data.initialDate}
            asOf={data.reviewedAt}
            offers={data.partyOffers}
            onPartyChange={onPartyChange}
          />
          {eligibilityOffers.length > 0 ? (
            <details className="mt-5 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
              <summary className="tap-44 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[14px] font-semibold">
                Day-specific promotions
                <ChevronDown className="h-4 w-4" aria-hidden />
              </summary>
              <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
                {eligibilityOffers.map((offer) => (
                  <li key={offer.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-semibold">{offer.label}</p>
                        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                          {offer.detail}
                        </p>
                      </div>
                      <strong className="shrink-0 text-[15px] tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                        {offer.priceLabel}
                      </strong>
                    </div>
                    <a
                      href={offer.officialPurchaseUrl ?? offer.officialInfoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-44 mt-2 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold"
                      style={{ color: "var(--app-brand-press)" }}
                    >
                      Official details
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EntryPreparation({
  data,
  ready,
  onReadyChange,
}: {
  data: FairDayWorkspaceData;
  ready: boolean;
  onReadyChange: (ready: boolean) => void;
}) {
  return (
    <div className="px-4 pb-6 pt-2 sm:px-6">
      <p className="text-[17px] font-semibold leading-snug">{data.entrySummary}</p>
      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {data.entryDetail}
      </p>
      <div className="mt-5 grid gap-2 min-[380px]:grid-cols-2">
        <Button
          className="w-full"
          aria-pressed={ready}
          onClick={() => onReadyChange(!ready)}
          iconLeft={<Check className="h-4 w-4" aria-hidden />}
        >
          {ready ? "Entry ready" : "I am ready for entry"}
        </Button>
        <Button
          className="w-full"
          href={data.ticketWalletHelpUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
        >
          Prepare Etix tickets
        </Button>
      </div>
    </div>
  );
}

function FairDayPicker({
  dates,
  selectedDate,
  onChange,
  label,
}: {
  dates: FairDayWorkspaceData["dates"];
  selectedDate: string;
  onChange: (date: string) => void;
  label: string;
}) {
  return (
    <label className="shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={selectedDate}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-11 max-w-[9.5rem] rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] px-3 text-[12.5px] font-semibold"
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
  );
}

export default function FairDayWorkspace({ data }: { data: FairDayWorkspaceData }) {
  const validDates = useMemo(
    () => new Set(data.dates.map((day) => day.date)),
    [data.dates],
  );
  const scheduleById = useMemo(
    () => new Map(data.scheduleItems.map((item) => [item.id, item])),
    [data.scheduleItems],
  );
  const sourceScheduleItems = useMemo(
    () => data.scheduleItems.map((item) => item.sourceItem),
    [data.scheduleItems],
  );
  const [activeMode, setActiveMode] = useState<FairMode>("now");
  const [routeReady, setRouteReady] = useState(false);
  const [activePreparation, setActivePreparation] =
    useState<PreparationKey | null>(null);
  const [selectedProgramDetailId, setSelectedProgramDetailId] = useState<
    string | null
  >(null);
  const [programDetailOpen, setProgramDetailOpen] = useState(false);
  const programDetailClearTimer = useRef<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpAnswerId, setHelpAnswerId] = useState<string | null>(null);
  const [helpCategory, setHelpCategory] = useState<
    FairPracticalAnswer["category"] | null
  >(null);
  const [selectedDate, setSelectedDate] = useState(
    data.initialPlan.selectedDayId?.replace(/^day-/, "") ??
      (validDates.has(data.initialDate) ? data.initialDate : (data.dates[0]?.date ?? "")),
  );
  const [selectedArrivalId, setSelectedArrivalId] = useState(
    data.arrivalOptions.find(
      (option) => option.planChoice === data.initialPlan.arrivalChoice,
    )?.id ?? "",
  );
  const [plan, setPlan] = useState<FairPlan>(data.initialPlan);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scheduleFilter, setScheduleFilter] =
    useState<ScheduleFilter>("all");
  const [discoveryIntent, setDiscoveryIntent] =
    useState<FairDiscoveryIntentId | null>(null);
  const [showAllSchedule, setShowAllSchedule] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [planStorageState, setPlanStorageState] =
    useState<FairPlanStorageState>("checking");
  const [partyAsOf, setPartyAsOf] = useState(data.reviewedAt);

  const closeProgramDetail = () => {
    setProgramDetailOpen(false);
    if (programDetailClearTimer.current !== null) {
      window.clearTimeout(programDetailClearTimer.current);
    }
    programDetailClearTimer.current = window.setTimeout(() => {
      setSelectedProgramDetailId(null);
      programDetailClearTimer.current = null;
    }, 350);
  };

  const openProgramDetail = (itemId: string) => {
    if (programDetailClearTimer.current !== null) {
      window.clearTimeout(programDetailClearTimer.current);
      programDetailClearTimer.current = null;
    }
    setActivePreparation(null);
    setHelpOpen(false);
    setSelectedProgramDetailId(itemId);
    setProgramDetailOpen(true);
  };

  const openPreparation = (preparation: PreparationKey) => {
    setHelpOpen(false);
    closeProgramDetail();
    setActivePreparation(preparation);
  };

  const openHelp = () => {
    setActivePreparation(null);
    closeProgramDetail();
    setHelpOpen(true);
  };

  useEffect(
    () => () => {
      if (programDetailClearTimer.current !== null) {
        window.clearTimeout(programDetailClearTimer.current);
      }
    },
    [],
  );

  const offersForSelectedDate = data.offers.filter((offer) => {
    const pastCurrentKnownDeadline =
      offer.deadlineAt !== null &&
      Date.parse(partyAsOf) >= Date.parse(offer.deadlineAt);
    if (offer.pastKnownDeadline || pastCurrentKnownDeadline) return false;
    if (!offer.validDates) return true;
    return (
      selectedDate >= offer.validDates.startsOn &&
      selectedDate <= offer.validDates.endsOn
    );
  });
  const selectedArrival =
    data.arrivalOptions.find((option) => option.id === selectedArrivalId) ?? null;
  const selectedAccessHighlight =
    data.accessHighlights.find((highlight) => highlight.date === selectedDate) ??
    null;

  useEffect(() => {
    try {
      const stored = readFairPlan(window.localStorage);
      if (!stored || stored.fairId !== data.fairId) {
        setStorageReady(true);
        return;
      }
      const reconciled = reconcileFairPlan(
        stored,
        sourceScheduleItems,
        data.packRevision,
        updateTimestamp(),
      );
      setPlan(reconciled.plan);
      if (reconciled.changedOrRemovedIds.length > 0) {
        setPlanNotice(
          `${reconciled.changedOrRemovedIds.length} saved ${
            reconciled.changedOrRemovedIds.length === 1 ? "stop has" : "stops have"
          } changed in the official program. Review the saved wording before relying on it.`,
        );
      }
      if (reconciled.plan.selectedDayId) {
        const restoredDate = reconciled.plan.selectedDayId.replace(/^day-/, "");
        if (validDates.has(restoredDate)) setSelectedDate(restoredDate);
      }
      const restoredArrival = data.arrivalOptions.find(
        (option) => option.planChoice === reconciled.plan.arrivalChoice,
      );
      if (restoredArrival) setSelectedArrivalId(restoredArrival.id);
    } finally {
      setStorageReady(true);
    }
  }, [
    data.arrivalOptions,
    data.fairId,
    data.packRevision,
    sourceScheduleItems,
    validDates,
  ]);

  useEffect(() => {
    if (!storageReady) return;
    let wrotePlan = false;
    try {
      wrotePlan = writeFairPlan(window.localStorage, plan);
    } catch {
      // Some privacy modes block access to the Storage object itself.
    }
    setPlanStorageState(wrotePlan ? "available" : "unavailable");
  }, [plan, storageReady]);

  useLayoutEffect(() => {
    const syncModeFromHash = () => {
      const requested = window.location.hash.slice(1);
      const requestedMode = fairModeFromHash(requested);
      if (!requestedMode) return;

      setActiveMode(requestedMode);
      if (requested === "answers") {
        setActivePreparation(null);
        setProgramDetailOpen(false);
        setHelpOpen(true);
      }
      if (requested === "fair-ready-ticket") {
        setHelpOpen(false);
        setProgramDetailOpen(false);
        setActivePreparation("ticket");
      }
      if (requested === "fair-ready-entry") {
        setHelpOpen(false);
        setProgramDetailOpen(false);
        setActivePreparation("entry");
      }

      const canonicalHash =
        requestedMode === "map" ? "#fair-map" : `#${requestedMode}`;
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(window.history.state, "", canonicalHash);
      }
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    };

    syncModeFromHash();
    setRouteReady(true);
    window.addEventListener("hashchange", syncModeFromHash);
    return () => window.removeEventListener("hashchange", syncModeFromHash);
  }, []);

  useEffect(() => {
    let deadlineTimer: number | undefined;
    const refreshDeadlineClock = () => {
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
      const now = Date.now();
      setPartyAsOf(new Date(now).toISOString());
      const nextDeadline = data.partyOffers
        .flatMap((offer) =>
          offer.deadline.status === "known"
            ? [Date.parse(offer.deadline.value)]
            : [],
        )
        .filter((deadline) => deadline > now)
        .sort((left, right) => left - right)[0];
      if (nextDeadline !== undefined) {
        deadlineTimer = window.setTimeout(
          refreshDeadlineClock,
          Math.min(2_147_000_000, Math.max(250, nextDeadline - now + 250)),
        );
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshDeadlineClock();
    };
    refreshDeadlineClock();
    window.addEventListener("focus", refreshDeadlineClock);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
      window.removeEventListener("focus", refreshDeadlineClock);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [data.partyOffers]);

  const resetExplore = () => {
    setShowAllSchedule(false);
    setDiscoveryIntent(null);
    setQuery("");
    setScheduleFilter("all");
  };

  const chooseMode = (mode: FairMode) => {
    if (mode === "find" && activeMode === "find") {
      resetExplore();
    }
    setActivePreparation(null);
    setHelpOpen(false);
    closeProgramDetail();
    setActiveMode(mode);
    window.history.replaceState(
      window.history.state,
      "",
      mode === "map" ? "#fair-map" : `#${mode}`,
    );
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      document.getElementById(MODE_HEADING_IDS[mode])?.focus({ preventScroll: true });
    });
  };

  const chooseFairDate = (date: string) => {
    setSelectedDate(date);
    setShowAllSchedule(false);
    setDiscoveryIntent(null);
    setPlan((current) => {
      const now = updateTimestamp();
      const nextDayId = `day-${date}`;
      const changedDay = current.selectedDayId !== nextDayId;
      const nextDay = setFairPlanDay(current, nextDayId, now);
      // Travel checks are date-specific: transit service, road conditions,
      // and return details can all differ across the nine Fair days.
      return changedDay
        ? setFairPlanReady(nextDay, "travel", false, now)
        : nextDay;
    });
  };

  const toggleFairScheduleItem = (
    item: FairDayScheduleItemView,
    planned: boolean,
  ) => {
    const changedAt = updateTimestamp();

    if (planned) {
      const dayPosition = plan.steps
        .filter((step) => step.dayId === item.sourceItem.dayId)
        .findIndex((step) => step.scheduleItemId === item.id);
      haptic("light");
      setPlan((current) => removeFairPlanItem(current, item.id, changedAt));
      toast("Removed from My Day", {
        id: FAIR_PLAN_TOAST_ID,
        description: item.title,
        duration: 5_000,
        action: {
          label: "Undo",
          onClick: () => {
            haptic("light");
            setPlan((current) =>
              restoreFairPlanItemAtDayPosition(
                current,
                item.sourceItem,
                dayPosition,
                updateTimestamp(),
              ),
            );
          },
        },
      });
      return;
    }

    haptic("medium");
    setPlan((current) =>
      addFairPlanItem(current, item.sourceItem, changedAt),
    );
    toast.success("Added to My Day", {
      id: FAIR_PLAN_TOAST_ID,
      description: item.title,
      duration: 5_000,
      action: {
        label: "My Day",
        onClick: () => chooseMode("my-day"),
      },
      cancel: {
        label: "Undo",
        onClick: () => {
          haptic("light");
          setPlan((current) =>
            removeFairPlanItem(current, item.id, updateTimestamp()),
          );
        },
      },
    });
  };

  const chooseArrival = (option: FairDayArrivalView) => {
    setSelectedArrivalId(option.id);
    setPlan((current) => {
      const now = updateTimestamp();
      const chosen = setFairPlanArrivalChoice(
        current,
        option.planChoice,
        now,
      );
      const travelNotReady = setFairPlanReady(
        chosen,
        "travel",
        false,
        now,
      );
      const legacyArrivalCleared = setFairPlanReady(
        travelNotReady,
        "arrival",
        false,
        now,
      );
      return setFairPlanReady(
        legacyArrivalCleared,
        "return",
        false,
        now,
      );
    });
  };

  const changeTravelReadiness = (ready: boolean) => {
    setPlan((current) => {
      const now = updateTimestamp();
      const legacyArrivalCleared = setFairPlanReady(
        current,
        "arrival",
        false,
        now,
      );
      const legacyReturnCleared = setFairPlanReady(
        legacyArrivalCleared,
        "return",
        false,
        now,
      );
      return setFairPlanReady(legacyReturnCleared, "travel", ready, now);
    });
  };

  const openPlanNextAction = (status: FairPlanStatus) => {
    if (status.nextAction === "tickets") {
      chooseMode("now");
      openPreparation("ticket");
      return;
    }
    if (status.nextAction === "travel") {
      chooseMode("travel");
      return;
    }
    if (status.nextAction === "entry") {
      chooseMode("now");
      openPreparation("entry");
      return;
    }
    chooseMode(status.nextAction === "find" ? "find" : "my-day");
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const discoveryItems = useMemo(
    () =>
      data.scheduleItems.filter(
        (item) =>
          item.date === selectedDate && !isScheduleUtilityRow(item),
      ),
    [data.scheduleItems, selectedDate],
  );
  const matchingSchedule = useMemo(
    () =>
      data.scheduleItems
        .filter((item) => item.date === selectedDate)
        .filter((item) => !isScheduleUtilityRow(item))
        .filter((item) =>
          discoveryIntent
            ? fairDiscoveryIntentMatches(item, discoveryIntent)
            : true,
        )
        .filter((item) => scheduleFilterMatches(item, scheduleFilter))
        .filter((item) => {
          if (!normalizedQuery) return true;
          return `${item.title} ${item.timeLabel} ${item.placeLabel}`
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        })
        .sort(
          (left, right) =>
            scheduleStartMinutes(left.timeLabel) -
              scheduleStartMinutes(right.timeLabel) ||
            left.title.localeCompare(right.title),
        ),
    [
      data.scheduleItems,
      discoveryIntent,
      normalizedQuery,
      scheduleFilter,
      selectedDate,
    ],
  );
  const exploreFocused =
    showAllSchedule ||
    discoveryIntent !== null ||
    normalizedQuery.length > 0 ||
    scheduleFilter !== "all";
  const visibleSchedule =
    showAllSchedule || normalizedQuery.length > 0
      ? matchingSchedule
      : matchingSchedule.slice(0, discoveryIntent ? 6 : 3);
  const contextualAnswers = normalizedQuery
    ? data.practicalAnswers
        .filter((answer) => answer.evidence !== "community-pattern")
        .filter((answer) =>
          `${answer.question} ${answer.answer} ${answer.category}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
        .slice(0, 2)
    : [];
  const selectedDayId = `day-${selectedDate}`;
  const plannedRows = plan.steps
    .filter((step) => step.dayId === selectedDayId)
    .map((step) => ({
      step,
      item: scheduleById.get(step.scheduleItemId) ?? null,
    }));
  const mappedPlanStops = plannedRows.flatMap(({ step, item }) =>
    item
      ? [
          {
            id: step.scheduleItemId,
            title: item.title,
            placeLabel: item.placeLabel,
          },
        ]
      : [],
  );
  const selectedDay = data.dates.find((day) => day.date === selectedDate);
  const planStatus = buildFairPlanStatus(plan);
  const selectedProgramDetail = selectedProgramDetailId
    ? (scheduleById.get(selectedProgramDetailId) ?? null)
    : null;
  const selectedProgramPlanned = selectedProgramDetail
    ? plan.steps.some(
        (step) => step.scheduleItemId === selectedProgramDetail.id,
      )
    : false;
  const ticketAndGateReady =
    plan.readyKeys.includes("ticket") && plan.readyKeys.includes("entry");
  const travelReady = plan.readyKeys.includes("travel");
  const firstStopReady = plannedRows.length > 0;
  const planStateLabel =
    planStatus.nextAction === "my-day" && planStorageState !== "available"
      ? "Your preparation and Fair plan are ready for this visit."
      : planStatus.stateLabel;

  const activePrimaryLabel =
    activeMode === "travel"
      ? "Getting there"
      : (FAIR_PRIMARY_MODES.find((mode) => mode.id === activeMode)?.label ??
        "Fair Day");

  return (
    <article
      data-fair-app
      data-fair-interaction-ready={storageReady ? "true" : "false"}
      data-fair-plan-storage={planStorageState}
      aria-busy={!routeReady || !storageReady}
      className="fair-day-workspace min-h-dvh w-full font-sans"
      style={{
        background: "var(--app-bg)",
        color: "var(--app-ink)",
        visibility: routeReady ? "visible" : "hidden",
      }}
    >
      <style>{`
        .fair-day-workspace :is(a, button, input, select, summary, [tabindex]):focus-visible {
          outline: 2px solid var(--app-brand);
          outline-offset: 3px;
        }
        .fair-day-workspace .fair-hero-control:focus-visible {
          outline: 3px solid var(--app-bg-elevated-solid);
          box-shadow: 0 0 0 2px var(--app-brand-press);
        }
        @media (prefers-reduced-motion: reduce) {
          .fair-day-workspace * { scroll-behavior: auto !important; }
        }
      `}</style>

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-fair-plan-announcement
      >
        {planStatus.summarySentence}
      </p>

      <header>
        {activeMode === "now" ? (
          <div
            data-fair-hero
            className="relative overflow-hidden border-b-2"
            style={{ borderColor: "var(--app-brand)" }}
          >
            <picture className="absolute inset-0 block">
              <img
                src="/images/fair/fairgrounds-night-mike-d-960.jpg"
                srcSet="/images/fair/fairgrounds-night-mike-d-960.jpg 960w, /images/fair/fairgrounds-night-mike-d-1920.jpg 1920w"
                sizes="100vw"
                alt="The Great Frederick Fairgrounds glowing at night, seen from above."
                width="960"
                height="540"
                loading="eager"
                fetchPriority="high"
                className="h-full w-full scale-[1.02] object-cover object-[76%_center] saturate-[1.2] brightness-[1.08] sm:object-center"
              />
            </picture>
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, color-mix(in srgb, var(--app-ink) 42%, transparent), transparent 34%), linear-gradient(to top, color-mix(in srgb, var(--app-cool) 88%, var(--app-ink)), color-mix(in srgb, var(--app-brand-press) 32%, transparent) 58%, transparent 82%)",
              }}
              aria-hidden
            />

            <div
              data-fair-hero-content
              className="relative z-10 mx-auto flex min-h-[190px] max-w-[68rem] flex-col px-3 pb-3 pt-3 text-[var(--app-ink-inverse)] sm:min-h-[260px] sm:px-6 sm:pb-6 sm:pt-4"
            >
              <div
                data-fair-hero-controls
                className="flex flex-wrap items-start justify-between gap-2"
              >
                <Link
                  href="/today"
                  aria-label="Frederick Radius"
                  className="fair-hero-control tap-44 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[13px] font-semibold shadow-[var(--app-elev-1)] backdrop-blur-sm"
                  style={{
                    color: "var(--app-brand-press)",
                    background:
                      "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
                  }}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  <span className="min-[360px]:hidden">Radius</span>
                  <span className="hidden min-[360px]:inline">
                    Frederick Radius
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label="Help & access"
                  onClick={() => {
                    setHelpAnswerId(null);
                    setHelpCategory(null);
                    openHelp();
                  }}
                  className="fair-hero-control tap-44 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[13px] font-semibold shadow-[var(--app-elev-1)] backdrop-blur-sm"
                  style={{
                    color: "var(--app-cool)",
                    background:
                      "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
                  }}
                >
                  <CircleHelp className="h-4 w-4" aria-hidden />
                  <span className="min-[360px]:hidden">Help</span>
                  <span className="hidden min-[360px]:inline">
                    Help &amp; access
                  </span>
                </button>
              </div>

              <span
                data-fair-hero-credit
                className="mt-2 self-end rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] shadow-[var(--app-elev-1)] backdrop-blur-sm"
                style={{
                  color: "var(--app-ink-2)",
                  background:
                    "color-mix(in srgb, var(--app-bg-elevated-solid) 88%, transparent)",
                }}
              >
                <span className="min-[360px]:hidden">Photo: Mike D</span>
                <span className="hidden min-[360px]:inline">
                  Photograph by Mike D
                </span>
              </span>

              <div data-fair-hero-identity className="mt-auto pt-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.11em] opacity-90 sm:text-[11px]">
                  <RippleMark size={24} />
                  Fair Day · Frederick Radius
                </div>
                <h1
                  id="fair-now-heading"
                  tabIndex={-1}
                  className="mt-1 max-w-[14ch] font-editorial text-[34px] font-normal leading-[0.9] tracking-[-0.035em] [text-shadow:0_2px_10px_rgba(0,0,0,0.42)] sm:mt-2 sm:text-[54px]"
                >
                  {data.eventName}
                </h1>
                <p
                  className="mt-1.5 max-w-[20rem] border-t pt-1.5 text-[10px] font-bold uppercase tracking-[0.15em] tabular-nums sm:mt-2 sm:pt-2 sm:text-[11px]"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--app-ink-inverse) 42%, transparent)",
                  }}
                >
                  Sep 18–26 · 2026
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="border-b"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-bg-elevated-solid)",
            }}
          >
            <div className="mx-auto flex min-h-16 max-w-[68rem] items-center justify-between gap-3 px-3 sm:px-5">
              <button
                type="button"
                onClick={() => chooseMode("now")}
                className="tap-44 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--app-radius-sm)] text-left"
                style={{ color: "var(--app-brand-press)" }}
                aria-label="Back to Fair Today"
              >
                <RippleMark size={26} />
                <span className="hidden text-[12px] font-bold uppercase tracking-[0.09em] min-[360px]:block">
                  Fair Day
                </span>
              </button>
              <p className="truncate text-[16px] font-extrabold tracking-[-0.02em]">
                {activePrimaryLabel}
              </p>
              <button
                type="button"
                onClick={() => {
                  setHelpAnswerId(null);
                  setHelpCategory(null);
                  openHelp();
                }}
                className="tap-44 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Help & access"
              >
                <CircleHelp className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        )}

        <nav
          className="mx-auto hidden max-w-[68rem] grid-cols-4 gap-1 border-b px-6 py-2 lg:grid"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          aria-label="Fair Day"
        >
          {FAIR_PRIMARY_MODES.map((mode) => {
            const active =
              activeMode === mode.id ||
              (activeMode === "travel" && mode.id === "my-day");
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => chooseMode(mode.id)}
                className="tap-44 relative flex min-h-12 items-center justify-center gap-2 px-3 text-[14px] font-semibold"
                style={{
                  color: active ? "var(--app-brand-press)" : "var(--app-ink-2)",
                }}
              >
                <span
                  className="absolute inset-x-[38%] bottom-0 h-[3px]"
                  style={{ background: active ? "var(--app-brand)" : "transparent" }}
                  aria-hidden
                />
                <Icon className="h-4 w-4" aria-hidden />
                {mode.label}
                {mode.id === "my-day" && plannedRows.length > 0 ? (
                  <span className="tabular-nums">· {plannedRows.length}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </header>

      {planStorageState === "unavailable" ? (
        <aside
          data-fair-storage-warning
          role="status"
          className="mx-4 mt-4 rounded-[var(--app-radius-md)] border-l-4 px-4 py-3 sm:mx-6 lg:mx-auto lg:w-[min(100%-3rem,68rem)]"
          style={{
            borderColor: "var(--app-warning-press)",
            background:
              "color-mix(in srgb, var(--app-warning) 9%, var(--app-bg-elevated-solid))",
            color: "var(--app-ink)",
          }}
        >
          <p className="text-[14px] font-bold">This plan is not being saved.</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Your browser blocked on-device storage. Keep this page open, because reloading or closing it will clear My Day.
          </p>
        </aside>
      ) : null}

      {activeMode === "now" ? (
        <FairPlanStatusRibbon
          plan={plan}
          dates={data.dates}
          selectedDate={selectedDate}
          onDateChange={chooseFairDate}
        />
      ) : null}

      <div
        className={
          activeMode === "map"
            ? "w-full pb-24 lg:mx-auto lg:max-w-[68rem] lg:px-6 lg:pb-12 lg:pt-6"
            : `mx-auto px-4 pb-32 sm:px-6 lg:pb-12 ${
                activeMode === "travel" ? "pt-3 sm:pt-6" : "pt-6 sm:pt-8"
              } ${
                activeMode === "find" ? "max-w-[68rem]" : "max-w-[48rem]"
              }`
        }
      >
        {activeMode === "now" ? (
          <section id={MODE_PANEL_IDS.now} aria-labelledby="fair-now-heading">
            <section
              data-fair-next-action
              aria-labelledby="fair-next-action-heading"
              className="relative overflow-hidden rounded-[var(--app-radius-xl)] border p-5 text-[var(--app-ink)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--app-brand) 11%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 52%, color-mix(in srgb, var(--app-cool) 8%, var(--app-bg-elevated-solid)))",
                borderColor:
                  "color-mix(in srgb, var(--app-brand) 34%, var(--app-border))",
                boxShadow: "var(--app-elev-2)",
              }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1"
                style={{
                  background:
                    "linear-gradient(to bottom, var(--app-brand), var(--app-cool))",
                }}
              />
              <div className="min-w-0">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  Your next best step
                </p>
                <h2
                  id="fair-next-action-heading"
                  className="mt-1 text-[21px] font-bold leading-tight tracking-[-0.025em]"
                >
                  {planStateLabel}
                </h2>
                <p
                  className="mt-1.5 text-[13px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {fairNextActionDetail(
                    planStatus.nextAction,
                    planStorageState,
                  )}
                </p>
              </div>
              <Button
                className="mt-4 w-full shrink-0 sm:mt-0 sm:w-auto"
                onClick={() => openPlanNextAction(planStatus)}
                iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}
              >
                {planStatus.nextActionLabel}
              </Button>
            </section>

            {selectedAccessHighlight ? (
              <section
                data-fair-access-highlight
                aria-labelledby="fair-access-highlight-heading"
                className="mt-4 overflow-hidden rounded-[var(--app-radius-lg)] border-l-4 p-4"
                style={{
                  borderColor: "var(--app-cool)",
                  background:
                    "color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated))",
                  boxShadow: "var(--app-elev-1), var(--app-edge)",
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                    style={{
                      background:
                        "color-mix(in srgb, var(--app-cool) 13%, var(--app-bg-elevated-solid))",
                      color: "var(--app-cool)",
                    }}
                  >
                    <Volume1 className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-[10.5px] font-bold uppercase tracking-[0.11em]"
                      style={{ color: "var(--app-cool)" }}
                    >
                      Sunday access highlight
                    </p>
                    <h2
                      id="fair-access-highlight-heading"
                      className="mt-0.5 text-[17px] font-bold leading-tight tracking-[-0.02em]"
                    >
                      {selectedAccessHighlight.title}
                    </h2>
                  </div>
                </div>
                <p
                  className="mt-2 text-[14px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {selectedAccessHighlight.detail}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHelpAnswerId(selectedAccessHighlight.answerId);
                    setHelpCategory(null);
                    openHelp();
                  }}
                  className="tap-44 mt-1 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold underline underline-offset-4"
                  style={{ color: "var(--app-cool)" }}
                >
                  Open sensory-friendly details
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </section>
            ) : null}

            <details className="mt-5 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
              <summary className="tap-44 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
                About this independent guide
                <ChevronDown className="h-4 w-4" aria-hidden />
              </summary>
              <p className="pb-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                {data.disclosure} {data.source.label}. {data.source.ageLabel}.{" "}
                <a href={data.source.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4" style={{ color: "var(--app-brand-press)" }}>
                  Official source
                </a>
              </p>
            </details>
          </section>
        ) : null}

        {activeMode === "find" ? (
          <section id={MODE_PANEL_IDS.find} aria-labelledby="fair-find-heading">
            <div className="flex items-center justify-between gap-3">
              {exploreFocused ? (
                <button
                  type="button"
                  onClick={() => {
                    resetExplore();
                    window.requestAnimationFrame(() =>
                      document
                        .getElementById("fair-find-heading")
                        ?.focus({ preventScroll: true }),
                    );
                  }}
                  className="tap-44 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back to Explore
                </button>
              ) : <span aria-hidden="true" />}
              <FairDayPicker
                dates={data.dates}
                selectedDate={selectedDate}
                onChange={chooseFairDate}
                label="Fair day to explore"
              />
            </div>
            <h1 id="fair-find-heading" tabIndex={-1} className="mt-1 text-[34px] font-extrabold leading-[1.02] tracking-[-0.045em] outline-none sm:text-[40px]">
              {showAllSchedule
                ? discoveryIntent
                  ? `All ${fairDiscoveryIntentTitle(discoveryIntent)}`
                  : "Full Fair program"
                : normalizedQuery
                  ? "Search results"
                  : discoveryIntent
                    ? fairDiscoveryIntentTitle(discoveryIntent)
                    : "Explore the Fair"}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {exploreFocused
                ? "A focused view of the official program for your selected day."
                : "Choose one useful path or search the official program."}
            </p>

            <label className="mt-4 block" htmlFor="fair-unified-search">
              <span className="sr-only">Search the Fair</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--app-ink-3)" }} aria-hidden />
                <input
                  id="fair-unified-search"
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setDiscoveryIntent(null);
                  }}
                  placeholder="Search events, food, animals, parking, bags…"
                  className="h-14 w-full rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] pl-11 pr-4 text-[16px] outline-none placeholder:text-[var(--app-ink-3)]"
                  style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
                />
              </span>
            </label>

            {!exploreFocused ? (
              <FairDiscoveryChoices
                items={discoveryItems}
                asOf={partyAsOf}
                selected={null}
                onSelect={(intent) => {
                  setDiscoveryIntent(intent);
                  setQuery("");
                  setScheduleFilter("all");
                  setShowAllSchedule(false);
                  window.requestAnimationFrame(() =>
                    document
                      .getElementById("fair-find-heading")
                      ?.focus({ preventScroll: true }),
                  );
                }}
              />
            ) : null}

            {exploreFocused ? (
            <details className="mt-2 border-b" style={{ borderColor: "var(--app-border)" }}>
              <summary className="tap-44 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                <span>
                  More filters
                  {scheduleFilter !== "all" ? (
                    <span style={{ color: "var(--app-brand-press)" }}>
                      {" "}· {SCHEDULE_FILTERS.find((filter) => filter.id === scheduleFilter)?.label}
                    </span>
                  ) : null}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              </summary>
              <div className="scrollbar-none -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6" aria-label="Filter the Fair program">
                {SCHEDULE_FILTERS.map((filter) => {
                  const active = scheduleFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setScheduleFilter(filter.id);
                        setDiscoveryIntent(null);
                        setShowAllSchedule(true);
                      }}
                      className="tap-44 min-h-11 shrink-0 border-b-[3px] px-0 text-[13px] font-semibold"
                      style={{
                        borderColor: active ? "var(--app-brand)" : "transparent",
                        color: active ? "var(--app-brand-press)" : "var(--app-ink-2)",
                      }}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </details>
            ) : null}

            {contextualAnswers.length > 0 ? (
              <div className="mt-5 rounded-[var(--app-radius-lg)] border px-4 py-3" style={{ borderColor: "var(--app-border)", background: "var(--app-brand-tint-6)" }}>
                <p className="text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-brand-press)" }}>
                  Quick answers
                </p>
                {contextualAnswers.map((answer) => (
                  <details key={answer.id} className="border-b py-1 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
                    <summary className="tap-44 flex min-h-12 cursor-pointer items-center justify-between gap-3 text-[15px] font-semibold">
                      {answer.question}
                      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                    </summary>
                    <p className="pb-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                      {answer.answer}
                    </p>
                  </details>
                ))}
              </div>
            ) : null}

            {exploreFocused ? (
              <>
            <div className="mt-6 border-b pb-3" style={{ borderColor: "var(--app-border-strong)" }}>
              <div>
                <h2 className="text-[22px] font-bold tracking-[-0.03em]">
                  {normalizedQuery
                    ? "Matching events"
                    : discoveryIntent
                      ? fairDiscoveryIntentTitle(discoveryIntent)
                      : showAllSchedule
                        ? "Official program"
                        : "Three good starts"}
                </h2>
                <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-3)" }} aria-live="polite">
                  {matchingSchedule.length} {matchingSchedule.length === 1 ? "match" : "matches"}, sorted by time · Gates {selectedDay?.gateHoursLabel ?? "time not listed"}
                </p>
              </div>
            </div>

            {visibleSchedule.length > 0 ? (
              <ol className="divide-y" style={{ borderColor: "var(--app-border)" }} aria-label="Fair program results">
                {visibleSchedule.map((item) => {
                  const planned = plan.steps.some((step) => step.scheduleItemId === item.id);
                  const place = compactPlaceLabel(item.placeLabel);
                  return (
                    <li key={item.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)_auto] gap-3 py-4">
                      <time className="pt-0.5 text-[13px] font-bold leading-tight tabular-nums" style={{ color: scheduleAccent(item.kind) }}>
                        {item.timeLabel}
                      </time>
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold leading-snug">{item.title}</p>
                        {place ? (
                          <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                            {place}
                          </p>
                        ) : null}
                        {item.detail ? (
                          <button
                            type="button"
                            onClick={() => openProgramDetail(item.id)}
                            className="tap-44 mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold underline underline-offset-4"
                            style={{ color: "var(--app-brand-press)" }}
                            aria-label={`Open details for ${item.title}`}
                          >
                            Details
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        data-fair-plan-toggle={item.id}
                        aria-pressed={planned}
                        onClick={() => toggleFairScheduleItem(item, planned)}
                        className="tap-44 tactile tactile-interactive grid h-11 w-11 place-items-center rounded-full transition active:scale-[0.94]"
                        style={{
                          background: planned ? "var(--app-bg-sunken)" : "var(--app-brand-tint-6)",
                          color: planned ? "var(--app-ink-3)" : "var(--app-brand-press)",
                        }}
                        aria-label={planned ? `Remove ${item.title} from My Day` : `Add ${item.title} to My Day`}
                      >
                        {planned ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="py-10 text-center">
                <p className="text-[17px] font-semibold">Nothing matches that search.</p>
                <p className="mt-2 text-[14px]" style={{ color: "var(--app-ink-3)" }}>
                  Try another word, category, or Fair day.
                </p>
              </div>
            )}

            {!normalizedQuery && matchingSchedule.length > visibleSchedule.length ? (
              <Button
                className="mt-4 w-full"
                variant="secondary"
                onClick={() => {
                  setShowAllSchedule(true);
                  window.requestAnimationFrame(() => {
                    window.scrollTo({ top: 0, behavior: "auto" });
                    document.getElementById("fair-find-heading")?.focus({ preventScroll: true });
                  });
                }}
              >
                {discoveryIntent
                  ? `See all ${matchingSchedule.length} ${fairDiscoveryIntentTitle(discoveryIntent).toLocaleLowerCase()} items`
                  : `Browse full program · ${matchingSchedule.length} items`}
              </Button>
            ) : null}
              </>
            ) : (
              <Button
                className="mt-4 w-full"
                variant="secondary"
                onClick={() => {
                  setShowAllSchedule(true);
                  window.requestAnimationFrame(() => {
                    window.scrollTo({ top: 0, behavior: "auto" });
                    document
                      .getElementById("fair-find-heading")
                      ?.focus({ preventScroll: true });
                  });
                }}
              >
                Browse full program
              </Button>
            )}
          </section>
        ) : null}

        {activeMode === "map" ? (
          <section id={MODE_PANEL_IDS.map} aria-labelledby="fair-grounds-map-heading">
            <FairGroundsMap
              savedStops={mappedPlanStops}
              programItems={discoveryItems.map((item) => ({
                id: item.id,
                title: item.title,
                timeLabel: item.timeLabel,
                placeLabel: item.placeLabel,
              }))}
              onBrowseProgram={() => chooseMode("find")}
            />
            <div className="mx-4 mt-4 border-t pt-3 lg:mx-0" style={{ borderColor: "var(--app-border)" }}>
              <a
                href={data.externalGuide.url}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                Official vendor booths
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          </section>
        ) : null}

        {activeMode === "my-day" ? (
          <section id={MODE_PANEL_IDS["my-day"]} aria-labelledby="fair-my-day-heading">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
                {planStorageState === "available"
                  ? "One plan · kept on this device"
                  : planStorageState === "unavailable"
                    ? "Temporary plan · keep this page open"
                    : "One plan for this visit"}
              </p>
              <FairDayPicker
                dates={data.dates}
                selectedDate={selectedDate}
                onChange={chooseFairDate}
                label="Fair day in My Day"
              />
            </div>
            <div className="mt-1 flex items-start justify-between gap-4">
              <h1 id="fair-my-day-heading" tabIndex={-1} className="text-[34px] font-extrabold leading-[1.02] tracking-[-0.045em] outline-none sm:text-[40px]">
                My Fair Day
              </h1>
              {plannedRows.length > 0 ? (
                <button
                  type="button"
                  aria-pressed={editPlan}
                  onClick={() => setEditPlan((current) => !current)}
                  className="tap-44 inline-flex min-h-11 items-center gap-2 rounded-[var(--app-radius-md)] px-3 text-[13px] font-semibold"
                  style={{ background: editPlan ? "var(--app-brand-tint-6)" : "transparent", color: "var(--app-brand-press)" }}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  {editPlan ? "Done" : "Edit"}
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              One timeline for tickets, arrival, saved stops, and the trip back.
            </p>

            <section
              className="mt-6 overflow-hidden rounded-[var(--app-radius-lg)] border p-4"
              style={{
                borderColor: "var(--app-border-strong)",
                background: "var(--app-bg-elevated-solid)",
                boxShadow: "var(--app-elev-1)",
              }}
              aria-labelledby="fair-journey-heading"
              data-fair-journey
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
                Build your route
              </p>
              <h2 id="fair-journey-heading" className="mt-1 text-[20px] font-bold tracking-[-0.025em]">
                Three moves, then enjoy the Fair.
              </h2>
              <div className="relative mt-4 grid grid-cols-3 gap-2 before:absolute before:left-[16%] before:right-[16%] before:top-[21px] before:h-px before:bg-[var(--app-border-strong)] before:content-['']">
                {[
                  {
                    label: "Tickets + gate",
                    ready: ticketAndGateReady,
                    Icon: TicketCheck,
                    action: () =>
                      openPreparation(
                        plan.readyKeys.includes("ticket") ? "entry" : "ticket",
                      ),
                  },
                  {
                    label: "Getting there",
                    ready: travelReady,
                    Icon: MapPinned,
                    action: () => chooseMode("travel"),
                  },
                  {
                    label: "First stop",
                    ready: firstStopReady,
                    Icon: ListChecks,
                    action: () => chooseMode("find"),
                  },
                ].map(({ label, ready, Icon, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="tap-44 relative z-10 flex min-h-[92px] flex-col items-center rounded-[var(--app-radius-md)] px-1.5 py-2 text-center"
                    aria-label={`${label}: ${ready ? "ready" : "needs attention"}`}
                  >
                    <span
                      className="grid h-11 w-11 place-items-center rounded-full border-2"
                      style={{
                        borderColor: ready
                          ? "var(--app-brand-2)"
                          : "var(--app-brand)",
                        color: ready
                          ? "var(--app-brand-2)"
                          : "var(--app-brand-press)",
                        background: "var(--app-bg-elevated-solid)",
                      }}
                    >
                      {ready ? (
                        <Check className="h-5 w-5" aria-hidden />
                      ) : (
                        <Icon className="h-5 w-5" aria-hidden />
                      )}
                    </span>
                    <span className="mt-2 text-[12px] font-bold leading-tight">
                      {label}
                    </span>
                    <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: ready ? "var(--app-brand-2)" : "var(--app-ink-3)" }}>
                      {ready ? "Ready" : "Open"}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {planNotice ? (
              <p className="mt-4 border-l-2 py-1 pl-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-warning-press)", color: "var(--app-ink-2)" }} role="status">
                {planNotice}
              </p>
            ) : null}

            {plannedRows.length > 0 || selectedArrival ? (
              <ol className="relative mt-7" aria-label="My Fair Day timeline">
                {selectedArrival ? (
                  <li className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b pb-5" style={{ borderColor: "var(--app-border)" }}>
                    <span className="grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold text-[var(--app-on-brand)]" style={{ background: "var(--app-cool)" }}>1</span>
                    <div className="pt-0.5">
                      <p className="text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-cool)" }}>Arrive</p>
                      <p className="mt-1 text-[17px] font-semibold">{selectedArrival.label}</p>
                      <p className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{selectedArrival.paymentLabel}</p>
                    </div>
                  </li>
                ) : null}

                {plannedRows.map(({ item, step }, index) => {
                  const number = index + (selectedArrival ? 2 : 1);
                  const title = item?.title ?? step.labelSnapshot;
                  const place = item ? compactPlaceLabel(item.placeLabel) : null;
                  return (
                    <li key={step.scheduleItemId} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b py-5" style={{ borderColor: "var(--app-border)" }}>
                      <span className="grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold text-[var(--app-on-brand)]" style={{ background: item ? scheduleAccent(item.kind) : "var(--app-warning-press)" }}>{number}</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold tabular-nums" style={{ color: item ? scheduleAccent(item.kind) : "var(--app-warning-press)" }}>
                          {item?.timeLabel ?? step.timeLabelSnapshot ?? "Time not published"}
                        </p>
                        <p className="mt-1 text-[17px] font-semibold leading-snug">{title}</p>
                        {place ? <p className="mt-1 text-[14px]" style={{ color: "var(--app-ink-2)" }}>{place}</p> : null}
                        {editPlan ? (
                          <div className="mt-2 flex items-center gap-1">
                            <button type="button" disabled={index === 0} onClick={() => setPlan((current) => moveFairPlanItemWithinDay(current, step.scheduleItemId, -1, updateTimestamp()))} className="tap-44 grid h-11 w-11 place-items-center rounded-full disabled:opacity-35" aria-label={`Move ${title} earlier`}>
                              <ArrowUp className="h-4 w-4" aria-hidden />
                            </button>
                            <button type="button" disabled={index === plannedRows.length - 1} onClick={() => setPlan((current) => moveFairPlanItemWithinDay(current, step.scheduleItemId, 1, updateTimestamp()))} className="tap-44 grid h-11 w-11 place-items-center rounded-full disabled:opacity-35" aria-label={`Move ${title} later`}>
                              <ArrowDown className="h-4 w-4" aria-hidden />
                            </button>
                            <button type="button" onClick={() => setPlan((current) => removeFairPlanItem(current, step.scheduleItemId, updateTimestamp()))} className="tap-44 grid h-11 w-11 place-items-center rounded-full" style={{ color: "var(--app-brand-press)" }} aria-label={`Remove ${title} from My Day`}>
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}

                {selectedArrival && plannedRows.length === 0 ? (
                  <li
                    className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b py-5"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <span
                      className="grid h-10 w-10 place-items-center rounded-full border-2 bg-[var(--app-bg)]"
                      style={{ borderColor: "var(--app-brand)" }}
                    >
                      <Plus
                        className="h-5 w-5"
                        style={{ color: "var(--app-brand-press)" }}
                        aria-hidden
                      />
                    </span>
                    <div className="pt-0.5">
                      <p
                        className="text-[13px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: "var(--app-brand-press)" }}
                      >
                        At the Fair
                      </p>
                      <p className="mt-1 text-[17px] font-semibold">
                        Give the middle of your day a place to start.
                      </p>
                      <p
                        className="mt-1 text-[14px] leading-relaxed"
                        style={{ color: "var(--app-ink-2)" }}
                      >
                        Save food, a show, an animal event, or a ride. You can
                        change it any time.
                      </p>
                      <Button
                        className="mt-3"
                        variant="secondary"
                        onClick={() => chooseMode("find")}
                        iconRight={
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        }
                      >
                        Find a Fair stop
                      </Button>
                    </div>
                  </li>
                ) : null}

                {selectedArrival ? (
                  <li className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 pt-5">
                    <span className="grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold text-[var(--app-on-brand)]" style={{ background: "var(--app-cool)" }}>{plannedRows.length + 2}</span>
                    <div className="pt-0.5">
                      <p className="text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-cool)" }}>Head back</p>
                      <p className="mt-1 text-[17px] font-semibold">{selectedArrival.returnLabel}</p>
                      <p className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{selectedArrival.returnSummary}</p>
                    </div>
                  </li>
                ) : null}
              </ol>
            ) : null}
          </section>
        ) : null}

        {activeMode === "travel" ? (
          <section id={MODE_PANEL_IDS.travel} aria-labelledby="fair-travel-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => chooseMode("my-day")}
                className="tap-44 -ml-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to My Day
              </button>
              <FairDayPicker
                dates={data.dates}
                selectedDate={selectedDate}
                onChange={chooseFairDate}
                label="Fair day for travel"
              />
            </div>
            <h1 id="fair-travel-heading" tabIndex={-1} className="mt-2 text-[30px] font-extrabold leading-[1.02] tracking-[-0.04em] outline-none sm:text-[40px]">
              Get there and back
            </h1>
            <p className="mt-1 text-[13px] leading-snug sm:text-[15px]" style={{ color: "var(--app-ink-2)" }}>
              Choose how you’ll arrive. Radius shows only what applies.
            </p>
            <FairTravelPanel
              options={data.arrivalOptions}
              selected={selectedArrival}
              selectedDate={selectedDate}
              eventPhase={data.eventPhase}
              ready={plan.readyKeys.includes("travel")}
              onSelect={chooseArrival}
              onReadyChange={changeTravelReadiness}
            />
          </section>
        ) : null}
      </div>

      <div
        data-mobile-action-bar
        className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t lg:hidden"
        style={{
          borderColor: "var(--app-border-strong)",
          background:
            "color-mix(in srgb, var(--app-bg-elevated-solid) 96%, transparent)",
          boxShadow:
            "0 -10px 28px -22px color-mix(in srgb, var(--app-ink) 28%, transparent)",
          backdropFilter: "blur(18px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <nav
          aria-label="Fair Day"
          className="mx-auto grid max-w-screen-md grid-cols-4"
        >
          {FAIR_PRIMARY_MODES.map((mode) => {
            const active =
              activeMode === mode.id ||
              (activeMode === "travel" && mode.id === "my-day");
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => chooseMode(mode.id)}
                aria-label={
                  mode.id === "my-day" && plannedRows.length > 0
                    ? `${mode.label}, ${plannedRows.length} saved`
                    : mode.label
                }
                className="tap-44 relative flex min-h-[64px] flex-col items-center justify-center gap-1 px-2 text-[11px] font-semibold"
                style={{
                  color: active
                    ? "var(--app-brand-press)"
                    : "var(--app-ink-2)",
                  background: active ? "var(--app-brand-tint-6)" : "transparent",
                }}
              >
                <span
                  className="absolute inset-x-4 top-0 h-[3px]"
                  style={{ background: active ? "var(--app-brand)" : "transparent" }}
                  aria-hidden
                />
                <span
                  className="grid h-7 w-10 place-items-center rounded-full"
                  style={{
                    background: active
                      ? "var(--app-brand-tint-14)"
                      : "transparent",
                  }}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span>
                  {mode.label}
                  {mode.id === "my-day" && plannedRows.length > 0 ? (
                    <span className="tabular-nums"> · {plannedRows.length}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <BottomDrawer
        open={activePreparation === "ticket"}
        onOpenChange={(open) =>
          open ? openPreparation("ticket") : setActivePreparation(null)
        }
        title="Tickets"
        subtitle={`Reviewed options for ${fairDateShortLabel(selectedDate)}`}
      >
        <TicketPreparation
          offers={offersForSelectedDate}
          data={{ ...data, reviewedAt: partyAsOf }}
          plan={plan}
          onPartyChange={(party) => setPlan((current) => setFairPlanParty(current, party, updateTimestamp()))}
          onReadyChange={(ready) => setPlan((current) => setFairPlanReady(current, "ticket", ready, updateTimestamp()))}
        />
      </BottomDrawer>

      <BottomDrawer
        open={activePreparation === "entry"}
        onOpenChange={(open) =>
          open ? openPreparation("entry") : setActivePreparation(null)
        }
        title="Entry"
        subtitle="Payment, ticket access, and gate preparation"
      >
        <EntryPreparation
          data={data}
          ready={plan.readyKeys.includes("entry")}
          onReadyChange={(ready) => setPlan((current) => setFairPlanReady(current, "entry", ready, updateTimestamp()))}
        />
      </BottomDrawer>

      <BottomDrawer
        open={programDetailOpen}
        onOpenChange={(open) => {
          if (!open) closeProgramDetail();
        }}
        title={selectedProgramDetail?.title ?? "Program details"}
        subtitle={
          selectedProgramDetail
            ? `${selectedProgramDetail.timeLabel} · ${compactPlaceLabel(selectedProgramDetail.placeLabel) ?? "Place not published"}`
            : undefined
        }
      >
        {selectedProgramDetail ? (
          <div className="px-4 pb-6 sm:px-6">
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {selectedProgramDetail.detail ?? "The Fair has not published more detail for this program item."}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button
                className="w-full sm:w-auto"
                variant={selectedProgramPlanned ? "secondary" : "primary"}
                aria-pressed={selectedProgramPlanned}
                onClick={() =>
                  toggleFairScheduleItem(
                    selectedProgramDetail,
                    selectedProgramPlanned,
                  )
                }
                iconLeft={
                  selectedProgramPlanned ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden />
                  )
                }
              >
                {selectedProgramPlanned ? "Remove from My Day" : "Add to My Day"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                href={selectedProgramDetail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
              >
                Official program source
              </Button>
            </div>
          </div>
        ) : null}
      </BottomDrawer>

      <BottomDrawer
        open={helpOpen}
        onOpenChange={(open) => {
          if (open) openHelp();
          else setHelpOpen(false);
          if (!open) {
            setHelpAnswerId(null);
            setHelpCategory(null);
          }
        }}
        title="Fair help"
        subtitle="Access, parking, family needs, rides, weather, and re-entry"
      >
        <div className="px-4 pb-6 sm:px-6">
          <FairPracticalAnswers
            key={`${helpAnswerId ?? "fair-help"}:${helpCategory ?? "all"}`}
            answers={data.practicalAnswers}
            focusAnswerId={helpAnswerId}
            focusCategory={helpCategory}
          />
          <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
            <p className="text-[14px] font-semibold">{data.source.label}</p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              The pack was checked {data.source.checkedLabel}. {data.source.ageLabel}.
            </p>
            <a href={data.source.sourceUrl} target="_blank" rel="noopener noreferrer" className="tap-44 mt-2 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
              Open the official source
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              iconLeft={<MessageSquare className="h-4 w-4" aria-hidden />}
              onClick={() => {
                setHelpOpen(false);
                window.setTimeout(
                  () => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT)),
                  320,
                );
              }}
            >
              Send Fair feedback
            </Button>
          </div>
        </div>
      </BottomDrawer>
    </article>
  );
}

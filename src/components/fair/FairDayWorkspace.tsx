"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleParking,
  ExternalLink,
  House,
  ListChecks,
  MapPinned,
  MessageSquare,
  Navigation,
  Pencil,
  Plus,
  Search,
  TicketCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import type { FairPlanStatus } from "@/lib/fair/plan-status";
import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback-ui";

import FairPlanStatusRibbon from "./FairPlanStatusRibbon";
import FairPartyPlanner from "./FairPartyPlanner";
import FairPracticalAnswers from "./FairPracticalAnswers";
import FairTravelPanel from "./FairTravelPanel";
import type {
  FairDayArrivalView,
  FairDayOfferView,
  FairDayScheduleItemView,
  FairDayWorkspaceData,
} from "./types";

type FairMode = "now" | "find" | "my-day" | "travel";
type PreparationKey = Extract<FairPlanReadyKey, "ticket" | "entry">;
type ScheduleFilter =
  | "all"
  | "animals"
  | "music"
  | "rides"
  | "food"
  | "services";

const FAIR_MODES: Array<{
  id: FairMode;
  label: string;
  icon: typeof House;
}> = [
  { id: "now", label: "Now", icon: House },
  { id: "find", label: "Find", icon: Search },
  { id: "my-day", label: "My Day", icon: ListChecks },
  { id: "travel", label: "Travel", icon: Navigation },
];

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
  "my-day": "fair-my-day-heading",
  travel: "fair-travel-heading",
};

const MODE_PANEL_IDS: Record<FairMode, string> = {
  now: "fair-now-panel",
  find: "fair-find-panel",
  "my-day": "fair-my-day-panel",
  travel: "fair-travel-panel",
};

/** Keep shared links from the original Fair guide useful after the app redesign. */
export function fairModeFromHash(hash: string): FairMode | null {
  const normalized = hash.replace(/^#/, "").trim().toLocaleLowerCase();
  if (FAIR_MODES.some((mode) => mode.id === normalized)) {
    return normalized as FairMode;
  }
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

function fairWeekdayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${date}T12:00:00Z`));
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
        Tell Radius who is going only if you want a reviewed subtotal. Your counts stay on this device.
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
  const [activePreparation, setActivePreparation] =
    useState<PreparationKey | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
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
  const [showAllSchedule, setShowAllSchedule] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [partyAsOf, setPartyAsOf] = useState(data.reviewedAt);

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
    writeFairPlan(window.localStorage, plan);
  }, [plan, storageReady]);

  useEffect(() => {
    const syncModeFromHash = () => {
      const requested = window.location.hash.slice(1);
      const requestedMode = fairModeFromHash(requested);
      if (!requestedMode) return;

      setActiveMode(requestedMode);
      if (requested === "answers") setHelpOpen(true);
      if (requested === "fair-ready-ticket") setActivePreparation("ticket");
      if (requested === "fair-ready-entry") setActivePreparation("entry");

      const canonicalHash = `#${requestedMode}`;
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(window.history.state, "", canonicalHash);
      }
      window.requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "auto" }),
      );
    };

    syncModeFromHash();
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

  const chooseMode = (mode: FairMode) => {
    setActiveMode(mode);
    window.history.replaceState(window.history.state, "", `#${mode}`);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      document.getElementById(MODE_HEADING_IDS[mode])?.focus({ preventScroll: true });
    });
  };

  const chooseFairDate = (date: string) => {
    setSelectedDate(date);
    setShowAllSchedule(false);
    setPlan((current) =>
      setFairPlanDay(current, `day-${date}`, updateTimestamp()),
    );
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
      setActivePreparation("ticket");
      return;
    }
    if (status.nextAction === "travel") {
      chooseMode("travel");
      return;
    }
    if (status.nextAction === "entry") {
      chooseMode("now");
      setActivePreparation("entry");
      return;
    }
    chooseMode(status.nextAction === "find" ? "find" : "my-day");
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingSchedule = useMemo(
    () =>
      data.scheduleItems
        .filter((item) => item.date === selectedDate)
        .filter((item) => !isScheduleUtilityRow(item))
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
    [data.scheduleItems, normalizedQuery, scheduleFilter, selectedDate],
  );
  const visibleSchedule =
    showAllSchedule || normalizedQuery.length > 0
      ? matchingSchedule
      : matchingSchedule.slice(0, 12);
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
  const selectedDay = data.dates.find((day) => day.date === selectedDate);

  const titleCopy =
    data.eventPhase === "pre-fair"
      ? `Plan ${fairWeekdayLabel(selectedDate)} at the Fair.`
      : data.eventPhase === "fair-day"
        ? "Your Fair day, right now."
        : "Your Fair day, saved.";

  return (
    <article
      data-fair-app
      data-fair-interaction-ready={storageReady ? "true" : "false"}
      className="fair-day-workspace min-h-dvh w-full font-sans"
      style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
    >
      <style>{`
        .fair-day-workspace :is(a, button, input, select, summary, [tabindex]):focus-visible {
          outline: 2px solid var(--app-brand);
          outline-offset: 3px;
        }
        .fair-day-workspace .fair-hero-control:focus-visible {
          outline: 3px solid var(--app-ink-inverse);
          box-shadow: 0 0 0 2px var(--app-ink);
        }
        @media (prefers-reduced-motion: reduce) {
          .fair-day-workspace * { scroll-behavior: auto !important; }
        }
      `}</style>

      <header>
        <div
          className={`relative overflow-hidden border-b-2 transition-[height] duration-300 motion-reduce:transition-none ${
            activeMode === "now"
              ? "h-[238px] sm:h-[280px]"
              : "h-[152px] sm:h-[184px]"
          }`}
          style={{ borderColor: "var(--app-brand)" }}
        >
          <picture className="absolute inset-0 block">
            <source
              media="(min-width: 640px)"
              srcSet="/images/fair/fairgrounds-night-mike-d-1920.jpg"
            />
            <img
              src="/images/fair/fairgrounds-night-mike-d-960.jpg"
              alt="The Great Frederick Fairgrounds glowing at night, seen from above."
              width="960"
              height="640"
              loading="eager"
              fetchPriority="high"
              className="h-full w-full scale-[1.02] object-cover object-[76%_center] sm:object-center"
            />
          </picture>
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, color-mix(in srgb, var(--app-ink) 72%, transparent), transparent 38%), linear-gradient(to top, color-mix(in srgb, var(--app-ink) 94%, transparent), color-mix(in srgb, var(--app-ink) 10%, transparent) 74%)",
            }}
            aria-hidden
          />

          <div className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[68rem] items-center justify-between gap-3 px-3 pt-3 sm:px-5 sm:pt-4">
            <Link
              href="/today"
              className="fair-hero-control tap-44 inline-flex min-h-11 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[13px] font-semibold text-[var(--app-ink-inverse)] [text-shadow:0_1px_3px_rgba(0,0,0,0.72)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Frederick Radius
            </Link>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="fair-hero-control tap-44 inline-flex min-h-11 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[13px] font-semibold text-[var(--app-ink-inverse)] [text-shadow:0_1px_3px_rgba(0,0,0,0.72)]"
            >
              <CircleHelp className="h-4 w-4" aria-hidden />
              Help
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[68rem] px-4 pb-4 text-[var(--app-ink-inverse)] sm:px-6 sm:pb-6">
            {activeMode === "now" ? (
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.11em] opacity-90">
                <RippleMark size={26} />
                Fair Day · Frederick Radius
              </div>
            ) : null}
            <p
              className={`font-extrabold leading-[0.9] tracking-[-0.055em] [text-shadow:0_2px_10px_rgba(0,0,0,0.42)] ${
                activeMode === "now"
                  ? "mt-2 max-w-[13ch] text-[38px] sm:text-[52px]"
                  : "max-w-[20ch] text-[28px] sm:text-[38px]"
              }`}
            >
              {data.eventName}
            </p>
            <p className="mt-2 border-t pt-2 text-[11px] font-bold uppercase tracking-[0.15em] tabular-nums sm:max-w-[26rem]" style={{ borderColor: "color-mix(in srgb, var(--app-ink-inverse) 42%, transparent)" }}>
              Sep 18–26 · 2026
            </p>
          </div>
        </div>
        <p className="mx-auto max-w-[68rem] px-4 py-1 text-right text-[10px] font-medium uppercase tracking-[0.08em] sm:px-6" style={{ color: "var(--app-ink-3)" }}>
          Photograph by Mike D
        </p>

        <nav
          className="mx-auto hidden max-w-[68rem] grid-cols-4 gap-1 border-b px-6 py-2 lg:grid"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          aria-label="Fair Day"
        >
          {FAIR_MODES.map((mode) => {
            const active = activeMode === mode.id;
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

      <FairPlanStatusRibbon
        plan={plan}
        dates={data.dates}
        selectedDate={selectedDate}
        onDateChange={chooseFairDate}
        onNextAction={openPlanNextAction}
      />

      <div className="mx-auto max-w-[48rem] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-12">
        {activeMode === "now" ? (
          <section id={MODE_PANEL_IDS.now} aria-labelledby="fair-now-heading">
            <p className="text-[11px] font-bold uppercase tracking-[0.13em]" style={{ color: "var(--app-brand-press)" }}>
              {data.eventPhaseLabel} · {fairDateShortLabel(selectedDate)}
            </p>
            <h1
              id="fair-now-heading"
              tabIndex={-1}
              className="mt-2 max-w-[42rem] text-[38px] font-extrabold leading-[0.98] tracking-[-0.055em] outline-none sm:text-[46px]"
            >
              {titleCopy}
            </h1>
            <p className="mt-3 max-w-[40rem] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Radius connects the official program with tickets, travel, entry, and the things you save, so you can make one plan instead of hunting across separate sites. Your plan stays on this device.
            </p>

            <div
              className="mt-7 overflow-hidden rounded-[var(--app-radius-xl)] text-[var(--app-ink-inverse)]"
              style={{
                background:
                  "linear-gradient(145deg, color-mix(in srgb, var(--app-ink) 92%, var(--app-accent)), var(--app-ink) 70%)",
                boxShadow: "var(--app-elev-3), inset 0 1px 0 color-mix(in srgb, var(--app-ink-inverse) 14%, transparent)",
              }}
            >
              <div className="px-4 py-4">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{
                    color:
                      "color-mix(in srgb, var(--app-ink-inverse) 70%, transparent)",
                  }}
                >
                  Before you leave
                </p>
                <h2 className="mt-1 text-[22px] font-bold tracking-[-0.025em]">
                  Check the details that can slow you down.
                </h2>

                <div
                  className="mt-3 divide-y border-t"
                  style={{ borderColor: "color-mix(in srgb, var(--app-ink-inverse) 16%, transparent)" }}
                >
                  <button
                    type="button"
                    onClick={() => setActivePreparation("ticket")}
                    className="tap-44 flex min-h-[58px] w-full items-center justify-between gap-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <TicketCheck className="h-5 w-5" style={{ color: "var(--app-amber)" }} aria-hidden />
                      <span>
                        <span className="block text-[15px] font-semibold">Tickets</span>
                        <span className="block text-[13px]" style={{ color: "color-mix(in srgb, var(--app-ink-inverse) 68%, transparent)" }}>
                          {plan.readyKeys.includes("ticket") ? "Handled" : "Compare or mark ready"}
                        </span>
                      </span>
                    </span>
                    {plan.readyKeys.includes("ticket") ? <Check className="h-5 w-5" style={{ color: "var(--app-amber)" }} aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseMode("travel")}
                    className="tap-44 flex min-h-[58px] w-full items-center justify-between gap-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <Navigation className="h-5 w-5" style={{ color: "var(--app-cool-2)" }} aria-hidden />
                      <span>
                        <span className="block text-[15px] font-semibold">Travel</span>
                        <span className="block text-[13px]" style={{ color: "color-mix(in srgb, var(--app-ink-inverse) 68%, transparent)" }}>
                          {plan.readyKeys.includes("travel")
                            ? "Travel and return marked ready"
                            : selectedArrival
                              ? `${selectedArrival.label} selected; finish the plan`
                              : "Choose drive, transit, or drop-off"}
                        </span>
                      </span>
                    </span>
                    {plan.readyKeys.includes("travel") ? <Check className="h-5 w-5" style={{ color: "var(--app-amber)" }} aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePreparation("entry")}
                    className="tap-44 flex min-h-[58px] w-full items-center justify-between gap-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <CircleParking className="h-5 w-5" style={{ color: "var(--app-amber)" }} aria-hidden />
                      <span>
                        <span className="block text-[15px] font-semibold">Entry</span>
                        <span className="block text-[13px]" style={{ color: "color-mix(in srgb, var(--app-ink-inverse) 68%, transparent)" }}>
                          {plan.readyKeys.includes("entry") ? "Payment and ticket access ready" : "Payment, gate, and ticket access"}
                        </span>
                      </span>
                    </span>
                    {plan.readyKeys.includes("entry") ? <Check className="h-5 w-5" style={{ color: "var(--app-amber)" }} aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
                  </button>
                </div>

              </div>
            </div>

            <div className="mt-6 divide-y border-y" style={{ borderColor: "var(--app-border-strong)" }}>
              <button
                type="button"
                onClick={() => chooseMode("find")}
                className="tap-44 flex min-h-[68px] w-full items-center justify-between gap-3 py-3 text-left"
              >
                <span>
                  <span className="block text-[15px] font-semibold">Find things to do</span>
                  <span className="mt-1 block text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                    {data.scheduleItems.filter((item) => item.date === selectedDate && !isScheduleUtilityRow(item)).length} program items this day
                  </span>
                </span>
                <Search className="h-5 w-5" style={{ color: "var(--app-brand-press)" }} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => chooseMode("my-day")}
                className="tap-44 flex min-h-[68px] w-full items-center justify-between gap-3 py-3 text-left"
              >
                <span>
                  <span className="block text-[15px] font-semibold">My Day</span>
                  <span className="mt-1 block text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                    {plannedRows.length === 0 ? "Nothing saved yet" : `${plannedRows.length} saved ${plannedRows.length === 1 ? "stop" : "stops"}`}
                  </span>
                </span>
                <CalendarDays className="h-5 w-5" style={{ color: "var(--app-cool)" }} aria-hidden />
              </button>
            </div>

            <p className="mt-6 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              {data.disclosure} {data.source.label}. {data.source.ageLabel}.
              {" "}
              <a href={data.source.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4" style={{ color: "var(--app-brand-press)" }}>
                Official source
              </a>
            </p>
          </section>
        ) : null}

        {activeMode === "find" ? (
          <section id={MODE_PANEL_IDS.find} aria-labelledby="fair-find-heading">
            <p className="text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
              {fairDateShortLabel(selectedDate)}
            </p>
            <h1 id="fair-find-heading" tabIndex={-1} className="mt-1 text-[34px] font-extrabold leading-[1.02] tracking-[-0.045em] outline-none sm:text-[40px]">
              Find your Fair
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Search the reviewed program and save what you do not want to miss.
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
                    setShowAllSchedule(false);
                  }}
                  placeholder="Search events, food, animals, parking, bags…"
                  className="h-14 w-full rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] pl-11 pr-4 text-[16px] outline-none placeholder:text-[var(--app-ink-3)]"
                  style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
                />
              </span>
            </label>

            <div className="scrollbar-none -mx-4 mt-2 flex gap-5 overflow-x-auto px-4 sm:-mx-6 sm:px-6" aria-label="Filter the Fair program">
              {SCHEDULE_FILTERS.map((filter) => {
                const active = scheduleFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setScheduleFilter(filter.id);
                      setShowAllSchedule(false);
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

            <div className="mt-6 flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border-strong)" }}>
              <div>
                <h2 className="text-[22px] font-bold tracking-[-0.03em]">Program</h2>
                <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-3)" }} aria-live="polite">
                  {matchingSchedule.length} {matchingSchedule.length === 1 ? "match" : "matches"}, sorted by time
                </p>
              </div>
              <div className="flex flex-col items-end">
                <a
                  href={data.externalGuide.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold"
                  style={{ color: "var(--app-cool)" }}
                >
                  <MapPinned className="h-4 w-4" aria-hidden />
                  Vendor map
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
                <span className="text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
                  Gates {selectedDay?.gateHoursLabel ?? "time not listed"}
                </span>
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
                          <details className="mt-1.5">
                            <summary className="tap-44 inline-flex min-h-11 cursor-pointer items-center text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                              Official wording
                            </summary>
                            <p className="pb-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                              {item.detail}
                            </p>
                          </details>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={planned}
                        onClick={() => setPlan((current) => addFairPlanItem(current, item.sourceItem, updateTimestamp()))}
                        className="tap-44 grid h-11 w-11 place-items-center rounded-full disabled:opacity-55"
                        style={{
                          background: planned ? "var(--app-bg-sunken)" : "var(--app-brand-tint-6)",
                          color: planned ? "var(--app-ink-3)" : "var(--app-brand-press)",
                        }}
                        aria-label={planned ? `${item.title} is in My Day` : `Add ${item.title} to My Day`}
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

            {!showAllSchedule && !normalizedQuery && matchingSchedule.length > visibleSchedule.length ? (
              <Button className="mt-4 w-full" variant="secondary" onClick={() => setShowAllSchedule(true)}>
                Show all {matchingSchedule.length} program items
              </Button>
            ) : null}
          </section>
        ) : null}

        {activeMode === "my-day" ? (
          <section id={MODE_PANEL_IDS["my-day"]} aria-labelledby="fair-my-day-heading">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                  {fairDateShortLabel(selectedDate)}
                </p>
                <h1 id="fair-my-day-heading" tabIndex={-1} className="mt-1 text-[34px] font-extrabold leading-[1.02] tracking-[-0.045em] outline-none sm:text-[40px]">
                  My Fair Day
                </h1>
              </div>
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

            {planNotice ? (
              <p className="mt-4 border-l-2 py-1 pl-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-warning-press)", color: "var(--app-ink-2)" }} role="status">
                {planNotice}
              </p>
            ) : null}

            {plannedRows.length === 0 && !selectedArrival ? (
              <div className="relative mt-8 border-l-2 py-2 pl-6" style={{ borderColor: "var(--app-brand)" }}>
                <span className="absolute -left-[7px] top-2 h-3 w-3 rounded-full border-2 bg-[var(--app-bg)]" style={{ borderColor: "var(--app-brand)" }} aria-hidden />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
                  First stop
                </p>
                <h2 className="mt-2 max-w-[24rem] text-[22px] font-bold leading-tight">Choose one thing you do not want to miss.</h2>
                <p className="mt-2 max-w-[28rem] text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  Add an event and Radius will build your Fair timeline here.
                </p>
                <Button className="mt-5" onClick={() => chooseMode("find")} iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}>
                  Find Fair events
                </Button>
              </div>
            ) : (
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
            )}
          </section>
        ) : null}

        {activeMode === "travel" ? (
          <section id={MODE_PANEL_IDS.travel} aria-labelledby="fair-travel-heading">
            <p className="text-[13px] font-semibold" style={{ color: "var(--app-cool)" }}>
              {fairDateShortLabel(selectedDate)}
            </p>
            <h1 id="fair-travel-heading" tabIndex={-1} className="mt-1 text-[34px] font-extrabold leading-[1.02] tracking-[-0.045em] outline-none sm:text-[40px]">
              Get there and back
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Choose one way to arrive. Radius will show only the facts and tools that apply to it.
            </p>
            <FairTravelPanel
              options={data.arrivalOptions}
              selected={selectedArrival}
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
          borderColor: "color-mix(in srgb, var(--app-ink-inverse) 15%, transparent)",
          background: "var(--app-ink)",
          boxShadow:
            "0 -10px 28px -22px color-mix(in srgb, var(--app-ink) 75%, transparent)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <nav
          aria-label="Fair Day"
          className="mx-auto grid max-w-screen-md grid-cols-4"
        >
          {FAIR_MODES.map((mode) => {
            const active = activeMode === mode.id;
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
                    ? "var(--app-ink-inverse)"
                    : "color-mix(in srgb, var(--app-ink-inverse) 62%, transparent)",
                }}
              >
                <span
                  className="absolute inset-x-4 top-0 h-[3px]"
                  style={{ background: active ? "var(--app-brand)" : "transparent" }}
                  aria-hidden
                />
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
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
        onOpenChange={(open) => setActivePreparation(open ? "ticket" : null)}
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
        onOpenChange={(open) => setActivePreparation(open ? "entry" : null)}
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
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Fair help"
        subtitle="Parking, bags, children, rides, weather, and re-entry"
      >
        <div className="px-4 pb-6 sm:px-6">
          <FairPracticalAnswers answers={data.practicalAnswers} />
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

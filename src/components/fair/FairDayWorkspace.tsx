"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  CircleParking,
  ExternalLink,
  Flag,
  ListChecks,
  Plus,
  Search,
  TicketCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import RippleMark from "@/components/brand/RippleMark";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import {
  MobileActionBar,
  barCellClass,
} from "@/components/ui/MobileActionBar";
import {
  addFairPlanItem,
  moveFairPlanItem,
  readFairPlan,
  reconcileFairPlan,
  removeFairPlanItem,
  setFairPlanArrivalChoice,
  setFairPlanDay,
  setFairPlanParty,
  setFairPlanReady,
  toggleFairPlanOffer,
  writeFairPlan,
  type FairPlan,
  type FairPlanReadyKey,
} from "@/lib/fair/plan";
import type { FairParty, FairPartyOffer } from "@/lib/fair/party-plan";

import FairPartyPlanner from "./FairPartyPlanner";
import FairCarMemoryPanel from "./FairCarMemoryPanel";
import FairPracticalAnswers from "./FairPracticalAnswers";
import type {
  FairDayArrivalView,
  FairDayOfferView,
  FairDayScheduleItemView,
  FairDayWorkspaceData,
} from "./types";

type FairDayReadyKey = FairPlanReadyKey;
type FairDaySectionKey = "now" | "find" | "plan" | "leave";
type FairDayFocusTarget = FairDaySectionKey | "answers";

const FAIR_SECTION_HEADING_IDS: Record<FairDayFocusTarget, string> = {
  now: "fair-ready-heading",
  find: "fair-find-heading",
  plan: "fair-plan-heading",
  leave: "fair-leave-heading",
  answers: "fair-practical-heading",
};

const FAIR_DAY_READY_KEYS: FairDayReadyKey[] = [
  "ticket",
  "arrival",
  "entry",
  "return",
];

function updateTimestamp(): string {
  return new Date().toISOString();
}

function chooseOnlyOffer(plan: FairPlan, offerId: string): FairPlan {
  const now = updateTimestamp();
  let next = plan;
  for (const consideredId of plan.consideredOfferIds) {
    if (consideredId !== offerId) {
      next = toggleFairPlanOffer(next, consideredId, now);
    }
  }
  return next.consideredOfferIds.includes(offerId)
    ? next
    : toggleFairPlanOffer(next, offerId, now);
}

const READY_STEPS: Array<{
  key: FairDayReadyKey;
  label: string;
  shortLabel: string;
  icon: typeof TicketCheck;
}> = [
  { key: "ticket", label: "Ticket or deal", shortLabel: "Ticket", icon: TicketCheck },
  { key: "arrival", label: "Arrival and parking", shortLabel: "Arrival", icon: CarFront },
  { key: "entry", label: "Entry and payment", shortLabel: "Entry", icon: Flag },
  { key: "return", label: "Return plan", shortLabel: "Return", icon: CircleParking },
];

function readyAccent(key: FairDayReadyKey): string {
  return key === "arrival" || key === "return"
    ? "var(--app-cool)"
    : "var(--app-brand-press)";
}

function scheduleAccent(kind: FairDayScheduleItemView["kind"]): string {
  if (kind === "agriculture" || kind === "animal") return "var(--app-brand-2)";
  if (kind === "service") return "var(--app-cool)";
  if (kind === "concert") return "var(--app-accent-press)";
  return "var(--app-brand-press)";
}

function fairDateShortLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function OfferChoice({
  offer,
  selected,
  onSelect,
}: {
  offer: FairDayOfferView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className="tactile-interactive min-h-[76px] w-[15rem] shrink-0 snap-start cursor-pointer border-l-2 px-3 py-2.5 text-left transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--app-brand)] motion-reduce:transition-none"
      style={{
        borderColor: selected ? "var(--app-brand-press)" : "var(--app-border)",
        background: selected
          ? "color-mix(in srgb, var(--app-brand) 8%, var(--app-bg-elevated))"
          : "var(--app-bg-elevated)",
      }}
    >
      <input
        className="sr-only"
        type="radio"
        name="fair-ticket-choice"
        checked={selected}
        onChange={onSelect}
      />
      <span className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          {offer.label}
        </span>
        <strong className="shrink-0 text-[16px] tabular-nums" style={{ color: "var(--app-brand-press)" }}>
          {offer.priceLabel}
        </strong>
      </span>
      <span className="mt-1.5 line-clamp-2 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        {offer.detail}
      </span>
    </label>
  );
}

function ArrivalChoice({
  option,
  selected,
  onSelect,
}: {
  option: FairDayArrivalView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className="tactile-interactive min-h-[72px] w-[14rem] shrink-0 snap-start cursor-pointer border-l-2 px-3 py-2.5 text-left transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--app-cool)] motion-reduce:transition-none"
      style={{
        borderColor: selected ? "var(--app-cool)" : "var(--app-border)",
        background: selected
          ? "color-mix(in srgb, var(--app-cool) 8%, var(--app-bg-elevated))"
          : "var(--app-bg-elevated)",
      }}
    >
      <input
        className="sr-only"
        type="radio"
        name="fair-arrival-choice"
        checked={selected}
        onChange={onSelect}
      />
      <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
        {option.label}
      </span>
      <span className="mt-1.5 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        {option.paymentLabel}
      </span>
    </label>
  );
}

function ReadyPanel({
  activeKey,
  ready,
  offers,
  partyOffers,
  party,
  selectedDate,
  partyAsOf,
  onPartyChange,
  selectedOffer,
  onSelectOffer,
  arrivals,
  selectedArrival,
  onSelectArrival,
  entrySummary,
  entryDetail,
  ticketWalletHelpUrl,
  offerContextLabel,
  offerNotice,
  onToggleReady,
  onChooseArrival,
}: {
  activeKey: FairDayReadyKey;
  ready: boolean;
  offers: FairDayOfferView[];
  partyOffers: readonly FairPartyOffer[];
  party: FairParty;
  selectedDate: string;
  partyAsOf: string;
  onPartyChange: (party: FairParty) => void;
  selectedOffer: FairDayOfferView | null;
  onSelectOffer: (id: string) => void;
  arrivals: FairDayArrivalView[];
  selectedArrival: FairDayArrivalView | null;
  onSelectArrival: (id: string) => void;
  entrySummary: string;
  entryDetail: string;
  ticketWalletHelpUrl: string;
  offerContextLabel: string;
  offerNotice: string | null;
  onToggleReady: () => void;
  onChooseArrival: () => void;
}) {
  const accent = readyAccent(activeKey);
  const [showTicketPlanner, setShowTicketPlanner] = useState(false);
  const incompleteActionLabel: Record<FairDayReadyKey, string> = {
    ticket: "Tickets handled",
    arrival: "Arrival chosen",
    entry: "Entry prepared",
    return: "Return plan set",
  };
  const readyAction = (
    <Button
      className="w-full sm:w-auto"
      aria-pressed={ready}
      onClick={onToggleReady}
      iconLeft={ready ? <Check className="fair-day-check h-4 w-4" aria-hidden /> : undefined}
      style={{ backgroundColor: accent, color: "var(--app-on-brand)" }}
    >
      {ready ? "Ready" : incompleteActionLabel[activeKey]}
    </Button>
  );

  if (activeKey === "ticket") {
    const reviewedBaseOffers = offers.filter(
      (offer) => offer.placement !== "eligibility-promotion",
    );
    const eligibilityOffers = offers.filter(
      (offer) => offer.placement === "eligibility-promotion",
    );
    const partyCount =
      party.adults11Plus +
      party.children10Under +
      party.adultRiders +
      party.childRiders;
    const plannerVisible =
      showTicketPlanner || partyCount > 0 || selectedOffer !== null;
    return (
      <div id="fair-ready-ticket" aria-labelledby="fair-ready-ticket-heading">
        <h3 id="fair-ready-ticket-heading" className="text-[17px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          What do you need for tickets?
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          Use the calculator only if you still need to choose admission or ride coverage.
        </p>
        <div className="mt-3 grid gap-2 min-[360px]:grid-cols-2">
          <Button
            className="w-full"
            variant={plannerVisible ? "primary" : "secondary"}
            aria-pressed={plannerVisible}
            onClick={() => setShowTicketPlanner(true)}
            iconLeft={<TicketCheck className="h-4 w-4" aria-hidden />}
          >
            Compare ticket options
          </Button>
          {!ready ? (
            <Button
              className="w-full"
              variant="secondary"
              onClick={onToggleReady}
              iconLeft={<Check className="h-4 w-4" aria-hidden />}
            >
              Tickets are handled
            </Button>
          ) : readyAction}
        </div>
        {plannerVisible ? (
          <>
            <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              {offerContextLabel}
            </p>
            {offerNotice ? (
          <p
            className="mt-2 border-l-2 pl-3 text-[12px] leading-relaxed"
            style={{
              borderColor: "var(--app-warning-press)",
              color: "var(--app-ink-2)",
            }}
            role="status"
          >
            {offerNotice}
          </p>
            ) : null}
            <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
              <FairPartyPlanner
                party={party}
                date={selectedDate}
                asOf={partyAsOf}
                offers={partyOffers}
                onPartyChange={onPartyChange}
              />
            </div>
            {offers.length > 0 ? (
          <>
            <div className="mt-5" role="radiogroup" aria-label="Official ticket and deal options">
              {reviewedBaseOffers.length > 0 ? (
                <>
                  <h4 className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    Reviewed ticket details
                  </h4>
                  <div className="scrollbar-none -mx-1 mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                    {reviewedBaseOffers.map((offer) => (
                      <OfferChoice
                        key={offer.id}
                        offer={offer}
                        selected={offer.id === selectedOffer?.id}
                        onSelect={() => onSelectOffer(offer.id)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
              {eligibilityOffers.length > 0 ? (
                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                  <h4 className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    Eligibility promotions
                  </h4>
                  <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                    These are not included in the party subtotal because their age, identification, item, or arrival-time conditions were not entered.
                  </p>
                  <div className="scrollbar-none -mx-1 mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                    {eligibilityOffers.map((offer) => (
                      <OfferChoice
                        key={offer.id}
                        offer={offer}
                        selected={offer.id === selectedOffer?.id}
                        onSelect={() => onSelectOffer(offer.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {selectedOffer ? (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
                      You selected {selectedOffer.label}. The official price shown here is {selectedOffer.priceLabel}.
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                      {selectedOffer.detail}
                    </p>
                    {selectedOffer.deadlineLabel ? (
                      <p className="mt-2 text-[12px] font-semibold leading-relaxed" style={{ color: "var(--app-brand-press)" }}>
                        {selectedOffer.deadlineLabel}
                      </p>
                    ) : null}
                  </div>
                  <TicketCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} aria-hidden />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  {readyAction}
                  <Button
                    href={selectedOffer.officialPurchaseUrl ?? selectedOffer.officialInfoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
                  >
                    {selectedOffer.officialPurchaseUrl ? "Continue to Etix" : "Open official details"}
                  </Button>
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                  Radius opens the official page. Radius does not sell or hold tickets or confirm availability.
                </p>
              </div>
            ) : null}
          </>
            ) : (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            No reviewed ticket option is available yet. Use the official Fair source before buying.
          </p>
            )}
          </>
        ) : null}
      </div>
    );
  }

  if (activeKey === "arrival") {
    return (
      <div id="fair-ready-arrival" aria-labelledby="fair-ready-arrival-heading">
        <h3 id="fair-ready-arrival-heading" className="text-[17px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Choose how you plan to arrive.
        </h3>
        {arrivals.length > 0 ? (
          <>
            <div
              role="radiogroup"
              aria-label="Reviewed arrival options"
              className="scrollbar-none -mx-1 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
            >
              {arrivals.map((option) => (
                <ArrivalChoice
                  key={option.id}
                  option={option}
                  selected={option.id === selectedArrival?.id}
                  onSelect={() => onSelectArrival(option.id)}
                />
              ))}
            </div>
            {selectedArrival ? (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
                  {selectedArrival.label}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {selectedArrival.summary}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {readyAction}
                  <Button
                    href={selectedArrival.officialInfoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="quiet"
                    iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
                  >
                    Check the official visit page
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            No reviewed arrival option is available yet.
          </p>
        )}
      </div>
    );
  }

  if (activeKey === "entry") {
    return (
      <div id="fair-ready-entry" aria-labelledby="fair-ready-entry-heading">
        <h3 id="fair-ready-entry-heading" className="text-[17px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Prepare for the entrance.
        </h3>
        <p className="mt-3 text-[15px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
          {entrySummary}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {entryDetail}
        </p>
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          If Etix issues your order as mobile or print-at-home tickets, its wallet guide explains how to prepare eligible tickets for access without service.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          {readyAction}
          <Button
            href={ticketWalletHelpUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="quiet"
            iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
          >
            Prepare Etix tickets
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div id="fair-ready-return" aria-labelledby="fair-ready-return-heading">
      <h3 id="fair-ready-return-heading" className="text-[17px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
        Set the way back before you enter.
      </h3>
      {selectedArrival ? (
        <>
          <p className="mt-3 text-[15px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            {selectedArrival.returnLabel}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {selectedArrival.returnSummary}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Choose an arrival option before setting the return point.
        </p>
      )}
      <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Fair Day does not estimate travel time inside the Fairgrounds in this version.
      </p>
      {selectedArrival ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          {readyAction}
          <Button href="#fair-car-memory" variant="secondary" iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}>
            Save where I parked
          </Button>
        </div>
      ) : (
        <Button
          href="#now"
          className="mt-4 w-full sm:w-auto"
          variant="secondary"
          onClick={onChooseArrival}
          iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}
        >
          Choose arrival first
        </Button>
      )}
    </div>
  );
}

export default function FairDayWorkspace({ data }: { data: FairDayWorkspaceData }) {
  const validDates = useMemo(() => new Set(data.dates.map((day) => day.date)), [data.dates]);
  const scheduleById = useMemo(
    () => new Map(data.scheduleItems.map((item) => [item.id, item])),
    [data.scheduleItems],
  );
  const sourceScheduleItems = useMemo(
    () => data.scheduleItems.map((item) => item.sourceItem),
    [data.scheduleItems],
  );
  const [activeReadyKey, setActiveReadyKey] = useState<FairDayReadyKey>("ticket");
  const [selectedDate, setSelectedDate] = useState(
    data.initialPlan.selectedDayId?.replace(/^day-/, "") ??
      (validDates.has(data.initialDate) ? data.initialDate : (data.dates[0]?.date ?? "")),
  );
  const [selectedOfferId, setSelectedOfferId] = useState(
    data.initialPlan.consideredOfferIds[0] ?? "",
  );
  const [selectedArrivalId, setSelectedArrivalId] = useState(
    data.arrivalOptions.find(
      (option) => option.planChoice === data.initialPlan.arrivalChoice,
    )?.id ?? "",
  );
  const [plan, setPlan] = useState<FairPlan>(data.initialPlan);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [activeSection, setActiveSection] = useState<FairDaySectionKey>("now");
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
  const selectedOffer =
    offersForSelectedDate.find((offer) => offer.id === selectedOfferId) ?? null;
  const savedOfferOutsideSelectedDate =
    selectedOfferId.length > 0 &&
    selectedOffer === null &&
    data.offers.some((offer) => offer.id === selectedOfferId);
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
          } changed in the official program. Radius kept the saved snapshot for review.`,
        );
      }
      if (reconciled.plan.selectedDayId) {
        const restoredDate = reconciled.plan.selectedDayId.replace(/^day-/, "");
        if (validDates.has(restoredDate)) setSelectedDate(restoredDate);
      }
      const restoredOfferId = reconciled.plan.consideredOfferIds.find((id) =>
        data.offers.some((offer) => offer.id === id),
      );
      if (restoredOfferId) setSelectedOfferId(restoredOfferId);
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
    data.offers,
    data.packRevision,
    sourceScheduleItems,
    validDates,
  ]);

  useEffect(() => {
    if (!storageReady) return;
    writeFairPlan(window.localStorage, plan);
  }, [plan, storageReady]);

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

  useEffect(() => {
    const syncSectionFromHash = () => {
      const target = window.location.hash.slice(1);
      if (["now", "find", "plan", "leave"].includes(target)) {
        setActiveSection(target as FairDaySectionKey);
      }
    };
    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  useEffect(() => {
    const sectionIds: FairDaySectionKey[] = ["now", "find", "plan", "leave"];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const nearest = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top) -
              Math.abs(right.boundingClientRect.top),
          )[0];
        if (nearest) setActiveSection(nearest.target.id as FairDaySectionKey);
      },
      { rootMargin: "-18% 0px -66% 0px", threshold: [0, 0.01] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingSchedule = data.scheduleItems.filter((item) => {
    if (selectedDate && item.date !== selectedDate) return false;
    if (!normalizedQuery) return true;
    return `${item.title} ${item.timeLabel} ${item.placeLabel}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const plannedRows = plan.steps.map((step) => ({
    step,
    item: scheduleById.get(step.scheduleItemId) ?? null,
  }));
  const readyCount = plan.readyKeys.length;
  const setStopCount = plannedRows.length + (selectedArrival ? 2 : 0);
  const firstDate = data.dates[0]?.date ?? data.initialDate;
  const lastDate = data.dates.at(-1)?.date ?? firstDate;
  const datePlateMonth = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${firstDate}T12:00:00Z`));
  const datePlateDays = `${Number(firstDate.slice(-2))}–${Number(lastDate.slice(-2))}`;
  const heroAction =
    data.eventPhase === "fair-day"
      ? { href: "#find", label: "See today’s program", target: "find" as const }
      : data.eventPhase === "pre-fair"
        ? { href: "#now", label: "Choose your Fair day", target: "now" as const }
        : {
            href: "#answers",
            label: "Review Fair details",
            target: "answers" as const,
          };

  const chooseFairDate = (date: string) => {
    setSelectedDate(date);
    setPlan((current) =>
      setFairPlanDay(current, `day-${date}`, updateTimestamp()),
    );
  };

  const focusFairSection = (target: FairDayFocusTarget) => {
    if (target !== "answers") setActiveSection(target);
    window.requestAnimationFrame(() => {
      document
        .getElementById(FAIR_SECTION_HEADING_IDS[target])
        ?.focus({ preventScroll: true });
    });
  };

  return (
    <article
      className="fair-day-workspace relative mx-auto w-full max-w-[48rem] overflow-clip font-sans"
      style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
    >
      <style>{`
        @keyframes fr-fair-route-in {
          from { opacity: 0; transform: scaleY(0); }
          to { opacity: 1; transform: scaleY(1); }
        }
        @keyframes fr-fair-check-in {
          0% { opacity: 0; transform: scale(.55) rotate(-18deg); }
          72% { opacity: 1; transform: scale(1.12) rotate(2deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        .fair-day-route-line {
          transform-origin: top;
          animation: fr-fair-route-in 520ms var(--app-ease-out) both;
        }
        .fair-day-check {
          animation: fr-fair-check-in 260ms var(--app-ease-spring) both;
        }
        .fair-day-workspace :is(a, button, input, select, summary, [tabindex]):focus {
          scroll-margin-top: calc(var(--app-topbar-h, 56px) + 16px);
          scroll-margin-bottom: calc(var(--app-bottomnav-reserve, 68px) + 24px);
        }
        @media (prefers-reduced-motion: reduce) {
          .fair-day-route-line,
          .fair-day-check {
            animation: none;
          }
        }
      `}</style>

      <header className="relative overflow-hidden border-b px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6" style={{ borderColor: "var(--app-border)" }}>
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <RippleMark size={52} tile />
            <div className="min-w-0">
              <p className="text-[19px] font-bold leading-none tracking-[-0.035em]">Fair Day</p>
              <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--app-ink-2)" }}>
                by Frederick Radius
              </p>
            </div>
          </div>
          <div
            className="grid min-h-[72px] min-w-[74px] shrink-0 place-items-center px-2 py-2 text-center"
            style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.16em]">{datePlateMonth}</span>
            <strong className="text-[19px] leading-none tabular-nums">{datePlateDays}</strong>
            <span className="text-[11px] font-semibold tabular-nums">{data.yearLabel}</span>
          </div>
        </div>

        <figure className="relative -mx-4 mt-5 sm:-mx-6 sm:mt-6">
          <div className="relative h-[170px] overflow-hidden sm:aspect-[2/1] sm:h-auto">
            <picture className="absolute inset-0 block">
              <source
                media="(min-width: 640px)"
                srcSet="/images/fair/fairgrounds-night-mike-d-1920.jpg"
              />
              {/* Pre-optimized local art direction avoids runtime image transforms. */}
              <img
                src="/images/fair/fairgrounds-night-mike-d-960.jpg"
                alt="The Great Frederick Fairgrounds glowing at night, seen from above."
                width="960"
                height="640"
                loading="eager"
                fetchPriority="high"
                className="h-full w-full object-cover object-[76%_center] sm:object-center"
              />
            </picture>
            <a
              href="/images/fair/fairgrounds-night-mike-d-1920.jpg"
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44 absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-1.5 px-3 text-[11.5px] font-semibold shadow-[var(--app-elev-1)]"
              style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}
            >
              View full panorama
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
          <figcaption
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-2 text-[11.5px] leading-relaxed sm:px-6"
            style={{
              background: "var(--app-bg-elevated)",
              borderColor: "var(--app-border)",
              color: "var(--app-ink-3)",
            }}
          >
            <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Photo: Mike D</span>
            <span>Fair atmosphere from a prior visit. This image is not a current map.</span>
          </figcaption>
        </figure>

        <div className="relative mt-7 max-w-[34rem]">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
            {data.eventName} · {data.dateRangeLabel}
          </p>
          <h1 className="mt-2 font-editorial text-[40px] font-normal leading-[0.98] tracking-[-0.035em] sm:text-[48px]">
            Ready before you leave.
          </h1>
          <p className="mt-4 max-w-[32rem] text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {data.disclosure}
          </p>
          <a
            href={heroAction.href}
            onClick={() => focusFairSection(heroAction.target)}
            className="tap-44 mt-4 inline-flex min-h-11 items-center justify-center gap-2 px-4 text-[13px] font-bold"
            style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
          >
            {heroAction.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </a>
        </div>

      </header>

      <div className="space-y-12 px-4 pb-12 pt-6 sm:px-6" id="fair-day-content">
        <section id="now" aria-labelledby="fair-ready-heading" className="scroll-mt-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Chip tone={data.eventPhase === "fair-day" ? "warning" : "neutral"} className="text-[11px]">
                  {data.eventPhaseLabel}
                </Chip>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-ink-3)" }} aria-live="polite">
                  {readyCount} of {FAIR_DAY_READY_KEYS.length} ready
                </span>
              </div>
              <h2 id="fair-ready-heading" tabIndex={-1} className="mt-2 text-[25px] font-bold leading-tight tracking-[-0.035em] outline-none">
                Ready to Go
              </h2>
            </div>
            <ListChecks className="h-6 w-6" style={{ color: "var(--app-brand-press)" }} aria-hidden />
          </div>

          <label
            className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-y px-1 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <span
              className="row-span-2 grid h-10 w-10 place-items-center rounded-full"
              style={{
                background: "var(--app-bg-sunken)",
                color: "var(--app-brand-press)",
              }}
              aria-hidden
            >
              <CalendarDays className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
              Choose your Fair day
            </span>
            <select
              value={selectedDate}
              onChange={(event) => chooseFairDate(event.target.value)}
              className="h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 text-[13px] font-semibold outline-none focus:border-[var(--app-brand)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--app-brand)_20%,transparent)]"
              style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
              aria-describedby="fair-date-picker-support"
            >
              {data.dates.map((day) => (
                <option key={day.date} value={day.date}>
                  {fairDateShortLabel(day.date)} · gates {day.gateHoursLabel}
                </option>
              ))}
            </select>
            <span id="fair-date-picker-support" className="col-start-2 text-[10.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Ticket options and program times update together.
            </span>
          </label>

          <ol className="mt-4 grid grid-cols-4 border-y" style={{ borderColor: "var(--app-border)" }} aria-label="Ready to Go checks">
            {READY_STEPS.map((step, index) => {
              const active = activeReadyKey === step.key;
              const complete = plan.readyKeys.includes(step.key);
              const accent = readyAccent(step.key);
              const Icon = step.icon;
              return (
                <li key={step.key} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setActiveReadyKey(step.key)}
                    aria-current={active ? "step" : undefined}
                    aria-label={`${index + 1}. ${step.label}${complete ? ", ready" : ""}`}
                    className="relative flex min-h-[66px] w-full flex-col items-center justify-center gap-1 border-b-2 px-1 py-2 text-center transition-colors motion-reduce:transition-none"
                    style={{
                      borderColor: active ? accent : "transparent",
                      color: active ? "var(--app-ink)" : "var(--app-ink-3)",
                      background: active
                        ? `color-mix(in srgb, ${accent} 6%, transparent)`
                        : "transparent",
                    }}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full border text-[10px] font-bold" style={{ borderColor: accent, color: accent }}>
                      {complete ? <Check className="fair-day-check h-3.5 w-3.5" aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                    <span className="max-w-full truncate text-[11px] font-semibold sm:text-[12px]">{step.shortLabel}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div
            className="mt-4 border-l-2 px-4 py-4 sm:px-5 sm:py-5"
            style={{
              borderColor: readyAccent(activeReadyKey),
              background: "var(--app-bg-elevated)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <ReadyPanel
              activeKey={activeReadyKey}
              ready={plan.readyKeys.includes(activeReadyKey)}
              offers={offersForSelectedDate}
              partyOffers={data.partyOffers}
              party={plan.party}
              selectedDate={selectedDate}
              partyAsOf={partyAsOf}
              onPartyChange={(party) =>
                setPlan((current) =>
                  setFairPlanParty(current, party, updateTimestamp()),
                )
              }
              selectedOffer={selectedOffer}
              onSelectOffer={(offerId) => {
                setSelectedOfferId(offerId);
                setPlan((current) => chooseOnlyOffer(current, offerId));
              }}
              arrivals={data.arrivalOptions}
              selectedArrival={selectedArrival}
              onSelectArrival={(arrivalId) => {
                setSelectedArrivalId(arrivalId);
                const option = data.arrivalOptions.find(
                  (candidate) => candidate.id === arrivalId,
                );
                if (option) {
                  setPlan((current) =>
                    setFairPlanArrivalChoice(
                      current,
                      option.planChoice,
                      updateTimestamp(),
                    ),
                  );
                }
              }}
              entrySummary={data.entrySummary}
              entryDetail={data.entryDetail}
              ticketWalletHelpUrl={data.ticketWalletHelpUrl}
              offerContextLabel={`Showing reviewed options for ${fairDateShortLabel(selectedDate)}.`}
              offerNotice={
                savedOfferOutsideSelectedDate
                  ? "Your saved offer is not valid for this day or its known purchase deadline has passed. Radius kept the saved choice for review."
                  : null
              }
              onToggleReady={() =>
                (() => {
                  const wasReady = plan.readyKeys.includes(activeReadyKey);
                  setPlan((current) =>
                    setFairPlanReady(
                      current,
                      activeReadyKey,
                      !current.readyKeys.includes(activeReadyKey),
                      updateTimestamp(),
                    ),
                  );
                  if (!wasReady) {
                    const currentIndex = FAIR_DAY_READY_KEYS.indexOf(activeReadyKey);
                    const nextKey = FAIR_DAY_READY_KEYS.slice(currentIndex + 1).find(
                      (key) => !plan.readyKeys.includes(key),
                    );
                    if (nextKey) setActiveReadyKey(nextKey);
                  }
                })()
              }
              onChooseArrival={() => setActiveReadyKey("arrival")}
            />
          </div>
        </section>

        <aside
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-y py-3"
          style={{ borderColor: "var(--app-border)" }}
          aria-label="Practical Fair answers"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Need a Fair detail?
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Parking, bags, children, rides, weather, and re-entry.
            </p>
          </div>
          <a
            href="#answers"
            onClick={() => focusFairSection("answers")}
            className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[11.5px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            Open answers
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </aside>

        <section id="find" aria-labelledby="fair-find-heading" className="scroll-mt-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
                Find a Fair stop
              </p>
              <h2 id="fair-find-heading" tabIndex={-1} className="mt-1 text-[24px] font-bold leading-tight tracking-[-0.035em] outline-none">
                Program by day
              </h2>
            </div>
            <span className="text-right text-[11.5px] font-semibold leading-snug" style={{ color: "var(--app-ink-3)" }}>
              {data.source.ageLabel}
            </span>
          </div>

          <div className="scrollbar-none -mx-4 mt-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6" aria-label="Fair dates">
            {data.dates.map((day) => {
              const selected = day.date === selectedDate;
              return (
                <button
                  key={day.date}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    chooseFairDate(day.date);
                  }}
                  className="tap-44-y min-w-[64px] shrink-0 snap-start border-b-2 px-2 py-2 text-center transition-colors motion-reduce:transition-none"
                  style={{
                    borderColor: selected ? "var(--app-brand-press)" : "var(--app-border)",
                    color: selected ? "var(--app-ink)" : "var(--app-ink-2)",
                    background: selected
                      ? "color-mix(in srgb, var(--app-brand) 7%, transparent)"
                      : "transparent",
                  }}
                >
                  <span className="block text-[11px] font-bold uppercase tracking-[0.08em]">{day.weekdayLabel}</span>
                  <span className="mt-1 block text-[17px] font-bold leading-none tabular-nums">{day.dayLabel}</span>
                  <span className="mt-1 block text-[11px] font-medium tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    {day.gateHoursLabel}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="mt-3 block" htmlFor="fair-day-search">
            <span className="sr-only">Search the Fair program</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-ink-3)" }} aria-hidden />
              <input
                id="fair-day-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the Fair program"
                className="h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] pl-10 pr-3 text-[13px] outline-none placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--app-brand)_20%,transparent)]"
                style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
              />
            </span>
          </label>

          {matchingSchedule.length > 0 ? (
            <ol className="mt-4 border-y" style={{ borderColor: "var(--app-border)" }} aria-label="Matching Fair program items">
              {matchingSchedule.map((item) => {
                const planned = plan.steps.some(
                  (step) => step.scheduleItemId === item.id,
                );
                return (
                  <li
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b py-3 last:border-b-0 min-[360px]:grid-cols-[4.5rem_minmax(0,1fr)_auto] min-[360px]:items-center min-[360px]:gap-y-0"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <time
                      className="col-start-1 row-start-1 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold leading-tight tabular-nums min-[360px]:min-h-0"
                      style={{ color: "var(--app-ink)" }}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: scheduleAccent(item.kind) }}
                        aria-hidden
                      />
                      {item.timeLabel}
                    </time>
                    <div className="col-span-2 row-start-2 min-w-0 min-[360px]:col-span-1 min-[360px]:col-start-2 min-[360px]:row-start-1">
                      <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                        {item.placeLabel}
                      </p>
                      {item.detail ? (
                        <details className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                          <summary className="tap-44 inline-flex min-h-11 cursor-pointer items-center font-semibold" style={{ color: "var(--app-brand-press)" }}>
                            Read the official program wording
                          </summary>
                          <p className="pb-1 pr-2">{item.detail}</p>
                        </details>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={planned}
                      onClick={() =>
                        setPlan((current) =>
                          addFairPlanItem(current, item.sourceItem, updateTimestamp()),
                        )
                      }
                      className="tap-44 col-start-2 row-start-1 grid h-11 w-11 place-items-center rounded-full transition-colors disabled:opacity-55 motion-reduce:transition-none min-[360px]:col-start-3"
                      style={{
                        background: planned
                          ? "var(--app-bg-sunken)"
                          : "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))",
                        color: planned ? "var(--app-ink-3)" : "var(--app-brand-press)",
                      }}
                      aria-label={planned ? `${item.title} is already in My Fair Day` : `Add ${item.title} to My Fair Day`}
                    >
                      {planned ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="mt-4 border-y py-5" style={{ borderColor: "var(--app-border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--app-ink)" }}>
                No reviewed program item matches this search.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                Try another Fair day or use a shorter search term.
              </p>
            </div>
          )}

          <aside
            className="mt-4 border-t pt-2"
            style={{ borderColor: "var(--app-border)" }}
            aria-label={data.externalGuide.label}
          >
            <div className="flex min-h-11 items-center justify-between gap-3">
              <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Official vendor guide
              </p>
              <a
                href={data.externalGuide.url}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-44 inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[12px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                EventHub
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
            <details className="group text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              <summary
                className="tap-44 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-semibold"
                style={{ color: "var(--app-ink-3)" }}
              >
                About this external guide
                <ChevronRight
                  className="h-3.5 w-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="pb-2 pr-2">{data.externalGuide.detail}</p>
            </details>
          </aside>
        </section>

        <section id="plan" aria-labelledby="fair-plan-heading" className="scroll-mt-24">
          <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border-strong)" }}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
                Device-local plan
              </p>
              <h2 id="fair-plan-heading" tabIndex={-1} className="mt-1 text-[25px] font-bold leading-tight tracking-[-0.035em] outline-none">
                My Fair Day
              </h2>
            </div>
            <Chip tone="cool" tabular>{setStopCount} {setStopCount === 1 ? "stop" : "stops"} set</Chip>
          </div>

          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }} aria-live="polite">
            Your numbered plan is saved on this device. Program times and places stay tied to reviewed Fair sources.
          </p>
          {planNotice ? (
            <p
              className="mt-3 border-l-2 py-1 pl-3 text-[12px] leading-relaxed"
              style={{
                borderColor: "var(--app-warning-press)",
                color: "var(--app-ink-2)",
              }}
              role="status"
            >
              {planNotice}
            </p>
          ) : null}

          <ol className="relative mt-5" aria-label="My numbered Fair Day plan">
            <span
              aria-hidden
              className="fair-day-route-line absolute bottom-8 left-[17px] top-8 w-px"
              style={{ background: "linear-gradient(var(--app-cool), var(--app-brand-press), var(--app-cool))" }}
            />
            <li className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-b pb-5" style={{ borderColor: "var(--app-border)" }}>
              <span className="relative z-[1] grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold tabular-nums" style={{ background: "var(--app-cool)", color: "var(--app-on-brand)" }}>1</span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] tabular-nums" style={{ color: "var(--app-cool)" }}>Arrival time not set</p>
                <p className="mt-1 text-[16px] font-semibold leading-tight">{selectedArrival?.label ?? "Arrival option not chosen"}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {selectedArrival?.summary ?? "Choose a reviewed arrival option in Ready to Go."}
                </p>
              </div>
            </li>

            {plannedRows.map(({ item, step }, index) => {
              const number = index + 2;
              const title = item?.title ?? step.labelSnapshot;
              const timeLabel = item?.timeLabel ?? step.timeLabelSnapshot ?? "Time not published";
              const placeLabel =
                item?.placeLabel ??
                "This saved stop changed in the official program. Review its snapshot before relying on it.";
              const accent = item
                ? scheduleAccent(item.kind)
                : "var(--app-warning-press)";
              return (
                <li key={step.scheduleItemId} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-b py-5" style={{ borderColor: "var(--app-border)" }}>
                  <span className="relative z-[1] grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold tabular-nums" style={{ background: accent, color: "var(--app-on-brand)" }}>{number}</span>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] tabular-nums" style={{ color: accent }}>
                          {fairDateShortLabel(item?.date ?? step.dayId.replace(/^day-/, ""))} · {timeLabel}
                        </p>
                        <p className="mt-1 text-[16px] font-semibold leading-tight">{title}</p>
                        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{placeLabel}</p>
                      </div>
                      {item ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full"
                          style={{ color: "var(--app-ink-3)" }}
                          aria-label={`Open the official source for ${title}`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPlan((current) =>
                            moveFairPlanItem(
                              current,
                              step.scheduleItemId,
                              -1,
                              updateTimestamp(),
                            ),
                          )
                        }
                        disabled={index === 0}
                        className="tap-44 grid h-11 w-11 place-items-center rounded-full disabled:opacity-35"
                        style={{ color: "var(--app-ink-2)" }}
                        aria-label={`Move ${title} earlier`}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPlan((current) =>
                            moveFairPlanItem(
                              current,
                              step.scheduleItemId,
                              1,
                              updateTimestamp(),
                            ),
                          )
                        }
                        disabled={index === plannedRows.length - 1}
                        className="tap-44 grid h-11 w-11 place-items-center rounded-full disabled:opacity-35"
                        style={{ color: "var(--app-ink-2)" }}
                        aria-label={`Move ${title} later`}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPlan((current) =>
                            removeFairPlanItem(
                              current,
                              step.scheduleItemId,
                              updateTimestamp(),
                            ),
                          )
                        }
                        className="tap-44 grid h-11 w-11 place-items-center rounded-full"
                        style={{ color: "var(--app-brand-press)" }}
                        aria-label={`Remove ${title} from My Fair Day`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}

            <li className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 pt-5">
              <span className="relative z-[1] grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold tabular-nums" style={{ background: "var(--app-cool)", color: "var(--app-on-brand)" }}>{plannedRows.length + 2}</span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] tabular-nums" style={{ color: "var(--app-cool)" }}>Leave time not set</p>
                <p className="mt-1 text-[16px] font-semibold leading-tight">{selectedArrival?.returnLabel ?? "Return point not chosen"}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {selectedArrival?.returnSummary ?? "Choose an arrival option before setting the return point."}
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section id="leave" aria-labelledby="fair-leave-heading" className="scroll-mt-24 border-l-2 py-1 pl-4" style={{ borderColor: "var(--app-cool)" }}>
          <div className="flex items-center gap-2">
            <CircleParking className="h-5 w-5" style={{ color: "var(--app-cool)" }} aria-hidden />
            <h2 id="fair-leave-heading" tabIndex={-1} className="text-[21px] font-bold tracking-[-0.03em] outline-none">Get back to your car.</h2>
          </div>
          {selectedArrival ? (
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Your return plan is <strong style={{ color: "var(--app-ink)" }}>{selectedArrival.returnLabel.toLocaleLowerCase()}</strong>.
            </p>
          ) : (
            <div className="mt-3 border-l-2 pl-3" style={{ borderColor: "var(--app-warning-press)" }}>
              <p className="text-[13px] font-semibold">Choose an arrival before relying on the return plan.</p>
              <a
                href="#now"
                onClick={() => setActiveReadyKey("arrival")}
                className="tap-44 mt-1 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
                style={{ color: "var(--app-brand-press)" }}
              >
                Choose arrival
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          )}
          <FairCarMemoryPanel enabled={data.eventPhase === "fair-day"} />
          {selectedArrival ? (
            <a
              href={selectedArrival.officialInfoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44 mt-3 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              Open the official arrival source
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </section>

        <FairPracticalAnswers answers={data.practicalAnswers} />

        <footer className="border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>{data.source.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                The Fair pack was checked {data.source.checkedLabel}. {data.source.ageLabel}.
              </p>
            </div>
            <a
              href={data.source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44 inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[11.5px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              Official source
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </footer>
      </div>

      <MobileActionBar ariaLabel="Fair Day sections">
        {([
          {
            id: "now" as const,
            href: "#now",
            label: data.eventPhase === "pre-fair" ? "Ready" : "Now",
            icon: ListChecks,
          },
          { id: "find" as const, href: "#find", label: "Find", icon: Search },
          { id: "plan" as const, href: "#plan", label: "Plan", icon: CalendarDays },
          { id: "leave" as const, href: "#leave", label: "Leave", icon: ChevronRight },
        ]).map((item) => {
          const active = activeSection === item.id;
          const Icon = item.icon;
          return (
            <a
              key={item.id}
              href={item.href}
              onClick={() => focusFairSection(item.id)}
              aria-current={active ? "location" : undefined}
              aria-label={
                item.id === "plan" && plannedRows.length > 0
                  ? `${item.label}, ${plannedRows.length} saved program ${plannedRows.length === 1 ? "stop" : "stops"}`
                  : item.label
              }
              className={`${barCellClass()} relative`}
              style={{
                background: active
                  ? "color-mix(in srgb, var(--app-brand) 9%, transparent)"
                  : "transparent",
                color: active ? "var(--app-brand-press)" : "var(--app-ink-2)",
              }}
            >
              <span
                aria-hidden
                className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2"
                style={{ background: active ? "var(--app-brand)" : "transparent" }}
              />
              <span className="relative">
                <Icon className="h-4 w-4" aria-hidden />
                {item.id === "plan" && plannedRows.length > 0 ? (
                  <span
                    className="absolute -right-3 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold tabular-nums"
                    style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
                    aria-hidden
                  >
                    {plannedRows.length}
                  </span>
                ) : null}
              </span>
              {item.label}
            </a>
          );
        })}
      </MobileActionBar>
    </article>
  );
}

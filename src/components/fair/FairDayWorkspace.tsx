"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BusFront,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  CircleHelp,
  ExternalLink,
  FerrisWheel,
  Flower2,
  House,
  LayoutGrid,
  ListChecks,
  MapPinned,
  MessageSquare,
  Music2,
  PawPrint,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Store,
  TicketCheck,
  Trash2,
  Volume1,
  UtensilsCrossed,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import {
  fairProgramDaypart,
  fairProgramDefaultOpenDaypart,
  fairProgramLiveStatus,
  fairProgramLocalDate,
  fairProgramNextStart,
  sortFairProgramItems,
  type FairProgramDaypart,
} from "@/lib/fair/program-view";
import {
  isFairMapSelectionHistoryState,
  withoutFairMapSelectionHistoryState,
} from "@/lib/fair/map-selection-history";

import FairPartyPlanner from "./FairPartyPlanner";
import FairPracticalAnswers from "./FairPracticalAnswers";
import FairShareButton from "./FairShareButton";
import FairKeepGuide from "./FairKeepGuide";
import FairGroundsMap from "./FairGroundsMap";
import FairGrandstandSpotlight from "./FairGrandstandSpotlight";
import FairPhotoExplorer from "./FairPhotoExplorer";
import FairTravelPanel from "./FairTravelPanel";
import type {
  FairDayArrivalView,
  FairDayDateOption,
  FairDayOfferView,
  FairDayScheduleItemView,
  FairDayWorkspaceData,
} from "./types";

type FairMode = "now" | "find" | "map" | "my-day" | "travel";
type FairPhotoMode = Extract<FairMode, "find" | "my-day" | "travel">;
type PreparationKey = Extract<FairPlanReadyKey, "ticket" | "entry">;
type FairPlanStorageState = "checking" | "available" | "unavailable";
type ScheduleFilter =
  | "all"
  | "kid-zone"
  | "animals"
  | "music"
  | "rides"
  | "food"
  | "motorsport"
  | "exhibits";

const FAIR_PRIMARY_MODES: Array<{
  id: FairMode;
  label: string;
  detail: string;
  icon: typeof House;
  accent: string;
}> = [
  {
    id: "now",
    label: "Home",
    detail: "Best next step",
    icon: House,
    accent: "var(--app-brand)",
  },
  {
    id: "find",
    label: "Program",
    detail: "Events & activities",
    icon: Search,
    accent: "var(--app-accent)",
  },
  {
    id: "map",
    label: "Map",
    detail: "Places & access",
    icon: MapPinned,
    accent: "var(--app-cool)",
  },
  {
    id: "my-day",
    label: "My Day",
    detail: "Saved plan",
    icon: ListChecks,
    accent: "var(--app-brand)",
  },
];

const FAIR_MODE_IDS: FairMode[] = ["now", "find", "map", "my-day", "travel"];

const FAIR_MODE_MASTHEADS: Record<
  FairPhotoMode,
  {
    eyebrow: string;
    title: string;
    accent: string;
    visual: "photo" | "plan" | "travel";
    objectPosition?: string;
    src?: string;
    srcSet?: string;
  }
> = {
  find: {
    eyebrow: "Find what’s happening",
    title: "Fair program",
    accent: "var(--app-accent)",
    visual: "photo",
    objectPosition: "76% 54%",
    src: "/images/fair/fairgrounds-midway-mike-d-960.jpg",
    srcSet:
      "/images/fair/fairgrounds-midway-mike-d-960.jpg 960w, /images/fair/fairgrounds-midway-mike-d-1920.jpg 1920w",
  },
  "my-day": {
    eyebrow: "Tickets, arrival and stops in one place",
    title: "Your plan",
    accent: "var(--app-brand)",
    visual: "plan",
  },
  travel: {
    eyebrow: "The easier way in and back out",
    title: "Arrival",
    accent: "var(--app-cool)",
    visual: "travel",
  },
};

const SCHEDULE_FILTERS = [
  { id: "all", label: "All", Icon: LayoutGrid, kind: "other" },
  { id: "kid-zone", label: "Kid Zone", Icon: Sparkles, kind: "other" },
  { id: "animals", label: "Animals", Icon: PawPrint, kind: "animal" },
  { id: "music", label: "Music", Icon: Music2, kind: "concert" },
  { id: "rides", label: "Rides", Icon: FerrisWheel, kind: "carnival" },
  { id: "food", label: "Food & drink", Icon: UtensilsCrossed, kind: "food" },
  { id: "motorsport", label: "Grandstand", Icon: TicketCheck, kind: "motorsport" },
  { id: "exhibits", label: "Exhibits & farm", Icon: Flower2, kind: "agriculture" },
] as const;

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
  if (normalized === "program") return "find";
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

function fairDateWeekdayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

function fairClockLabel(timestamp: string): string {
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return "Time not published";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(timestampMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const minute = value("minute");
  const dayPeriod = value("dayPeriod").toLocaleLowerCase() === "am" ? "a.m." : "p.m.";
  return `${value("hour")}${minute === "00" ? "" : `:${minute}`} ${dayPeriod}`;
}

function fairTimeRange(startsAt: string, endsAt: string): string {
  const starts = fairClockLabel(startsAt);
  const ends = fairClockLabel(endsAt);
  const meridiem = ends.endsWith("a.m.") ? "a.m." : ends.endsWith("p.m.") ? "p.m." : null;
  const compactStart = meridiem && starts.endsWith(meridiem)
    ? starts.slice(0, -meridiem.length).trim()
    : starts;
  return `${compactStart}–${ends}`;
}

function fairGateGlance(
  day: FairDayDateOption | undefined,
  asOf: string,
  isSelectedLiveDay: boolean,
): { label: string; value: string; detail: string } {
  if (!day) {
    return {
      label: "Gate hours",
      value: "Hours not published",
      detail: "Check the official Fair source.",
    };
  }

  const schedule = fairTimeRange(day.gateOpensAt, day.gateClosesAt);
  if (!isSelectedLiveDay) {
    return {
      label: "Gate hours",
      value: schedule,
      detail: `${fairDateWeekdayLabel(day.date)} schedule`,
    };
  }

  const now = Date.parse(asOf);
  const opensAt = Date.parse(day.gateOpensAt);
  const closesAt = Date.parse(day.gateClosesAt);
  if (![now, opensAt, closesAt].every(Number.isFinite)) {
    return {
      label: "Gate hours",
      value: schedule,
      detail: `${fairDateWeekdayLabel(day.date)} schedule`,
    };
  }
  if (now < opensAt) {
    return {
      label: "Gates open",
      value: fairClockLabel(day.gateOpensAt),
      detail: `Closes ${fairClockLabel(day.gateClosesAt)}`,
    };
  }
  if (now < closesAt) {
    return {
      label: "Gates",
      value: "Open now",
      detail: `Closes ${fairClockLabel(day.gateClosesAt)}`,
    };
  }
  return {
    label: "Gates",
    value: "Closed today",
    detail: `Closed at ${fairClockLabel(day.gateClosesAt)}`,
  };
}

function compactPaymentLabel(label: string): string {
  return label.replace("credit card", "card");
}

function scheduleAccent(kind: FairDayScheduleItemView["kind"]): string {
  if (kind === "agriculture" || kind === "animal") return "var(--app-brand-2)";
  if (kind === "service") return "var(--app-cool)";
  if (kind === "concert") return "var(--app-accent-press)";
  return "var(--app-brand-press)";
}

function scheduleKindLabel(kind: FairDayScheduleItemView["kind"]): string {
  if (kind === "agriculture") return "Farm & garden";
  if (kind === "animal") return "Animals";
  if (kind === "concert") return "Music";
  if (kind === "carnival") return "Rides";
  if (kind === "motorsport") return "Grandstand";
  if (kind === "food") return "Food & drink";
  if (kind === "service") return "Fair service";
  if (kind === "exhibit") return "Exhibit";
  return "Fair program";
}

function FairGlanceTile({
  kind,
  label,
  value,
  detail,
  icon,
  accent,
  onClick,
  ariaLabel,
}: {
  kind: "gate" | "admission" | "parking";
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  accent: string;
  onClick: (opener: HTMLButtonElement) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      data-fair-glance-tile={kind}
      onClick={(event) => onClick(event.currentTarget)}
      aria-label={ariaLabel}
      className="tap-44 group flex min-h-11 min-w-0 flex-col px-2 py-2 text-left first:pl-0 last:pr-0 sm:px-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em]"
          style={{ color: accent }}
        >
          {icon}
          {label}
        </span>
      </span>
      <span className="mt-2 block text-[16px] font-bold leading-snug tracking-[-0.02em] sm:text-[18px]">
        {value}
      </span>
      <span
        className="mt-1 block text-[11px] font-medium leading-snug sm:text-[12px]"
        style={{ color: "var(--app-ink-2)" }}
      >
        {detail}
      </span>
    </button>
  );
}

function FairProgramResultList({
  items,
  plan,
  label,
  asOf,
  selectedDate,
  nextStart,
  dayClosesAt,
  onToggle,
  onOpen,
}: {
  items: FairDayScheduleItemView[];
  plan: FairPlan;
  label: string;
  asOf: string;
  selectedDate: string;
  nextStart: number | null;
  dayClosesAt?: string | null;
  onToggle: (item: FairDayScheduleItemView, planned: boolean) => void;
  onOpen: (itemId: string, opener: HTMLButtonElement) => void;
}) {
  return (
    <ol
      className="relative mt-3 divide-y divide-[var(--app-border)]"
      aria-label={label}
      data-fair-program-trail
    >
      {items.map((item) => {
        const planned = plan.steps.some(
          (step) => step.scheduleItemId === item.id,
        );
        const place = compactPlaceLabel(item.placeLabel);
        const accent = scheduleAccent(item.kind);
        const liveStatus = fairProgramLiveStatus(
          item,
          asOf,
          selectedDate,
          nextStart,
          dayClosesAt,
        );
        return (
          <li
            key={item.id}
            className="relative grid grid-cols-[minmax(0,1fr)_2.75rem] gap-3 py-5 sm:py-6"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <time
                  className="text-[12px] font-extrabold leading-tight tabular-nums"
                  style={{ color: accent }}
                >
                  {item.timeLabel}
                </time>
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.07em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {scheduleKindLabel(item.kind)}
                </span>
                {liveStatus ? (
                  <span
                    data-fair-program-live-state={liveStatus.state}
                    className="inline-flex min-h-6 items-center rounded-full px-2 text-[10px] font-extrabold uppercase tracking-[0.06em]"
                    style={{
                      color:
                        liveStatus.state === "live"
                          ? "var(--app-on-brand)"
                          : "var(--app-warning-press)",
                      background:
                        liveStatus.state === "live"
                          ? "var(--app-brand-2)"
                          : "color-mix(in srgb, var(--app-amber) 20%, var(--app-bg-elevated-solid))",
                    }}
                  >
                    {liveStatus.label}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[21px] font-bold leading-[1.15] tracking-[-0.025em] sm:text-[24px]">
                {item.title}
              </p>
              {place ? (
                <p
                  className="mt-1 text-[12px] font-semibold leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {place}
                </p>
              ) : null}
              {item.detail ? (
                <p
                  className="mt-1 line-clamp-2 text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {item.detail}
                </p>
              ) : null}
              <button
                type="button"
                onClick={(event) => onOpen(item.id, event.currentTarget)}
                className="tap-44 -mb-2 mt-0.5 inline-flex min-h-11 items-center gap-1 text-[12px] font-bold"
                style={{ color: accent }}
                aria-label={`Open details for ${item.title}`}
              >
                Details
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              data-fair-plan-toggle={item.id}
              aria-pressed={planned}
              onClick={() => onToggle(item, planned)}
              className="tap-44 tactile tactile-interactive grid h-11 w-11 place-items-center self-start rounded-full transition active:scale-[0.94] motion-reduce:transition-none"
              style={{
                background: planned
                  ? "var(--app-bg-sunken)"
                  : "var(--app-brand-tint-6)",
                color: planned ? "var(--app-ink-3)" : "var(--app-brand-press)",
              }}
              aria-label={
                planned
                  ? `Remove ${item.title} from My Day`
                  : `Add ${item.title} to My Day`
              }
            >
              {planned ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function FairPhotoMasthead({
  mode,
  onBack,
  onHelp,
}: {
  mode: FairPhotoMode;
  onBack: () => void;
  onHelp: () => void;
}) {
  const visual = FAIR_MODE_MASTHEADS[mode];
  const usesPhoto = visual.visual === "photo";

  return (
    <div
      data-fair-mode-masthead={mode}
      className={`relative isolate overflow-hidden border-b sm:min-h-[190px] ${usesPhoto ? "min-h-[132px]" : "min-h-[104px]"}`}
      style={{
        borderColor: visual.accent,
        background: usesPhoto
          ? "var(--app-ink)"
          : `linear-gradient(120deg, color-mix(in srgb, ${visual.accent} 15%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 58%, color-mix(in srgb, var(--app-brand-2) 8%, var(--app-bg-elevated-solid)))`,
      }}
    >
      {usesPhoto ? (
        <>
          <picture className="absolute inset-0 block">
            <img
              src={visual.src}
              srcSet={visual.srcSet}
              sizes="100vw"
              alt=""
              width="960"
              height="540"
              loading="eager"
              className="fair-mode-photo h-full w-full scale-[1.025] object-cover"
              style={{ objectPosition: visual.objectPosition }}
            />
          </picture>
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--app-ink) 62%, transparent), color-mix(in srgb, var(--app-ink) 16%, transparent) 46%, color-mix(in srgb, var(--app-ink) 82%, transparent))",
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="pointer-events-none absolute bottom-1 right-3 top-14 flex w-[44%] items-center justify-end sm:bottom-0 sm:right-8 sm:top-0" aria-hidden="true">
          {visual.visual === "plan" ? (
            <div className="relative flex h-[52px] w-[128px] items-center justify-between sm:h-[126px] sm:w-[260px]">
              <span className="absolute left-5 right-5 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: "var(--app-border-strong)" }} />
              {[TicketCheck, MapPinned, Check].map((Icon, index) => (
                <span
                  key={index}
                  className="relative grid h-9 w-9 place-items-center rounded-full border-2 bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-elev-1)] sm:h-14 sm:w-14"
                  style={{ borderColor: index === 2 ? "var(--app-brand)" : "var(--app-border-strong)", color: index === 2 ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
                >
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              ))}
            </div>
          ) : (
            <div className="relative h-[52px] w-[128px] sm:h-[132px] sm:w-[250px]">
              <span className="absolute bottom-1 left-2 grid h-9 w-9 place-items-center rounded-full border bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-elev-1)] sm:h-16 sm:w-16" style={{ borderColor: "var(--app-cool)", color: "var(--app-cool)" }}>
                <BusFront className="h-5 w-5 sm:h-7 sm:w-7" />
              </span>
              <span className="absolute right-2 top-0 grid h-10 w-10 place-items-center rounded-full border-2 bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-elev-2)] sm:h-20 sm:w-20" style={{ borderColor: "var(--app-brand)", color: "var(--app-brand-press)" }}>
                <MapPinned className="h-5 w-5 sm:h-8 sm:w-8" />
              </span>
              <span className="absolute bottom-3 left-[38%] right-[24%] h-1 -rotate-[18deg] rounded-full" style={{ background: "var(--app-border-strong)" }} />
            </div>
          )}
        </div>
      )}
      <div className={`relative z-10 mx-auto flex max-w-[68rem] flex-col justify-between px-3 py-2 sm:min-h-[190px] sm:px-6 sm:py-4 ${usesPhoto ? "min-h-[132px] text-[var(--app-ink-inverse)]" : "min-h-[104px] text-[var(--app-ink)]"}`}>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className={`fair-hero-control tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full ${usesPhoto ? "fair-hero-control--photo" : ""}`}
            style={{
              color: usesPhoto
                ? "var(--app-ink-inverse)"
                : "var(--app-brand-press)",
            }}
            aria-label="Back to Fair Today"
          >
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onHelp}
            className={`fair-hero-control tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full ${usesPhoto ? "fair-hero-control--photo" : ""}`}
            style={{
              color: usesPhoto
                ? "var(--app-ink-inverse)"
                : "var(--app-cool)",
            }}
            aria-label="Help & access"
          >
            <CircleHelp className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
        <div className="flex items-end gap-4">
          <div>
            <p className="hidden text-[10px] font-bold uppercase tracking-[0.12em] opacity-90 sm:block">
              {visual.eyebrow}
            </p>
            <p
              className="text-[26px] font-extrabold leading-none tracking-[-0.035em] sm:mt-1 sm:text-[42px]"
              style={
                usesPhoto
                  ? {
                      textShadow:
                        "0 2px 12px color-mix(in srgb, var(--app-ink) 68%, transparent)",
                    }
                  : undefined
              }
            >
              {visual.title}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function scheduleFilterMatches(
  item: FairDayScheduleItemView,
  filter: ScheduleFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "kid-zone") return /\bkid zone\b/i.test(`${item.title} ${item.detail ?? ""}`);
  if (filter === "animals") {
    return item.kind === "animal";
  }
  if (filter === "exhibits") return item.kind === "exhibit" || item.kind === "agriculture";
  if (filter === "music") return item.kind === "concert";
  if (filter === "rides") return item.kind === "carnival";
  if (filter === "food") return item.kind === "food";
  return item.kind === "motorsport" || /\bgrandstand\b/i.test(item.placeLabel);
}

function isScheduleUtilityRow(item: FairDayScheduleItemView): boolean {
  return /^(?:deadline\b|parking fees begin\b|kids?\b.*admitted\b|[|]?(?:\s*(?:senior|military) day|\s*lunch bunch|\s*canned food drive))/i.test(
    item.title.trim(),
  );
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
  const ready = plan.readyKeys.includes("ticket");
  const eligibilityOffers = offers.filter(
    (offer) => offer.placement === "eligibility-promotion",
  );
  const admissionOffer = offers.find(
    (offer) => offer.id === "offer-adult-admission-online" && !offer.pastKnownDeadline,
  ) ?? offers.find(
    (offer) => offer.id === "offer-adult-admission-early" && !offer.pastKnownDeadline,
  );
  const childOffer = offers.find((offer) => offer.id === "offer-child-admission");

  return (
    <div className="px-4 pb-6 pt-2 sm:px-6">
      {admissionOffer ? (
        <div data-fair-direct-admission>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[16px] font-bold">{admissionOffer.label}</p>
              <p className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                This admission is for guests age 11 and older.
              </p>
            </div>
            <strong className="shrink-0 text-[28px] font-bold tabular-nums">{admissionOffer.priceLabel}</strong>
          </div>
          {admissionOffer.deadlineLabel ? (
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{admissionOffer.deadlineLabel}</p>
          ) : null}
          {childOffer ? (
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {childOffer.priceLabel === "Free"
                ? "Children age 10 and under enter free."
                : childOffer.detail}
            </p>
          ) : null}
          {admissionOffer.purchaseNote ? (
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {admissionOffer.purchaseNote}
            </p>
          ) : null}
          <a
            href={admissionOffer.officialPurchaseUrl ?? admissionOffer.officialInfoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44 mt-4 flex min-h-12 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-[14px] font-bold"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
          >
            {admissionOffer.officialPurchaseUrl ? "Buy admission on Etix" : "Check official admission details"}
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            {admissionOffer.officialPurchaseUrl
              ? "Etix opens in a new tab. Confirm your ticket details and total there."
              : "Official admission details open in a new tab."}
          </p>
        </div>
      ) : (
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          No current online admission offer is listed for this day. Check the official Fair information before buying.
        </p>
      )}
      <div className="mt-4">
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
      <details className="group mt-5 border-t" style={{ borderColor: "var(--app-border)" }} data-fair-ticket-calculator>
        <summary className="tap-44 flex min-h-12 cursor-pointer items-center justify-between gap-3 text-[14px] font-semibold">
          Estimate for my group
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <FairPartyPlanner
          party={plan.party}
          date={plan.selectedDayId?.replace(/^day-/, "") ?? data.initialDate}
          asOf={data.reviewedAt}
          offers={data.partyOffers}
          onPartyChange={onPartyChange}
        />
      </details>
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
  visibleLabel,
  savedCountsByDate,
}: {
  dates: FairDayWorkspaceData["dates"];
  selectedDate: string;
  onChange: (date: string) => void;
  label: string;
  visibleLabel?: string;
  savedCountsByDate?: Readonly<Record<string, number>>;
}) {
  return (
    <label className="flex shrink-0 items-center gap-2">
      <span
        className={
          visibleLabel
            ? "text-[10px] font-bold uppercase tracking-[0.1em]"
            : "sr-only"
        }
        style={visibleLabel ? { color: "var(--app-ink-3)" } : undefined}
      >
        {visibleLabel ?? label}
      </span>
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
            {(savedCountsByDate?.[day.date] ?? 0) > 0
              ? ` · ${savedCountsByDate?.[day.date]} saved`
              : ""}
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
  const [mapFocusRequest, setMapFocusRequest] = useState<{
    programItemId: string;
    requestId: number;
  } | null>(null);
  const mapFocusRequestId = useRef(0);
  const [programDetailOpen, setProgramDetailOpen] = useState(false);
  const programDetailClearTimer = useRef<number | null>(null);
  const programDetailFocusTimer = useRef<number | null>(null);
  const programDetailOpenerRef = useRef<HTMLElement | null>(null);
  const [photoExplorerOpen, setPhotoExplorerOpen] = useState(false);
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
  const [query, setQuery] = useState("");
  const programScrollTop = useRef(0);
  const [scheduleFilter, setScheduleFilter] =
    useState<ScheduleFilter>("all");
  const [editPlan, setEditPlan] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [planStorageState, setPlanStorageState] =
    useState<FairPlanStorageState>("checking");
  const [partyAsOf, setPartyAsOf] = useState(data.reviewedAt);

  useEffect(() => {
    if (activeMode !== "find" || programDetailOpen) return;
    const rememberPosition = () => { programScrollTop.current = window.scrollY; };
    window.addEventListener("scroll", rememberPosition, { passive: true });
    return () => window.removeEventListener("scroll", rememberPosition);
  }, [activeMode, programDetailOpen]);

  const closeProgramDetail = (restoreFocus = false) => {
    setProgramDetailOpen(false);
    if (programDetailClearTimer.current !== null) {
      window.clearTimeout(programDetailClearTimer.current);
    }
    if (programDetailFocusTimer.current !== null) {
      window.clearTimeout(programDetailFocusTimer.current);
      programDetailFocusTimer.current = null;
    }
    if (restoreFocus) {
      const opener = programDetailOpenerRef.current;
      programDetailFocusTimer.current = window.setTimeout(() => {
        programDetailFocusTimer.current = null;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      }, 550);
    }
    programDetailClearTimer.current = window.setTimeout(() => {
      setSelectedProgramDetailId(null);
      programDetailClearTimer.current = null;
    }, 350);
  };

  const openProgramDetail = (itemId: string, opener?: HTMLElement) => {
    if (programDetailClearTimer.current !== null) {
      window.clearTimeout(programDetailClearTimer.current);
      programDetailClearTimer.current = null;
    }
    if (programDetailFocusTimer.current !== null) {
      window.clearTimeout(programDetailFocusTimer.current);
      programDetailFocusTimer.current = null;
    }
    programDetailOpenerRef.current =
      opener ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
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

  const closePreparation = (preparation: PreparationKey) => {
    setActivePreparation(null);
    if (window.location.hash.toLocaleLowerCase() === `#fair-ready-${preparation}`) {
      window.history.replaceState(window.history.state, "", "#now");
    }
  };

  const closeHelp = () => {
    setHelpOpen(false);
    setHelpAnswerId(null);
    setHelpCategory(null);
    if (window.location.hash.toLocaleLowerCase() === "#answers") {
      window.history.replaceState(window.history.state, "", "#now");
    }
  };

  useEffect(
    () => () => {
      if (programDetailClearTimer.current !== null) {
        window.clearTimeout(programDetailClearTimer.current);
      }
      if (programDetailFocusTimer.current !== null) {
        window.clearTimeout(programDetailFocusTimer.current);
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
      const restoredAt = updateTimestamp();
      const reconciled = reconcileFairPlan(
        stored,
        sourceScheduleItems,
        data.packRevision,
        restoredAt,
      );
      let restoredPlan = reconciled.plan;
      if (reconciled.plan.selectedDayId) {
        const restoredDate = reconciled.plan.selectedDayId.replace(/^day-/, "");
        if (validDates.has(restoredDate)) {
          setSelectedDate(restoredDate);
        } else {
          restoredPlan = setFairPlanDay(
            restoredPlan,
            `day-${data.initialDate}`,
            restoredAt,
          );
        }
      }
      setPlan(restoredPlan);
      const restoredArrival = data.arrivalOptions.find(
        (option) => option.planChoice === restoredPlan.arrivalChoice,
      );
      if (restoredArrival) setSelectedArrivalId(restoredArrival.id);
    } finally {
      setStorageReady(true);
    }
  }, [
    data.arrivalOptions,
    data.fairId,
    data.initialDate,
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
      const requested = window.location.hash
        .slice(1)
        .trim()
        .toLocaleLowerCase();
      const requestedMode = fairModeFromHash(requested);
      if (!requestedMode) return;

      setActiveMode(requestedMode);
      setActivePreparation(
        requested === "fair-ready-ticket"
          ? "ticket"
          : requested === "fair-ready-entry"
            ? "entry"
            : null,
      );
      setHelpOpen(requested === "answers");
      if (requested !== "answers") {
        setHelpAnswerId(null);
        setHelpCategory(null);
      }
      setProgramDetailOpen(false);
      if (programDetailClearTimer.current !== null) {
        window.clearTimeout(programDetailClearTimer.current);
        programDetailClearTimer.current = null;
      }
      setSelectedProgramDetailId(null);

      const canonicalHash =
        requested === "answers" ||
        requested === "fair-ready-ticket" ||
        requested === "fair-ready-entry"
          ? `#${requested}`
          : requestedMode === "map"
            ? "#fair-map"
            : requestedMode === "find"
              ? "#program"
              : `#${requestedMode}`;
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(window.history.state, "", canonicalHash);
      }
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: requestedMode === "find" ? programScrollTop.current : 0, behavior: "auto" });
      });
    };

    syncModeFromHash();
    setRouteReady(true);
    window.addEventListener("hashchange", syncModeFromHash);
    window.addEventListener("popstate", syncModeFromHash);
    return () => {
      window.removeEventListener("hashchange", syncModeFromHash);
      window.removeEventListener("popstate", syncModeFromHash);
    };
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
      const nextMinute = now - (now % 60_000) + 60_000;
      const nextRefresh = Math.min(nextDeadline ?? Number.POSITIVE_INFINITY, nextMinute);
      deadlineTimer = window.setTimeout(
        refreshDeadlineClock,
        Math.min(2_147_000_000, Math.max(250, nextRefresh - now + 250)),
      );
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
    setQuery("");
    setScheduleFilter("all");
  };

  const chooseMode = (mode: FairMode) => {
    // Leaving the map cancels an unfinished one-shot handoff too. Focus can
    // be visible before its confirmation timer acknowledges the request.
    if (mode !== "map") setMapFocusRequest(null);
    setActivePreparation(null);
    setHelpOpen(false);
    closeProgramDetail();
    setActiveMode(mode);
    const hash =
      mode === "map" ? "#fair-map" : mode === "find" ? "#program" : `#${mode}`;
    const nextUrl = new URL(window.location.href);
    const leavingMapSelection =
      mode !== "map" &&
      isFairMapSelectionHistoryState(window.history.state);
    if (mode !== "map") nextUrl.searchParams.delete("meet");
    nextUrl.hash = hash;
    const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentPath !== nextPath || leavingMapSelection) {
      const nextState = {
        ...(leavingMapSelection
          ? withoutFairMapSelectionHistoryState(window.history.state)
          : window.history.state),
        fairMode: mode,
      };
      if (leavingMapSelection) {
        window.history.replaceState(nextState, "", nextPath);
      } else {
        window.history.pushState(nextState, "", nextPath);
      }
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: mode === "find" ? programScrollTop.current : 0, behavior: "auto" });
      document.getElementById(MODE_HEADING_IDS[mode])?.focus({ preventScroll: true });
    });
  };

  const showReviewedFairMapFeature = (featureId: string) => {
    setActivePreparation(null);
    setHelpOpen(false);
    closeProgramDetail();
    setActiveMode("map");
    const url = new URL(window.location.href);
    url.searchParams.set("meet", featureId);
    url.hash = "fair-map";
    window.history.pushState(
      { ...window.history.state, fairMode: "map" },
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      document
        .getElementById(MODE_HEADING_IDS.map)
        ?.focus({ preventScroll: true });
    });
  };

  const showGrandstandProgram = () => {
    programScrollTop.current = 0;
    setQuery("");
    setScheduleFilter("motorsport");
    chooseMode("find");
  };

  const showRidesProgram = () => {
    programScrollTop.current = 0;
    setQuery("");
    setScheduleFilter("rides");
    chooseMode("find");
  };

  const showProgramItemOnMap = (item: FairDayScheduleItemView) => {
    if (!compactPlaceLabel(item.placeLabel)) return;
    mapFocusRequestId.current += 1;
    setMapFocusRequest({
      programItemId: item.id,
      requestId: mapFocusRequestId.current,
    });
    chooseMode("map");
  };

  const handleMapFocusRequest = useCallback((requestId: number) => {
    setMapFocusRequest((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);

  const chooseFairDate = (date: string) => {
    setSelectedDate(date);
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
  const grandstandSpotlightItem = useMemo(() => {
    const grandstandItems = sortFairProgramItems(
      discoveryItems.filter(
        (item) =>
          item.kind === "concert" || /\bgrandstand\b/i.test(item.placeLabel),
      ),
    );

    return (
      grandstandItems.find((item) => item.kind === "concert") ??
      grandstandItems[0] ??
      null
    );
  }, [discoveryItems]);
  const matchingSchedule = useMemo(
    () =>
      sortFairProgramItems(
        data.scheduleItems
          .filter((item) => item.date === selectedDate)
          .filter((item) => !isScheduleUtilityRow(item))
          .filter((item) => scheduleFilterMatches(item, scheduleFilter))
          .filter((item) => {
            if (!normalizedQuery) return true;
            return `${item.title} ${item.detail ?? ""} ${scheduleKindLabel(item.kind)} ${item.timeLabel} ${item.placeLabel}`
              .toLocaleLowerCase()
              .includes(normalizedQuery);
          }),
      ),
    [
      data.scheduleItems,
      normalizedQuery,
      scheduleFilter,
      selectedDate,
    ],
  );
  const exploreFocused =
    normalizedQuery.length > 0 ||
    scheduleFilter !== "all";
  const selectedDay = data.dates.find((day) => day.date === selectedDate);
  const programNextStart = fairProgramNextStart(
    discoveryItems,
    partyAsOf,
    selectedDate,
  );
  const selectedDateIsLive =
    fairProgramLocalDate(partyAsOf) === selectedDate &&
    data.dates.some((day) => day.date === selectedDate);
  const gateGlance = fairGateGlance(
    selectedDay,
    partyAsOf,
    selectedDateIsLive,
  );
  const onlineAdmission = data.offers.find(
    (offer) => offer.id === "offer-adult-admission-online",
  );
  const gateAdmission = data.offers.find(
    (offer) => offer.id === "offer-adult-admission-gate",
  );
  const childAdmission = data.offers.find(
    (offer) => offer.id === "offer-child-admission",
  );
  const admissionValue = onlineAdmission && gateAdmission
      ? `${onlineAdmission.priceLabel} online · ${gateAdmission.priceLabel} gate`
      : "See reviewed admission choices";
  const childAdmissionDetail =
    childAdmission?.priceLabel === "Free"
      ? "Children 10 & under free"
      : "See child admission details";
  const admissionDetail = childAdmissionDetail;
  const parkingPrimary = `${data.parkingGlance.satellitePriceLabel} ${compactPaymentLabel(
    data.parkingGlance.satellitePaymentLabel,
  )} lots`;
  const parkingDetail = `${data.parkingGlance.infieldPriceLabel} infield · ${compactPaymentLabel(
    data.parkingGlance.infieldPaymentLabel,
  )}`;
  const visibleSchedule = matchingSchedule;
  const visibleScheduleGroups: Array<{
    id: FairProgramDaypart;
    label: string;
    items: FairDayScheduleItemView[];
  }> = [
    { id: "morning", label: "Morning", items: [] },
    {
      id: "afternoon",
      label: "Afternoon",
      items: [],
    },
    { id: "evening", label: "Evening", items: [] },
    {
      id: "unscheduled",
      label: "Time not published",
      items: [],
    },
  ];
  for (const item of visibleSchedule) {
    visibleScheduleGroups
      .find((group) => group.id === fairProgramDaypart(item))
      ?.items.push(item);
  }
  const nonEmptyScheduleGroups = visibleScheduleGroups.filter(
    (group) => group.items.length > 0,
  );
  const defaultOpenDaypart = fairProgramDefaultOpenDaypart(
    visibleSchedule,
    partyAsOf,
    selectedDate,
    selectedDay?.gateClosesAt,
  );
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
  const savedCountsByDate = plan.steps.reduce<Record<string, number>>(
    (counts, step) => {
      const date = step.dayId.replace(/^day-/, "");
      counts[date] = (counts[date] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const savedDayCount = Object.values(savedCountsByDate).filter(
    (count) => count > 0,
  ).length;
  const plannedRows = plan.steps
    .filter((step) => step.dayId === selectedDayId)
    .map((step) => ({
      step,
      item: scheduleById.get(step.scheduleItemId) ?? null,
    }));
  const mappedPlanStops = plannedRows.map(({ step, item }) => ({
    id: step.scheduleItemId,
    title: item?.title ?? step.labelSnapshot,
    // Keep changed or removed steps in the denominator without inventing a
    // map location. An empty label cannot match reviewed geometry.
    placeLabel: item?.placeLabel ?? "",
  }));
  const planStatus = buildFairPlanStatus(plan);
  const changedOrRemovedStopCount = plan.steps.filter(
    (step) => step.sourceState === "changed-or-removed",
  ).length;
  const planNotice =
    changedOrRemovedStopCount > 0
      ? `${changedOrRemovedStopCount} saved ${
          changedOrRemovedStopCount === 1 ? "stop has" : "stops have"
        } changed in the official program. Review the saved wording before relying on it.`
      : null;
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
  const firstStopReady = plannedRows.some(
    ({ item, step }) => item !== null && step.sourceState === "current",
  );
  const activePrimaryLabel =
    activeMode === "travel"
      ? "Getting there"
      : (FAIR_PRIMARY_MODES.find((mode) => mode.id === activeMode)?.label ??
        "Fair Day");

  return (
    <article
      data-fair-app
      data-fair-interaction-ready={storageReady ? "true" : "false"}
      data-fair-route-ready={routeReady ? "true" : "false"}
      data-fair-plan-storage={planStorageState}
      aria-busy={!routeReady || !storageReady}
      className="fair-day-workspace min-h-dvh w-full font-sans"
      style={{
        background: "var(--app-bg)",
        color: "var(--app-ink)",
      }}
    >
      {!routeReady ? (
        <span
          id="fair-map"
          data-fair-route-target
          className="pointer-events-none absolute h-px w-px overflow-hidden"
          aria-hidden="true"
        />
      ) : null}
      <style>{`
        .fair-day-workspace :is(a, button, input, select, summary, [tabindex]):focus-visible {
          outline: 2px solid var(--app-brand);
          outline-offset: 3px;
        }
        .fair-day-workspace .fair-hero-control:focus-visible {
          outline: 3px solid var(--app-bg-elevated-solid);
          box-shadow: 0 0 0 2px var(--app-brand-press);
        }
        .fair-day-workspace .fair-hero-control {
          background: transparent;
          transition: background-color var(--app-dur-fast) var(--app-ease-out), transform var(--app-dur-fast) var(--app-ease-out);
        }
        .fair-day-workspace .fair-hero-control--photo svg {
          filter: drop-shadow(0 1px 3px color-mix(in srgb, var(--app-ink) 92%, transparent));
        }
        .fair-day-workspace .fair-hero-control--photo {
          background: color-mix(in srgb, var(--app-ink) 58%, transparent);
          border: 1px solid color-mix(in srgb, var(--app-ink-inverse) 28%, transparent);
          box-shadow: 0 3px 12px color-mix(in srgb, var(--app-ink) 24%, transparent);
          backdrop-filter: blur(5px);
        }
        .fair-day-workspace .fair-mode-photo {
          transition: transform var(--app-dur-slow) var(--app-ease-out);
        }
        .fair-day-workspace .fair-portal-action {
          transition: transform var(--app-dur-fast) var(--app-ease-out), box-shadow var(--app-dur-fast) var(--app-ease-out), border-color var(--app-dur-fast) var(--app-ease-out);
        }
        .fair-day-workspace [data-fair-mode-panel] {
          animation: fair-mode-panel-enter var(--app-dur-med) var(--app-ease-out) both;
        }
        .fair-day-workspace[data-fair-route-ready="false"] > [data-fair-route-target]:target ~ header,
        .fair-day-workspace[data-fair-route-ready="false"] > [data-fair-route-target]:target ~ [data-fair-plan-status],
        .fair-day-workspace[data-fair-route-ready="false"] > [data-fair-route-target]:target ~ [data-fair-storage-warning],
        .fair-day-workspace[data-fair-route-ready="false"] > [data-fair-route-target]:target ~ [data-fair-mode-content],
        .fair-day-workspace[data-fair-route-ready="false"] > [data-fair-route-target]:target ~ [data-fair-loading-state] {
          display: none;
        }
        @keyframes fair-mode-panel-enter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .fair-day-workspace .fair-hero-control:hover {
            background: color-mix(in srgb, currentColor 10%, transparent);
          }
          .fair-day-workspace .fair-hero-control--photo:hover {
            background: color-mix(in srgb, var(--app-ink) 70%, transparent);
          }
          .fair-day-workspace [data-fair-mode-masthead]:hover .fair-mode-photo {
            transform: scale(1.055);
          }
          .fair-day-workspace .fair-portal-action:hover {
            transform: translateY(-2px);
            box-shadow: var(--app-elev-2);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .fair-day-workspace * {
            animation-duration: 0ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0ms !important;
          }
          .fair-day-workspace [data-fair-mode-masthead]:hover .fair-mode-photo,
          .fair-day-workspace .fair-portal-action:hover {
            transform: none;
          }
        }
      `}</style>

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-fair-plan-announcement
      >
        {plan.readyKeys.length > 0 || plan.steps.length > 0
          ? planStatus.summarySentence
          : `You are viewing ${planStatus.dateLabel}.`}
      </p>

      <header>
        {activeMode === "now" ? (
          <div
            data-fair-hero
            className="relative overflow-hidden border-b-2"
            style={{ borderColor: "var(--app-brand)" }}
          >
            <picture className="absolute inset-0 block">
              <source
                type="image/webp"
                srcSet="/images/fair/fairgrounds-night-mike-d-480.webp 480w, /images/fair/fairgrounds-night-mike-d-960.webp 960w, /images/fair/fairgrounds-night-mike-d-1920.webp 1920w"
                sizes="100vw"
              />
              <img
                src="/images/fair/fairgrounds-night-mike-d-960.jpg"
                srcSet="/images/fair/fairgrounds-night-mike-d-960.jpg 960w, /images/fair/fairgrounds-night-mike-d-1920.jpg 1920w"
                sizes="100vw"
                alt="Mike D's photograph of The Great Frederick Fair in 2024, with the illuminated Ferris wheel and midway seen from above."
                width="960"
                height="540"
                loading="eager"
                fetchPriority="high"
                className="h-full w-full object-cover object-[76%_center] sm:object-center"
              />
            </picture>
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, color-mix(in srgb, var(--app-ink) 48%, transparent), transparent 24%), linear-gradient(to top, color-mix(in srgb, var(--app-ink) 96%, transparent), color-mix(in srgb, var(--app-ink) 54%, transparent) 36%, transparent 72%)",
              }}
              aria-hidden
            />
            <span
              className="absolute inset-x-0 bottom-0 z-10 h-1.5 lg:hidden"
              style={{
                background:
                  "linear-gradient(90deg, var(--app-brand) 0 24%, var(--app-amber) 24% 41%, var(--app-brand-2) 41% 59%, var(--app-cool) 59% 78%, var(--app-accent) 78% 100%)",
              }}
              aria-hidden
            />

            <div
              data-fair-hero-content
              className="relative z-10 mx-auto flex min-h-[380px] max-w-[68rem] flex-col px-4 pb-5 pt-3 text-[var(--app-ink-inverse)] sm:min-h-[480px] sm:px-6 sm:pb-7 sm:pt-4"
            >
              <div
                data-fair-hero-controls
                className="flex flex-wrap items-start justify-between gap-2"
              >
                <Link
                  href="/today"
                  prefetch={false}
                  aria-label="Back to Frederick Radius"
                  className="fair-hero-control fair-hero-control--photo tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full"
                  style={{ color: "var(--app-ink-inverse)" }}
                >
                  <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
                </Link>
                <button
                  type="button"
                  aria-label="Help & access"
                  onClick={() => {
                    setHelpAnswerId(null);
                    setHelpCategory(null);
                    openHelp();
                  }}
                  className="fair-hero-control fair-hero-control--photo tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full"
                  style={{ color: "var(--app-ink-inverse)" }}
                >
                  <CircleHelp className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </div>

              <div data-fair-hero-identity className="mt-auto pt-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.11em] opacity-90 sm:text-[11px]">
                  <RippleMark size={24} />
                  Radius at the Fair
                </div>
                <h1
                  id="fair-now-heading"
                  tabIndex={-1}
                  className="mt-2 max-w-[14ch] font-editorial text-[44px] font-normal leading-[0.94] tracking-[-0.035em] sm:mt-2 sm:text-[72px]"
                  style={{
                    textShadow:
                      "0 2px 10px color-mix(in srgb, var(--app-ink) 58%, transparent)",
                  }}
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
                <button
                  type="button"
                  onClick={() => setPhotoExplorerOpen(true)}
                  className="fair-hero-control fair-hero-control--photo tap-44 mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[12px] font-extrabold"
                  style={{ color: "var(--app-ink-inverse)" }}
                  data-fair-photo-explore-trigger
                >
                  <Camera className="h-4 w-4" aria-hidden />
                  See the Fair from above
                </button>
              </div>
            </div>
          </div>
        ) : activeMode === "map" || activeMode === "my-day" || activeMode === "find" ? (
          <div
            data-fair-compact-header
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
                className="fair-hero-control tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full"
                style={{ color: "var(--app-brand-press)" }}
                aria-label="Back to Fair Today"
              >
                <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
              </button>
              <div className="min-w-0 text-center">
                <p className="truncate text-[16px] font-extrabold tracking-[-0.02em]">
                  {activePrimaryLabel}
                </p>
                <p
                  data-fair-compact-header-date
                  className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.06em] tabular-nums sm:text-[12px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {storageReady
                    ? fairDateShortLabel(selectedDate)
                    : "Restoring your day"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHelpAnswerId(null);
                  setHelpCategory(null);
                  openHelp();
                }}
                className="fair-hero-control tap-44 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Help & access"
              >
                <CircleHelp className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </div>
          </div>
        ) : (
          <FairPhotoMasthead
            mode={activeMode}
            onBack={() => chooseMode("now")}
            onHelp={() => {
              setHelpAnswerId(null);
              setHelpCategory(null);
              openHelp();
            }}
          />
        )}

        <div
          data-fair-primary-nav-shell
          className={`relative z-20 mx-auto hidden max-w-[60rem] px-6 lg:block ${activeMode === "now" || activeMode === "travel" ? "-mt-5" : "mt-3"}`}
        >
          <nav
            data-fair-primary-nav
            className="relative grid grid-cols-4 gap-1.5 overflow-hidden rounded-[var(--app-radius-xl)] border p-1.5 pt-2.5 backdrop-blur-xl"
            style={{
              borderColor: "var(--app-control-border)",
              background:
                "color-mix(in srgb, var(--app-bg-elevated-solid) 96%, transparent)",
              boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
            }}
            aria-label="Fair Day"
          >
            <span
              className="absolute inset-x-0 top-0 h-1.5"
              style={{
                background:
                  "linear-gradient(90deg, var(--app-brand) 0 24%, var(--app-amber) 24% 41%, var(--app-brand-2) 41% 59%, var(--app-cool) 59% 78%, var(--app-accent) 78% 100%)",
              }}
              aria-hidden
            />
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
                  className="tap-44 tactile tactile-interactive grid min-h-[62px] grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-[var(--app-radius-lg)] border px-2.5 py-2 text-left transition-[background-color,border-color,transform] active:scale-[0.985] motion-reduce:transition-none"
                  style={{
                    borderColor: active
                      ? `color-mix(in srgb, ${mode.accent} 34%, var(--app-border))`
                      : "transparent",
                    color: active
                      ? mode.accent
                      : "var(--app-ink-2)",
                    background: active
                      ? `color-mix(in srgb, ${mode.accent} 8%, var(--app-bg-elevated-solid))`
                      : "transparent",
                  }}
                >
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full"
                    style={{
                      color: active
                        ? "var(--app-on-brand)"
                        : "var(--app-ink-2)",
                      background: active
                        ? mode.accent
                        : "var(--app-bg-sunken)",
                    }}
                    aria-hidden
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-extrabold leading-tight">
                      {mode.label}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[11px] font-semibold leading-tight"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {storageReady && mode.id === "my-day" && plan.steps.length > 0
                        ? `${plan.steps.length} saved · ${savedDayCount} ${savedDayCount === 1 ? "day" : "days"}`
                        : mode.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {!routeReady || !storageReady ? (
        <div
          data-fair-loading-state
          role="status"
          className="mx-4 mt-4 flex items-center gap-3 rounded-[var(--app-radius-lg)] border px-4 py-3 sm:mx-6 lg:mx-auto lg:w-[min(100%-3rem,68rem)]"
          style={{
            borderColor: "var(--app-border-strong)",
            background: "var(--app-bg-elevated-solid)",
            color: "var(--app-ink-2)",
          }}
        >
          <RippleMark size={24} />
          <p className="text-[13px] font-semibold leading-snug">
            Preparing the Fair guide. Restoring your date and saved plan now.
          </p>
        </div>
      ) : null}

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

      <div
        data-fair-mode-content
        hidden={!routeReady || !storageReady}
        className={
          activeMode === "map"
            ? "w-full pb-24 lg:mx-auto lg:max-w-[68rem] lg:px-6 lg:pb-12 lg:pt-6"
            : `mx-auto px-4 pb-32 sm:px-6 lg:pb-12 ${
                activeMode === "travel"
                  ? "pt-3 sm:pt-6"
                  : activeMode === "now"
                    ? "pt-3 sm:pt-5"
                    : "pt-6 sm:pt-8"
              } ${
                activeMode === "find" ? "max-w-[68rem]" : "max-w-[48rem]"
              }`
        }
      >
        {activeMode === "now" ? (
          <section
            id={MODE_PANEL_IDS.now}
            aria-labelledby="fair-now-heading"
            data-fair-mode-panel
          >
            <section
              data-fair-at-a-glance
              aria-labelledby="fair-at-a-glance-heading"
              className="text-[var(--app-ink)]"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_7.75rem] items-center gap-3">
                <div className="min-w-0">
                  <h2
                    id="fair-at-a-glance-heading"
                    className="text-[20px] font-bold leading-tight tracking-[-0.025em] sm:text-[24px]"
                  >
                    {fairDateWeekdayLabel(selectedDate)} at a glance
                  </h2>
                  {plan.readyKeys.length > 0 || plan.steps.length > 0 ? <p
                    data-fair-plan-summary
                    className="mt-1 text-[12px] font-semibold leading-snug"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {planStatus.readinessLabel}
                    <span aria-hidden="true"> · </span>
                    {planStatus.savedStopsLabel}
                  </p> : null}
                </div>

                <label data-fair-plan-date className="w-full shrink-0">
                  <span className="sr-only">Fair day in your plan</span>
                  <select
                    value={selectedDate}
                    onChange={(event) => chooseFairDate(event.target.value)}
                    aria-label="Fair day in your plan"
                    className="h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] px-2.5 text-[12px] font-semibold"
                    style={{
                      borderColor: "var(--app-control-border)",
                      color: "var(--app-ink)",
                    }}
                  >
                    {data.dates.map((day) => (
                      <option key={day.date} value={day.date}>
                        {day.weekdayLabel}, Sep {day.dayLabel}
                        {(savedCountsByDate[day.date] ?? 0) > 0
                          ? ` · ${savedCountsByDate[day.date]} saved`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                data-fair-glance-board
                className="mt-3 grid grid-cols-3 divide-x border-y py-1"
                style={{ borderColor: "var(--app-border)" }}
              >
                <FairGlanceTile
                  kind="gate"
                  label={gateGlance.label}
                  value={gateGlance.value}
                  detail={gateGlance.detail}
                  icon={<Clock3 className="h-[17px] w-[17px]" />}
                  accent="var(--app-brand)"
                  ariaLabel={`View ${fairDateWeekdayLabel(selectedDate)} program and gate schedule`}
                  onClick={() => chooseMode("find")}
                />
                <FairGlanceTile
                  kind="admission"
                  label="Admission"
                  value={admissionValue}
                  detail={admissionDetail}
                  icon={<TicketCheck className="h-[17px] w-[17px]" />}
                  accent="var(--app-accent-press)"
                  ariaLabel="Review ticket and admission choices"
                  onClick={() => openPreparation("ticket")}
                />
                <FairGlanceTile
                  kind="parking"
                  label="Parking"
                  value={parkingPrimary}
                  detail={parkingDetail}
                  icon={<MapPinned className="h-[17px] w-[17px]" />}
                  accent="var(--app-cool)"
                  ariaLabel="Compare parking and travel choices"
                  onClick={() => chooseMode("travel")}
                />
              </div>

              {planNotice ? (
                <p
                  role="status"
                  data-fair-glance-alert
                  className="mt-2.5 rounded-[var(--app-radius-md)] px-3 py-2 text-[11.5px] font-semibold leading-snug"
                  style={{
                    background:
                      "color-mix(in srgb, var(--app-warning) 11%, var(--app-bg-elevated-solid))",
                    color: "var(--app-ink)",
                  }}
                >
                  {planNotice}
                </p>
              ) : null}

              <div className="mt-2.5 flex items-center gap-3">
                <p
                  className="line-clamp-2 min-w-0 flex-1 text-[11.5px] font-medium leading-snug"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {planStatus.stateLabel}
                </p>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => openPlanNextAction(planStatus)}
                  iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}
                >
                  {planStatus.nextActionLabel}
                </Button>
              </div>
            </section>

            {offersForSelectedDate.some((offer) => offer.placement === "eligibility-promotion") ? (
              <section data-fair-day-promotions aria-label="Admission promotions for this day" className="mt-3 divide-y border-y" style={{ borderColor: "var(--app-border)" }}>
                {offersForSelectedDate.filter((offer) => offer.placement === "eligibility-promotion").map((offer) => (
                  <button key={offer.id} type="button" onClick={() => openPreparation("ticket")} className="tap-44 flex min-h-12 w-full items-start justify-between gap-3 py-3 text-left">
                    <span className="min-w-0"><span className="block text-[14px] font-bold">{offer.label}</span><span className="mt-1 block text-[13px] leading-relaxed text-[var(--app-ink-2)]">{offer.detail}</span></span>
                    <span className="shrink-0 text-[14px] font-bold text-[var(--app-brand-press)]">{offer.priceLabel}</span>
                  </button>
                ))}
              </section>
            ) : null}
            <FairKeepGuide />

            <section
              data-fair-now-portal
              aria-labelledby="fair-now-portal-heading"
              className="mt-5"
            >
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="fair-now-portal-heading"
                    className="max-w-[20ch] text-[24px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[30px]"
                  >
                    What do you need first?
                  </h2>
                </div>
                <FairShareButton />
              </div>
              <div
                className="mt-3 flex flex-col sm:grid sm:grid-cols-3 sm:gap-2.5"
                data-fair-wallet-stack
              >
                {[
                  {
                    label: "See what’s on",
                    detail: "See the day’s program, sorted around your visit.",
                    Icon: Clock3,
                    accent: "var(--app-accent)",
                    wash:
                      "color-mix(in srgb, var(--app-accent) 13%, var(--app-bg-elevated-solid))",
                    action: () => chooseMode("find"),
                  },
                  {
                    label: "Find it on the grounds",
                    detail: "Gates, restrooms, animals, stages and your saved stops.",
                    Icon: MapPinned,
                    accent: "var(--app-cool)",
                    wash:
                      "color-mix(in srgb, var(--app-cool) 11%, var(--app-bg-elevated-solid))",
                    action: () => chooseMode("map"),
                  },
                  {
                    label: "Plan your arrival",
                    detail: "Compare parking, County Transit, and drop-off before you leave.",
                    Icon: BusFront,
                    accent: "var(--app-cool)",
                    wash:
                      "color-mix(in srgb, var(--app-cool) 11%, var(--app-bg-elevated-solid))",
                    action: () => chooseMode("travel"),
                  },
                ].map(({ label, detail, Icon, accent, wash, action }, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    data-fair-wallet-card={index + 1}
                    className={`fair-portal-action tap-44 group relative flex min-h-[100px] items-center gap-3 overflow-hidden rounded-[var(--app-radius-lg)] border px-3 pb-4 pt-3 text-left active:scale-[0.985] focus-visible:z-[var(--z-nav)] sm:ml-0 sm:mt-0 sm:min-h-[150px] sm:flex-col sm:items-start sm:justify-between sm:p-4 ${index === 0 ? "z-10" : index === 1 ? "z-20 -mt-2 ml-1" : "z-30 -mt-2 ml-2"}`}
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--app-border-strong) 82%, transparent)",
                      background: `linear-gradient(118deg, color-mix(in srgb, ${accent} 7%, transparent), transparent 42%), ${wash}`,
                      boxShadow: `inset 0 3px 0 ${accent}, var(--app-hi), var(--app-lip), var(--app-deck-edge), var(--app-elev-2)`,
                    }}
                  >
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                      style={{ background: accent, color: "var(--app-on-brand)" }}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      className="min-w-0 flex-1 sm:flex-none"
                      data-fair-wallet-copy
                    >
                      <span className="block text-[16px] font-extrabold leading-tight tracking-[-0.02em]">
                        {label}
                      </span>
                      <span
                        className="mt-1 block text-[12px] font-medium leading-snug"
                        style={{ color: "var(--app-ink-2)" }}
                      >
                        {detail}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none sm:self-end"
                      style={{ color: accent }}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
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
                <a href={data.source.sourceUrl} target="_blank" rel="noopener noreferrer" className="tap-44 inline-flex min-h-11 items-center font-semibold underline underline-offset-4" style={{ color: "var(--app-brand-press)" }}>
                  Official source
                </a>
              </p>
            </details>
          </section>
        ) : null}

        {activeMode === "find" ? (
          <section
            id={MODE_PANEL_IDS.find}
            aria-labelledby="fair-find-heading"
            data-fair-mode-panel
          >
            <div
              className="sticky top-0 z-[var(--z-sticky)] -mx-4 flex items-center justify-between gap-3 border-b px-4 py-1 backdrop-blur-md sm:-mx-6 sm:px-6"
              style={{
                borderColor: "var(--app-border)",
                background:
                  "color-mix(in srgb, var(--app-bg) 91%, transparent)",
              }}
              data-fair-program-context
            >
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
                  Clear filters
                </button>
              ) : <span aria-hidden="true" />}
              <FairDayPicker
                dates={data.dates}
                selectedDate={selectedDate}
                onChange={chooseFairDate}
                label="Fair day to explore"
                visibleLabel="Fair day"
                savedCountsByDate={savedCountsByDate}
              />
            </div>
            <h1
              id="fair-find-heading"
              tabIndex={-1}
              className="sr-only"
            >
              Fair program
            </h1>
            <div className="mt-3">
              <label className="block min-w-0" htmlFor="fair-unified-search">
                <span className="sr-only">Search the Fair</span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--app-ink-3)" }} aria-hidden />
                  <input
                    id="fair-unified-search"
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                    }}
                    placeholder="Search events or shows"
                    className="h-14 w-full rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] pl-11 pr-3 text-[16px] outline-none placeholder:text-[var(--app-ink-3)]"
                    style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
                  />
                </span>
              </label>

            </div>

            {grandstandSpotlightItem && !exploreFocused ? (
              <div className="mt-3">
                <FairGrandstandSpotlight
                  item={grandstandSpotlightItem}
                  onOpen={openProgramDetail}
                  compact
                />
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Filter the Fair program" data-fair-program-filters>
                {SCHEDULE_FILTERS.map((filter) => {
                  const active = scheduleFilter === filter.id;
                  const Icon = filter.Icon;
                  const accent = scheduleAccent(filter.kind);
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={active}
                      data-fair-program-filter={filter.id}
                      onClick={() => {
                        setScheduleFilter(filter.id);
                      }}
                      className="tap-44 flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md)] border px-0 py-2 text-center text-[11px] font-semibold leading-tight min-[375px]:px-1 min-[375px]:text-[12px] sm:min-h-12 sm:flex-row sm:gap-2 sm:px-2 sm:text-[13px]"
                      style={{
                        borderColor: active ? accent : "var(--app-border)",
                        background: active ? `color-mix(in srgb, ${accent} 10%, var(--app-bg-elevated-solid))` : "var(--app-bg-elevated)",
                        color: "var(--app-ink)",
                        boxShadow: active ? `inset 0 -2px 0 ${accent}` : undefined,
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
                      <span className="min-w-0 max-w-full [overflow-wrap:anywhere]">{filter.label}</span>
                    </button>
                  );
                })}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {scheduleFilter === "food" ? "These are scheduled food and drink activities, not food stands." : "Browse food stands and shopping."}
              </p>
              <a href={data.externalGuide.url} target="_blank" rel="noopener noreferrer"
                data-fair-vendor-search aria-label="Search official vendor booths"
                className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold underline underline-offset-4"
                style={{ color: "var(--app-brand-press)" }}>
                <Store className="h-4 w-4" aria-hidden />
                Official booths
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
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

            <div className="mt-3">
                <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }} aria-live="polite">
                  {matchingSchedule.length} {matchingSchedule.length === 1 ? "match" : "matches"}, sorted by time · Gates {selectedDay?.gateHoursLabel ?? "time not listed"}
                </p>
            </div>

            {visibleSchedule.length > 0 ? (
              !exploreFocused ? (
                <div className="mt-3 space-y-2" data-fair-program-groups>
                  {nonEmptyScheduleGroups.map((group) => (
                    <details
                      key={group.id}
                      open={visibleSchedule.length <= 12 || group.id === defaultOpenDaypart ? true : undefined}
                      className="group border-t"
                      style={{ borderColor: "var(--app-border-strong)" }}
                      data-fair-program-daypart={group.id}
                    >
                      <summary className="tap-44 flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-extrabold [&::-webkit-details-marker]:hidden">
                        <span>{group.label}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className="text-[12px] font-semibold tabular-nums"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {group.items.length}
                          </span>
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                        </span>
                      </summary>
                      <div className="pb-3">
                        <FairProgramResultList
                          items={group.items}
                          plan={plan}
                          label={`${group.label} Fair program results`}
                          asOf={partyAsOf}
                          selectedDate={selectedDate}
                          nextStart={programNextStart}
                          dayClosesAt={selectedDay?.gateClosesAt}
                          onToggle={toggleFairScheduleItem}
                          onOpen={openProgramDetail}
                        />
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <FairProgramResultList
                  items={visibleSchedule}
                  plan={plan}
                  label="Fair program results"
                  asOf={partyAsOf}
                  selectedDate={selectedDate}
                  nextStart={programNextStart}
                  dayClosesAt={selectedDay?.gateClosesAt}
                  onToggle={toggleFairScheduleItem}
                  onOpen={openProgramDetail}
                />
              )
            ) : (
              <div className="py-10 text-center">
                <p className="text-[17px] font-semibold">
                  No program event matches that search.
                </p>
                <p className="mt-2 text-[14px]" style={{ color: "var(--app-ink-3)" }}>
                  {contextualAnswers.length > 0
                    ? "A reviewed Fair answer is shown above."
                    : "Try another word, category, or Fair day."}
                </p>
              </div>
            )}

          </section>
        ) : null}

        {activeMode === "map" ? (
          <section
            id={MODE_PANEL_IDS.map}
            aria-labelledby="fair-grounds-map-heading"
          >
            <FairGroundsMap
              savedStops={mappedPlanStops}
              focusRequest={mapFocusRequest}
              onFocusRequestHandled={handleMapFocusRequest}
              programItems={discoveryItems.map((item) => ({
                id: item.id,
                title: item.title,
                timeLabel: item.timeLabel,
                placeLabel: item.placeLabel,
              }))}
              onBrowseProgram={() => chooseMode("find")}
              onOpenProgramItem={openProgramDetail}
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
          <section
            id={MODE_PANEL_IDS["my-day"]}
            aria-labelledby="fair-my-day-heading"
            data-fair-mode-panel
          >
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
                savedCountsByDate={savedCountsByDate}
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
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {plannedRows.length > 0 ? `${plannedRows.length} saved ${plannedRows.length === 1 ? "stop" : "stops"} for ${fairDateShortLabel(selectedDate)}.` : "Save a show or activity from the program to start your day."}
            </p>

            <details
              className="mt-4 border-y py-1"
              style={{
                borderColor: "var(--app-border)",
              }}
              data-fair-journey
            >
              <summary className="tap-44 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[14px] font-semibold">
                <span>Tickets &amp; arrival <span className="font-normal text-[var(--app-ink-3)]">· {[ticketAndGateReady, travelReady, firstStopReady].filter(Boolean).length}/3 ready</span></span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              </summary>
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
            </details>

            {plannedRows.length === 0 && !selectedArrival ? (
              <Button
                className="mt-4 w-full"
                onClick={() => chooseMode("find")}
                iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}
              >
                Choose your first Fair stop
              </Button>
            ) : null}

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
                        {index === 0 && item && step.sourceState === "current" ? (
                          <figure className="mb-4 overflow-hidden rounded-[var(--app-radius-lg)]">
                            {/* Owned Fairgrounds atmosphere, not documentation of this event. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/fair/fairgrounds-midway-mike-d-960.jpg" width="960" height="540" alt="The Great Frederick Fair midway seen from above at dusk." loading="lazy" className="aspect-[16/9] w-full object-cover" />
                            <figcaption className="mt-1 text-[10px] text-[var(--app-ink-3)]">Fairgrounds atmosphere · Mike D, 2024</figcaption>
                          </figure>
                        ) : null}
                        {step.sourceState === "changed-or-removed" ? (
                          <p
                            data-fair-plan-source-state="needs-review"
                            className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em]"
                            style={{ color: "var(--app-warning-press)" }}
                          >
                            Needs review · changed in the official program
                          </p>
                        ) : null}
                        <p className="text-[13px] font-bold tabular-nums" style={{ color: item ? scheduleAccent(item.kind) : "var(--app-warning-press)" }}>
                          {item?.timeLabel ?? step.timeLabelSnapshot ?? "Time not published"}
                        </p>
                        <p className="mt-1 text-[24px] font-bold leading-tight tracking-[-0.025em] sm:text-[30px]">{title}</p>
                        {place ? <p className="mt-1 text-[14px]" style={{ color: "var(--app-ink-2)" }}>{place}</p> : null}
                        {item ? (
                          <div className="mt-2 flex flex-wrap gap-x-5">
                            <button type="button" onClick={(event) => openProgramDetail(item.id, event.currentTarget)} className="tap-44 inline-flex min-h-11 items-center gap-1 text-[13px] font-bold text-[var(--app-brand-press)]" aria-label={`Open details for ${title}`}>Details <ChevronRight className="h-4 w-4" aria-hidden /></button>
                            {place && step.sourceState === "current" ? <button type="button" onClick={() => showProgramItemOnMap(item)} className="tap-44 inline-flex min-h-11 items-center gap-2 text-[13px] font-bold text-[var(--app-cool)]" aria-label={`Show ${title} on the Fair map`}><MapPinned className="h-4 w-4" aria-hidden /> Show on map</button> : null}
                          </div>
                        ) : null}
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
          <section
            id={MODE_PANEL_IDS.travel}
            aria-labelledby="fair-travel-heading"
            data-fair-mode-panel
          >
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
                savedCountsByDate={savedCountsByDate}
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
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-nav)] px-2 lg:hidden"
        style={{
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <nav
          aria-label="Fair Day"
          className="pointer-events-auto relative mx-auto grid max-w-screen-md grid-cols-4 gap-1 overflow-hidden rounded-[var(--app-radius-xl)] border p-1 pt-2 backdrop-blur-xl"
          style={{
            borderColor: "var(--app-control-border)",
            background:
              "color-mix(in srgb, var(--app-bg-elevated-solid) 96%, transparent)",
            boxShadow:
              "var(--app-elev-2), 0 -12px 30px -24px color-mix(in srgb, var(--app-ink) 38%, transparent)",
          }}
        >
          <span
            className="absolute inset-x-0 top-0 h-1"
            style={{
              background:
                "linear-gradient(90deg, var(--app-brand) 0 24%, var(--app-amber) 24% 41%, var(--app-brand-2) 41% 59%, var(--app-cool) 59% 78%, var(--app-accent) 78% 100%)",
            }}
            aria-hidden
          />
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
                  storageReady && mode.id === "my-day" && plannedRows.length > 0
                    ? `${mode.label}, ${plannedRows.length} saved`
                    : mode.label
                }
                className="tap-44 tactile tactile-interactive relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-lg)] px-1 text-[11px] font-semibold transition-[background-color,color,transform] active:scale-[0.97] motion-reduce:transition-none"
                style={{
                  color: active
                    ? mode.accent
                    : "var(--app-ink-2)",
                  background: "transparent",
                }}
              >
                <span
                  className="relative grid h-8 w-10 place-items-center rounded-full"
                  style={{
                    color: active
                      ? "var(--app-on-brand)"
                      : "var(--app-ink-2)",
                    background: active
                      ? mode.accent
                      : "var(--app-bg-sunken)",
                  }}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                  {storageReady && mode.id === "my-day" && plannedRows.length > 0 ? (
                    <span
                      className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border px-1 text-[10px] font-extrabold leading-none tabular-nums"
                      style={{
                        color: "var(--app-on-brand)",
                        borderColor: "var(--app-bg-elevated-solid)",
                        background: "var(--app-brand-press)",
                      }}
                    >
                      {plannedRows.length}
                    </span>
                  ) : null}
                </span>
                <span>
                  {mode.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <FairPhotoExplorer
        open={photoExplorerOpen}
        onOpenChange={setPhotoExplorerOpen}
        onShowGrandstandProgram={showGrandstandProgram}
        onFindRides={showRidesProgram}
        onShowGrandstandMap={() =>
          showReviewedFairMapFeature("osm-way-103615596")
        }
      />

      <BottomDrawer
        open={activePreparation === "ticket"}
        onOpenChange={(open) =>
          open ? openPreparation("ticket") : closePreparation("ticket")
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
          open ? openPreparation("entry") : closePreparation("entry")
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
          if (!open) closeProgramDetail(true);
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
            {selectedProgramDetail.sourceItem.text.trim() !==
            selectedProgramDetail.title.trim() ? (
              <details
                data-fair-official-wording
                className="mt-4 rounded-[var(--app-radius-md)] border px-3"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-sunken)",
                }}
              >
                <summary
                  className="tap-44 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[13px] font-semibold"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  Imported official wording
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                </summary>
                <p
                  className="border-t pb-3 pt-3 text-[13px] leading-relaxed"
                  style={{
                    borderColor: "var(--app-border)",
                    color: "var(--app-ink-2)",
                  }}
                >
                  {selectedProgramDetail.sourceItem.text}
                </p>
              </details>
            ) : null}
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
              {compactPlaceLabel(selectedProgramDetail.placeLabel) ? (
                <Button
                  className="w-full sm:w-auto"
                  variant="secondary"
                  onClick={() => showProgramItemOnMap(selectedProgramDetail)}
                  iconLeft={<MapPinned className="h-4 w-4" aria-hidden />}
                >
                  Show on map
                </Button>
              ) : null}
              <Button
                className="w-full sm:w-auto"
                href={selectedProgramDetail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
              >
                {selectedProgramDetail.sourceReview
                  ? "Official Grandstand source"
                  : "Official program source"}
              </Button>
            </div>
          </div>
        ) : null}
      </BottomDrawer>

      <BottomDrawer
        open={helpOpen}
        onOpenChange={(open) => {
          if (open) openHelp();
          else closeHelp();
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
              Radius checked this official program source on {data.source.checkedLabel}. {data.source.ageLabel}.
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
                closeHelp();
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

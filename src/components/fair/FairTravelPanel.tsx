"use client";

import {
  BusFront,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MapPin,
  Navigation,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";

import FairArrivalStatus from "./FairArrivalStatus";
import FairCarMemoryPanel from "./FairCarMemoryPanel";
import type { FairDayArrivalView, FairDayWorkspaceData } from "./types";

export type FairTravelPanelProps = {
  options: FairDayArrivalView[];
  selected: FairDayArrivalView | null;
  selectedDate: string;
  eventPhase: FairDayWorkspaceData["eventPhase"];
  ready: boolean;
  onSelect: (option: FairDayArrivalView) => void;
  onReadyChange: (ready: boolean) => void;
};

type SupportedArrivalChoice = "drive" | "transit" | "drop-off";

const MODE_META: Record<
  SupportedArrivalChoice,
  { label: string; detail: string; icon: LucideIcon }
> = {
  drive: {
    label: "Drive / Park",
    detail: "Parking, payment, and your car",
    icon: CarFront,
  },
  transit: {
    label: "County Transit",
    detail: "Fare-free network context",
    icon: BusFront,
  },
  "drop-off": {
    label: "Drop-off",
    detail: "Meet-up and return point",
    icon: UsersRound,
  },
};

type SupportedArrivalOption = FairDayArrivalView & {
  planChoice: SupportedArrivalChoice;
};

function isSupportedOption(
  option: FairDayArrivalView,
): option is SupportedArrivalOption {
  return (
    option.planChoice === "drive" ||
    option.planChoice === "transit" ||
    option.planChoice === "drop-off"
  );
}

function SourceDisclosure({ option }: { option: FairDayArrivalView }) {
  return (
    <details
      className="group mt-5 border-t pt-2"
      style={{ borderColor: "var(--app-border)" }}
    >
      <summary
        className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-cool)] [&::-webkit-details-marker]:hidden"
        style={{ color: "var(--app-ink-2)" }}
      >
        Sources and limits
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="pb-1 pt-2">
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Radius summarizes reviewed information for planning. Conditions can
          change, so use the official source for the final decision.
        </p>
        <Button
          className="mt-2"
          href={option.officialInfoUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="quiet"
          iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
        >
          Open the official information
        </Button>
      </div>
    </details>
  );
}

function FactBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-l-2 pl-4" style={{ borderColor: "var(--app-cool)" }}>
      <p
        className="text-[13px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "var(--app-cool)" }}
      >
        {label}
      </p>
      <div
        className="mt-1 text-[15px] font-semibold leading-relaxed"
        style={{ color: "var(--app-ink)" }}
      >
        {children}
      </div>
    </div>
  );
}

function DriveFlow({
  option,
  eventPhase,
}: {
  option: FairDayArrivalView;
  eventPhase: FairDayWorkspaceData["eventPhase"];
}) {
  const canSaveCar = eventPhase === "fair-day";

  return (
    <div>
      <FactBlock label="Parking and payment">{option.paymentLabel}</FactBlock>
      <p
        className="mt-4 text-[14px] leading-relaxed"
        style={{ color: "var(--app-ink-2)" }}
      >
        {option.summary}
      </p>
      <div className="mt-5 flex items-start gap-3">
        <Navigation
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: "var(--app-cool)" }}
          aria-hidden
        />
        <div>
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            {option.returnLabel}
          </p>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            {option.returnSummary}
          </p>
        </div>
      </div>

      {canSaveCar ? (
        <FairCarMemoryPanel enabled />
      ) : (
        <Button
          className="mt-6 w-full sm:w-auto"
          href={option.officialInfoUrl}
          target="_blank"
          rel="noopener noreferrer"
          iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
        >
          Check official parking details
        </Button>
      )}

      <SourceDisclosure option={option} />
    </div>
  );
}

function TransitFlow({ option }: { option: FairDayArrivalView }) {
  return (
    <div>
      <FactBlock label="What is confirmed">{option.paymentLabel}</FactBlock>
      <p
        className="mt-4 text-[14px] leading-relaxed"
        style={{ color: "var(--app-ink-2)" }}
      >
        {option.summary}
      </p>

      <div
        className="mt-5 border-l-4 px-4 py-3"
        style={{
          borderColor: "var(--app-warning-press)",
          background:
            "color-mix(in srgb, var(--app-amber) 12%, var(--app-bg-elevated))",
        }}
        role="note"
      >
        <p
          className="flex items-start gap-2 text-[14px] font-semibold leading-relaxed"
          style={{ color: "var(--app-ink)" }}
        >
          <TriangleAlert
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: "var(--app-warning-press)" }}
            aria-hidden
          />
          Fair-date service and arrival times are not confirmed from the
          current Fair data pack.
        </p>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          The nearby stop and route names are static network context. Check the
          official County Transit information before relying on this trip.
        </p>
      </div>

      <Button
        className="mt-6 w-full sm:w-auto"
        href="/transit"
        iconLeft={<BusFront className="h-4 w-4" aria-hidden />}
      >
        Open Radius Transit
      </Button>

      <SourceDisclosure option={option} />
    </div>
  );
}

function DropOffFlow({ option }: { option: FairDayArrivalView }) {
  return (
    <div>
      <FactBlock label="Drop-off point">{option.summary}</FactBlock>
      <div className="mt-5 flex items-start gap-3">
        <MapPin
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: "var(--app-cool)" }}
          aria-hidden
        />
        <div>
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            {option.returnLabel}
          </p>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            {option.returnSummary}
          </p>
        </div>
      </div>

      <Button
        className="mt-6 w-full sm:w-auto"
        href={option.officialInfoUrl}
        target="_blank"
        rel="noopener noreferrer"
        iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
      >
        Confirm official drop-off details
      </Button>

      <SourceDisclosure option={option} />
    </div>
  );
}

const READY_ACTION: Record<SupportedArrivalChoice, string> = {
  drive: "Use this driving plan",
  transit: "I checked Fair-date service",
  "drop-off": "Use this drop-off plan",
};

function TravelReadinessControl({
  choice,
  ready,
  onReadyChange,
}: {
  choice: SupportedArrivalChoice;
  ready: boolean;
  onReadyChange: (ready: boolean) => void;
}) {
  return (
    <div
      className="mt-5 border-y py-4"
      style={{ borderColor: "var(--app-border-strong)" }}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-[0.11em]"
        style={{ color: "var(--app-cool)" }}
      >
        Travel and return
      </p>
      <p
        className="mt-1 max-w-[34rem] text-[13px] leading-relaxed"
        style={{ color: "var(--app-ink-2)" }}
      >
        {ready
          ? "This travel and return plan is marked ready on this device."
          : choice === "transit"
            ? "This records only your check. Radius is not confirming Fair-date service or arrival times."
            : "Mark this ready after you have checked the official details you need."}
      </p>
      <Button
        className="mt-3 w-full sm:w-auto"
        variant="secondary"
        aria-pressed={ready}
        onClick={() => onReadyChange(!ready)}
        iconLeft={
          ready ? <Check className="h-4 w-4" aria-hidden /> : undefined
        }
      >
        {ready ? "Mark travel plan not ready" : READY_ACTION[choice]}
      </Button>
    </div>
  );
}

export default function FairTravelPanel({
  options,
  selected,
  selectedDate,
  eventPhase,
  ready,
  onSelect,
  onReadyChange,
}: FairTravelPanelProps) {
  const groupName = useId();
  const supportedOptions = options.filter(isSupportedOption);
  const activeOption =
    selected && isSupportedOption(selected)
      ? supportedOptions.find((option) => option.id === selected.id) ?? null
      : null;
  return (
    <div aria-label="Fair travel choices">
      <FairArrivalStatus
        selectedDate={selectedDate}
        transitSelected={activeOption?.planChoice === "transit"}
      />
      {supportedOptions.length > 0 ? (
        <fieldset className="mt-5">
          <legend className="sr-only">Choose a travel mode</legend>
          <div
            className="divide-y border-y"
            role="radiogroup"
            aria-label="Fair travel mode"
            style={{ borderColor: "var(--app-border-strong)" }}
          >
            {supportedOptions.map((option) => {
              const meta = MODE_META[option.planChoice];
              const Icon = meta.icon;
              const checked = activeOption?.id === option.id;
              return (
                <label
                  key={option.id}
                  className="relative flex min-h-[72px] cursor-pointer items-center gap-3 border-l-[3px] px-3 py-3 text-left outline-none transition-colors focus-within:ring-2 focus-within:ring-[color:var(--app-cool)] focus-within:ring-offset-2 focus-within:ring-offset-[color:var(--app-bg)] motion-reduce:transition-none"
                  style={{
                    borderLeftColor: checked ? "var(--app-cool)" : "transparent",
                    background: checked
                      ? "var(--app-cool-tint-14)"
                      : "transparent",
                    color: "var(--app-ink)",
                  }}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name={groupName}
                    value={option.id}
                    checked={checked}
                    onChange={() => onSelect(option)}
                  />
                  <Icon
                    className="h-5 w-5 shrink-0"
                    style={{
                      color: checked ? "var(--app-cool)" : "var(--app-ink-2)",
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-tight">
                      {meta.label}
                    </span>
                    <span className="mt-1 block text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                      {meta.detail}
                    </span>
                  </span>
                  {checked ? (
                    <Check className="h-5 w-5 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p
          className="mt-5 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          No reviewed travel option is available yet. Check the official Fair
          information before you leave.
        </p>
      )}

      {activeOption ? (
        <div
          className="mt-5 border-t pt-5"
          style={{ borderColor: "var(--app-border-strong)" }}
          aria-live="polite"
        >
          {activeOption.planChoice === "drive" ? (
            <DriveFlow option={activeOption} eventPhase={eventPhase} />
          ) : null}
          {activeOption.planChoice === "transit" ? (
            <TransitFlow option={activeOption} />
          ) : null}
          {activeOption.planChoice === "drop-off" ? (
            <DropOffFlow option={activeOption} />
          ) : null}
          <TravelReadinessControl
            choice={activeOption.planChoice}
            ready={ready}
            onReadyChange={onReadyChange}
          />
        </div>
      ) : supportedOptions.length > 0 ? (
        <div
          className="mt-5 border-l-2 py-1 pl-4"
          style={{ borderColor: "var(--app-cool)" }}
        >
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Choose a travel mode to see only the steps you need.
          </p>
        </div>
      ) : null}
    </div>
  );
}

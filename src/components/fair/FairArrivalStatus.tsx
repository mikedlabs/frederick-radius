"use client";

import {
  ChevronDown,
  ExternalLink,
  Radio,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import type {
  FairArrivalEvidence,
  FairArrivalSourceState,
  FairArrivalStatus,
} from "@/lib/fair/arrival-status";

type LoadedStatus = {
  key: string;
  value: FairArrivalStatus;
};

function statusResponse(value: unknown): value is FairArrivalStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FairArrivalStatus>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.generatedAt === "string" &&
    typeof candidate.headline === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.signals) &&
    Array.isArray(candidate.sources)
  );
}

function easternTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function sourceStateLabel(state: FairArrivalSourceState): string {
  switch (state) {
    case "current":
      return "Current";
    case "partial":
      return "Partial coverage";
    case "stale":
      return "Stale";
    case "unavailable":
      return "Unavailable";
  }
}

function compactCalmStatus(status: FairArrivalStatus): boolean {
  if (status.state === "not-today") return true;
  return (
    status.state === "no-current-update" &&
    status.coverage === "configured-sources-current" &&
    status.signals.length === 0 &&
    status.hiddenSignalCount === 0 &&
    status.transit === null &&
    status.sources.length > 0 &&
    status.sources.every((source) => source.state === "current")
  );
}

function latestSourceCheck(status: FairArrivalStatus): string | null {
  const checks = status.sources
    .map((source) => Date.parse(source.checkedAt))
    .filter(Number.isFinite);
  if (checks.length === 0) return null;
  return new Date(Math.max(...checks)).toISOString();
}

function EvidenceLine({ evidence }: { evidence: FairArrivalEvidence }) {
  return (
    <p
      className="mt-0 text-[12px] font-semibold leading-relaxed sm:mt-2"
      style={{ color: "var(--app-ink-3)" }}
    >
      <a
        className="tap-44 inline-flex items-center gap-1 underline decoration-1 underline-offset-2"
        href={evidence.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {evidence.label}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
      {` · ${sourceStateLabel(evidence.state)} · Checked ${easternTime(evidence.checkedAt)}`}
    </p>
  );
}

function StatusIcon({ state }: Pick<FairArrivalStatus, "state">) {
  if (state === "attention" || state === "partial") {
    return (
      <TriangleAlert
        className="mt-0.5 h-5 w-5 shrink-0"
        style={{ color: "var(--app-warning-press)" }}
        aria-hidden
      />
    );
  }
  return (
    <Radio
      className="mt-0.5 h-5 w-5 shrink-0"
      style={{ color: "var(--app-cool)" }}
      aria-hidden
    />
  );
}

export function FairArrivalStatusView({
  status,
  onRefresh,
}: {
  status: FairArrivalStatus;
  onRefresh?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const compactSectionRef = useRef<HTMLElement | null>(null);
  const compact = compactCalmStatus(status);
  const checkedAt = latestSourceCheck(status);

  function toggleCompactDetails() {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded) return;

    const revealExpandedStatus = () => {
      compactSectionRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(revealExpandedStatus);
    } else {
      window.setTimeout(revealExpandedStatus, 0);
    }
  }

  if (compact) {
    const calmHeadline =
      status.state === "not-today"
        ? "Live checks start on your selected Fair day."
        : "No official update needs attention.";
    return (
      <section
        ref={compactSectionRef}
        data-fair-arrival-status="compact"
        className="mt-3 border-y"
        style={{ borderColor: "var(--app-border-strong)" }}
        aria-labelledby="fair-arrival-status-heading"
        aria-live="polite"
      >
        <div className="flex min-h-16 items-center gap-2 py-1">
          <Radio
            className="h-5 w-5 shrink-0 max-[360px]:hidden"
            style={{ color: "var(--app-cool)" }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] font-bold uppercase tracking-[0.09em]">
              <span style={{ color: "var(--app-cool)" }}>
                Official check
              </span>
              <span
                className="normal-case tracking-normal tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {checkedAt
                  ? `Checked ${easternTime(checkedAt)}`
                  : "Runs on Fair day"}
              </span>
            </div>
            <h2
              id="fair-arrival-status-heading"
              className="mt-0.5 text-[13px] font-semibold leading-snug"
              style={{ color: "var(--app-ink)" }}
            >
              {calmHeadline}
            </h2>
          </div>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="fair-arrival-calm-details"
            aria-label={
              expanded
                ? "Hide official arrival check details"
                : "Show official arrival check details"
            }
            onClick={toggleCompactDetails}
            className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </div>

        <div
          id="fair-arrival-calm-details"
          data-fair-arrival-details
          hidden={!expanded}
          className="border-t pb-3 pt-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            {status.summary}
          </p>
          {status.sources.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {status.sources.map((source) => (
                <li
                  key={source.id}
                  className="text-[12px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  <a
                    className="tap-44 inline-flex items-center gap-1 font-semibold underline decoration-1 underline-offset-2"
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.label}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                  {` · ${sourceStateLabel(source.state)} · Checked ${easternTime(source.checkedAt)}`}
                </li>
              ))}
            </ul>
          ) : null}
          <p
            className="mt-2 text-[12px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            {status.limitsLabel}
          </p>
          {onRefresh && status.state !== "not-today" ? (
            <Button
              className="mt-2"
              variant="quiet"
              onClick={onRefresh}
              iconLeft={<RefreshCw className="h-4 w-4" aria-hidden />}
            >
              Check again
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      data-fair-arrival-status="prominent"
      className="mt-5 border-y py-2 sm:py-4"
      style={{ borderColor: "var(--app-border-strong)" }}
      aria-labelledby="fair-arrival-status-heading"
      aria-live="polite"
    >
      <p
        className="text-[11px] font-bold uppercase tracking-[0.11em]"
        style={{ color: "var(--app-cool)" }}
      >
        Before you leave · Official checks
      </p>
      <div className="mt-1 flex items-start gap-3 sm:mt-2">
        <StatusIcon state={status.state} />
        <div className="min-w-0 flex-1">
          <h2
            id="fair-arrival-status-heading"
            className="text-[18px] font-bold leading-snug tracking-[-0.015em]"
            style={{ color: "var(--app-ink)" }}
          >
            {status.headline}
          </h2>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            {status.summary}
          </p>
        </div>
      </div>

      {status.signals.length > 0 ? (
        <ul
          className="mt-2 divide-y border-t sm:mt-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          {status.signals.map((signal) => (
            <li key={signal.id} className="py-1 sm:py-3">
              <p
                className="text-[14px] font-semibold leading-snug"
                style={{ color: "var(--app-ink)" }}
              >
                {signal.title}
              </p>
              <p
                className="mt-0.5 text-[13px] leading-relaxed sm:mt-1"
                style={{ color: "var(--app-ink-2)" }}
              >
                {signal.detail}
              </p>
              <EvidenceLine evidence={signal.evidence} />
            </li>
          ))}
        </ul>
      ) : null}

      {status.hiddenSignalCount > 0 ? (
        <p
          className="mt-2 text-[12px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          Additional official updates are available from the linked sources.
        </p>
      ) : null}

      {status.transit ? (
        <div
          className="mt-4 border-l-2 pl-4"
          style={{ borderColor: "var(--app-cool)" }}
        >
          <p
            className="text-[13px] font-bold"
            style={{ color: "var(--app-ink)" }}
          >
            Live arrivals near the Fair
          </p>
          {status.transit.arrivals.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {status.transit.arrivals.map((arrival) => (
                <li key={arrival.id}>
                  <p
                    className="text-[14px] font-semibold tabular-nums"
                    style={{ color: "var(--app-ink)" }}
                  >
                    Route {arrival.routeLabel} · {easternTime(arrival.expectedAt)}
                  </p>
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {arrival.stopLabel}
                  </p>
                  <EvidenceLine evidence={arrival.evidence} />
                </li>
              ))}
            </ul>
          ) : null}
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            {status.transit.message}
          </p>
        </div>
      ) : null}

      {status.sources.length > 0 ? (
        <details
          className="group mt-0 border-t pt-0 sm:mt-4 sm:pt-2"
          style={{ borderColor: "var(--app-border)" }}
        >
          <summary className="tap-44 flex min-h-11 cursor-pointer list-none items-center text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-cool)] [&::-webkit-details-marker]:hidden">
            Sources, freshness, and limits
          </summary>
          <ul className="space-y-2 pb-1">
            {status.sources.map((source) => (
              <li
                key={source.id}
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                <a
                  className="tap-44 inline-flex items-center gap-1 font-semibold underline decoration-1 underline-offset-2"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.label}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
                {` · ${sourceStateLabel(source.state)} · Checked ${easternTime(source.checkedAt)}`}
              </li>
            ))}
          </ul>
          <p
            className="mt-3 text-[12px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            {status.limitsLabel}
          </p>
          {onRefresh ? (
            <Button
              className="mt-2"
              variant="quiet"
              onClick={onRefresh}
              iconLeft={<RefreshCw className="h-4 w-4" aria-hidden />}
            >
              Check again
            </Button>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

function FairArrivalStatusLoading() {
  return (
    <section
      data-fair-arrival-status="loading"
      className="mt-3 min-h-16 border-y py-2"
      style={{ borderColor: "var(--app-border-strong)" }}
      role="status"
      aria-label="Checking official Fair arrival information"
    >
      <p
        className="text-[11px] font-bold uppercase tracking-[0.11em]"
        style={{ color: "var(--app-cool)" }}
      >
        Before you leave · Official checks
      </p>
      <p
        className="mt-1 flex items-center gap-3 text-[14px] font-semibold"
        style={{ color: "var(--app-ink-2)" }}
      >
        <Radio className="h-5 w-5" aria-hidden />
        Checking official arrival feeds…
      </p>
    </section>
  );
}

function FairArrivalStatusUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      data-fair-arrival-status="unavailable"
      className="mt-5 border-y py-4"
      style={{ borderColor: "var(--app-border-strong)" }}
      role="status"
    >
      <p
        className="text-[11px] font-bold uppercase tracking-[0.11em]"
        style={{ color: "var(--app-cool)" }}
      >
        Before you leave · Official checks
      </p>
      <div className="mt-2 flex items-start gap-3">
        <TriangleAlert
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: "var(--app-warning-press)" }}
          aria-hidden
        />
        <div>
          <p className="text-[15px] font-semibold">
            Live arrival information could not be checked.
          </p>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            This is unknown, not an all-clear. The reviewed parking, entry, and
            transit links below are still available.
          </p>
          <Button
            className="mt-2"
            variant="quiet"
            onClick={onRetry}
            iconLeft={<RefreshCw className="h-4 w-4" aria-hidden />}
          >
            Try again
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function FairArrivalStatus({
  selectedDate,
  transitSelected,
}: {
  selectedDate: string;
  transitSelected: boolean;
}) {
  const mode = transitSelected ? "transit" : "overview";
  const requestKey = `${selectedDate}:${mode}`;
  const [loaded, setLoaded] = useState<LoadedStatus | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setFailedKey(null);
    void (async () => {
      try {
        const query = new URLSearchParams({ date: selectedDate, mode });
        const response = await fetch(`/api/fair/arrival-status?${query}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok || !statusResponse(payload)) {
          throw new Error("Fair arrival status response was invalid.");
        }
        if (active) setLoaded({ key: requestKey, value: payload });
      } catch (error) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setFailedKey(requestKey);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, reload, requestKey, selectedDate]);

  const refresh = () => setReload((value) => value + 1);
  if (failedKey === requestKey) {
    return <FairArrivalStatusUnavailable onRetry={refresh} />;
  }
  if (loaded?.key === requestKey) {
    return <FairArrivalStatusView status={loaded.value} onRefresh={refresh} />;
  }
  return <FairArrivalStatusLoading />;
}

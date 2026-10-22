"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { getScope, parseScope, scopeToParam, scopeTownSlug, subscribeScopeChange } from "@/lib/scope";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import TodayHeadlineCard from "./TodayHeadlineCard";
import choiceStyles from "./TodayEventChoices.module.css";
import DismissibleSection from "@/components/today/DismissibleSection";
import EventGlanceCard from "@/components/event/EventGlanceCard";
import { parseRecoveryEventVisual, type EventCardVisual } from "@/components/event/eventVisuals";
import { createAbortDeadline } from "@/lib/promise-deadline";
import { eventDisplayTitle } from "@/lib/events/display-title";
import {
  todayEventPicksMeta,
  type TodayEvent,
  type TodayEventResponse,
} from "@/lib/today-events";

type RecoveryState =
  | { status: "loading" }
  | { status: "ready"; response: TodayEventResponse }
  | { status: "failed" };

// A client wait ceiling, independent of the archive reader's server budget.
// It covers response headers and JSON consumption, even if abort is ignored.
const RECOVERY_ATTEMPT_TIMEOUT_MS = 4_000;
const RECOVERY_RETRY_DELAY_MS = 750;

type RecoveryAttempt =
  | { status: "ready"; response: TodayEventResponse }
  | { status: "failed" }
  | { status: "stopped" };
const TODAY_EVENT_MOMENTS = new Set(["Now", "Later", "Tonight", "Today"]);
const EVENT_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

type TodayEventFacts = Omit<TodayEvent, "visual">;

function isTodayEvent(value: unknown): value is TodayEventFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<TodayEvent>;
  return (
    typeof event.slug === "string" &&
    EVENT_SLUG.test(event.slug) &&
    typeof event.title === "string" &&
    event.title.trim().length > 0 &&
    (event.presenter === undefined || typeof event.presenter === "string") &&
    typeof event.venue === "string" &&
    typeof event.municipality === "string" &&
    typeof event.time === "string" &&
    (event.endTime === undefined || typeof event.endTime === "string") &&
    (event.price === undefined || typeof event.price === "string") &&
    typeof event.moment === "string" &&
    TODAY_EVENT_MOMENTS.has(event.moment) &&
    (typeof event.image === "string" || event.image === null) &&
    typeof event.free === "boolean"
  );
}

function parseResponse(value: unknown): TodayEventResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { events?: unknown; partial?: unknown };
  if (
    !Array.isArray(candidate.events) ||
    candidate.events.length > 12 ||
    typeof candidate.partial !== "boolean"
  ) {
    return null;
  }
  const facts = candidate.events.filter(isTodayEvent);
  if (facts.length !== candidate.events.length) return null;
  const events = facts.map((event) => {
    const { visual: optionalVisual, ...fields } = event as TodayEventFacts & { visual?: unknown };
    const visual = parseRecoveryEventVisual(optionalVisual);
    return { ...fields, ...(visual ? { visual } : {}) };
  });
  return { events, partial: candidate.partial };
}

function rowTime(event: TodayEvent): string {
  if (event.moment === "Now") return "Now";
  if (event.moment === "Today") return "Today";
  return event.time;
}

/** The caller supplies an approved visual. This pure presentation seam also
 * supports declared offline layout fixtures without weakening API approval. */
export function TodayEventBriefCard({ event, visual, lead = false }: { event: TodayEvent; visual: EventCardVisual | null; lead?: boolean }) {
  const facts = <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
    <p className="text-xs font-semibold tabular-nums" style={{ color: "var(--app-brand-press)" }}>
      {rowTime(event)}{event.moment === "Now" && event.time !== "All day" ? ` · ${event.time}` : ""}{event.endTime ? `–${event.endTime}` : ""}
    </p>
    <h3 id={`today-choice-${event.slug}`} className={`${lead ? "text-xl" : "text-base"} mt-1 font-semibold leading-snug tracking-tight`} style={{ color: "var(--app-ink)" }}>
      {eventDisplayTitle(event)}
    </h3>
    <p id={`today-choice-facts-${event.slug}`} className="mt-1 text-sm leading-snug" style={{ color: "var(--app-ink-2)" }}>
      {event.venue}{event.free ? " · Free" : event.price ? ` · ${event.price}` : ""}
    </p>
  </div>;
  return lead || !visual ? <TodayHeadlineCard eventSlug={event.slug} titleId={`today-choice-${event.slug}`} detailId={`today-choice-facts-${event.slug}`} visual={visual} accent="var(--app-brand)" priority={false}>
    {facts}
  </TodayHeadlineCard> : <EventGlanceCard eventSlug={event.slug} visual={visual} cancelled={false} accent="var(--app-brand)" surface="today" compactCredit={false}>
    {facts}
  </EventGlanceCard>;
}

async function recoverAttempt(parentSignal: AbortSignal, requestPath: string): Promise<RecoveryAttempt> {
  const deadline = createAbortDeadline(RECOVERY_ATTEMPT_TIMEOUT_MS, parentSignal);
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<RecoveryAttempt>((resolve) => {
    onAbort = () => resolve({ status: "stopped" });
    if (deadline.signal.aborted) onAbort();
    else deadline.signal.addEventListener("abort", onAbort, { once: true });
  });
  // Keep a rejection handler attached after the race settles. An abandoned
  // fetch/body must not publish a late result or an unhandled rejection.
  const request = (async (): Promise<RecoveryAttempt> => {
    if (deadline.signal.aborted) return { status: "stopped" };
    const response = await fetch(requestPath, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: deadline.signal,
    });
    if (deadline.signal.aborted) return { status: "stopped" };
    if (!response.ok) return { status: "failed" };
    const parsed = parseResponse(await response.json());
    return parsed
      ? { status: "ready", response: parsed }
      : { status: "failed" };
  })().catch((): RecoveryAttempt => ({ status: "failed" }));

  try {
    // Aborting fetch alone is not a bound when a transport or body stalls.
    return await Promise.race([request, stopped]);
  } finally {
    if (onAbort) deadline.signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, RECOVERY_RETRY_DELAY_MS);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function TodayEventsRecoveryView({
  response,
  failed = false,
  scopeLabel = "Countywide",
  eventsHref = "/events",
}: {
  response: TodayEventResponse | null;
  failed?: boolean;
  scopeLabel?: string;
  eventsHref?: string;
}) {
  const events = response?.events ?? [];
  const healthyEmpty = response?.partial === false && events.length === 0;
  const meta = todayEventPicksMeta({
    todayPicks: events.length,
    tonightPicks: events.filter((event) => event.moment === "Tonight").length,
    degraded: response?.partial ?? false,
    scopeLabel,
  });

  if (events.length === 0) {
    const status = healthyEmpty
      ? "No picks in this brief"
      : failed
        ? "Event picks are unavailable here"
        : "Updating today's event picks";

    return (
      <section
        className="mt-1"
        aria-label="Events today"
        data-today-event-recovery="true"
        data-today-event-shortlist
      >
        <div
          className="flex min-h-14 items-center justify-between gap-3 border-y px-0.5 py-2"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.13em]" style={{ color: "var(--app-ink-3)" }}>
              Events today
            </p>
            <p role="status" className="mt-1 text-sm leading-snug" style={{ color: "var(--app-ink-2)" }}>
              {status}
            </p>
          </div>
          <Link
            href={eventsHref}
            prefetch={false}
            aria-label="Open the full events board"
            className="tap-44-y inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold"
            style={{ color: "var(--app-link)" }}
          >
            Full board
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className="space-y-3"
      aria-label="Events today"
      data-today-event-recovery="true"
      data-today-event-shortlist
    >
      <DismissibleSection
        id="upcoming"
        title="Events today"
        href={eventsHref}
        prefetch={false}
        cta="See all"
        flat
        meta={meta}
      >
        <ul className={choiceStyles.choices}>
          {events.map((event, index) => {
            const visual = parseRecoveryEventVisual(event.visual);
            return <li key={event.slug}>
              <TodayEventBriefCard event={event} visual={visual} lead={index === 0} />
            </li>;
          })}
        </ul>
      </DismissibleSection>
    </section>
  );
}

/**
 * Use the server brief when it matches the selected scope. Otherwise ask the
 * same-origin runtime endpoint for a bounded scoped read or archive recovery. A
 * passive recovery is not an explicit visitor refresh and must not consume
 * the separate, rate-limited cache-bypass allowance.
 */
function RecoverTodayEvents({ initialResponse, requestPath = "/api/today/events", scopeLabel = "Countywide", eventsHref = "/events" }: {
  initialResponse?: TodayEventResponse;
  requestPath?: string;
  scopeLabel?: string;
  eventsHref?: string;
}) {
  const [state, setState] = useState<RecoveryState>(initialResponse ? { status: "ready", response: initialResponse } : { status: "loading" });

  useEffect(() => {
    if (initialResponse) return;
    const controller = new AbortController();

    async function recover() {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (controller.signal.aborted) return;
          const result = await recoverAttempt(controller.signal, requestPath);
          if (controller.signal.aborted) return;
          if (result.status === "failed") {
            setState({ status: "failed" });
            return;
          }
          if (
            result.status === "ready" &&
            (result.response.events.length > 0 || !result.response.partial)
          ) {
            setState({ status: "ready", response: result.response });
            return;
          }
          if (attempt === 0) await waitForRetry(controller.signal);
        }
        if (!controller.signal.aborted) setState({ status: "failed" });
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!controller.signal.aborted) setState({ status: "failed" });
      }
    }

    void recover();
    return () => controller.abort();
  }, [initialResponse, requestPath]);

  return (
    <TodayEventsRecoveryView
      response={initialResponse ?? (state.status === "ready" ? state.response : null)}
      failed={!initialResponse && state.status === "failed"}
      scopeLabel={scopeLabel}
      eventsHref={eventsHref}
    />
  );
}

const subscribeScope = (onChange: () => void) => subscribeScopeChange(() => onChange());
function ScopedTodayEvents({ initialResponse }: { initialResponse?: TodayEventResponse }) {
  const stored = useSyncExternalStore(subscribeScope, getScope, () => null);
  const params = useSearchParams();
  const scope = parseScope(params.get("in")) ?? stored;
  const town = scopeTownSlug(scope);
  const suffix = town && scope ? `?in=${encodeURIComponent(scopeToParam(scope))}` : "";
  const scopeLabel = town ? MUNICIPALITY_BY_SLUG[town]?.name ?? town : "Countywide";
  return <RecoverTodayEvents key={suffix} requestPath={`/api/today/events?v=visual-choices-1${suffix ? `&${suffix.slice(1)}` : ""}`} initialResponse={town ? undefined : initialResponse} scopeLabel={scopeLabel} eventsHref={`/events${suffix}`} />;
}

export default function TodayEventsRecovery({ initialResponse, scoped = false }: { initialResponse?: TodayEventResponse; scoped?: boolean } = {}) {
  return scoped ? <Suspense fallback={<TodayEventsRecoveryView response={initialResponse ?? null} />}><ScopedTodayEvents initialResponse={initialResponse} /></Suspense> : <RecoverTodayEvents initialResponse={initialResponse} />;
}

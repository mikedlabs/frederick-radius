"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import DismissibleSection from "@/components/today/DismissibleSection";
import {
  todayEventPicksMeta,
  type TodayEvent,
  type TodayEventResponse,
} from "@/lib/today-events";

type RecoveryState =
  | { status: "loading" }
  | { status: "ready"; response: TodayEventResponse }
  | { status: "failed" };

const RECOVERY_RETRY_DELAY_MS = 750;
const TODAY_EVENT_MOMENTS = new Set(["Now", "Later", "Tonight", "Today"]);
const EVENT_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isTodayEvent(value: unknown): value is TodayEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<TodayEvent>;
  return (
    typeof event.slug === "string" &&
    EVENT_SLUG.test(event.slug) &&
    typeof event.title === "string" &&
    event.title.trim().length > 0 &&
    typeof event.venue === "string" &&
    typeof event.municipality === "string" &&
    typeof event.time === "string" &&
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
  const events = candidate.events.filter(isTodayEvent);
  return events.length === candidate.events.length
    ? { events, partial: candidate.partial }
    : null;
}

function rowTime(event: TodayEvent): string {
  if (event.moment === "Now") return "Now";
  if (event.moment === "Today") return "Today";
  return event.time;
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, RECOVERY_RETRY_DELAY_MS);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export function TodayEventsRecoveryView({
  response,
  failed = false,
}: {
  response: TodayEventResponse | null;
  failed?: boolean;
}) {
  const events = response?.events ?? [];
  const healthyEmpty = response?.partial === false && events.length === 0;
  const meta = todayEventPicksMeta({
    todayPicks: events.length,
    tonightPicks: events.filter((event) => event.moment === "Tonight").length,
    degraded: response?.partial ?? false,
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
      >
        <div
          className="flex min-h-14 items-center justify-between gap-3 border-y px-0.5 py-2"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.13em]" style={{ color: "var(--app-ink-3)" }}>
              Events today
            </p>
            <p role="status" className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              {status}
            </p>
          </div>
          <Link
            href="/events"
            aria-label="Open the full events board"
            className="tap-44-y inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
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
      className="mt-5 space-y-3"
      aria-label="Events today"
      data-today-event-recovery="true"
    >
      <DismissibleSection
        id="upcoming"
        title="Events today"
        href="/events"
        cta="See all"
        flat
        meta={meta}
      >
        <ul>
          {events.map((event) => (
            <li key={event.slug}>
              <Link
                href={`/events/${event.slug}`}
                prefetch={false}
                className="tap-44-y flex items-start gap-3 border-b py-2 pr-0.5"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span
                  className="flex w-[58px] shrink-0 items-center gap-1 pt-px font-mono text-[11px] font-semibold tabular-nums leading-snug"
                  style={{
                    color:
                      event.moment === "Now"
                        ? "var(--app-brand-press)"
                        : "var(--app-ink-3)",
                  }}
                >
                  {event.moment === "Now" ? (
                    <span
                      aria-hidden
                      className="live-dot h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--app-brand)" }}
                    />
                  ) : null}
                  {rowTime(event)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="line-clamp-2 block text-[14px] font-semibold leading-snug tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {event.title}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-[11.5px] leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {event.venue}
                    {event.free ? " · Free" : ""}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="mt-1 h-4 w-4 shrink-0"
                  strokeWidth={2.25}
                  style={{ color: "var(--app-ink-3)" }}
                />
              </Link>
            </li>
          ))}
        </ul>
      </DismissibleSection>
    </section>
  );
}

/**
 * Recover the one state server-rendered Today cannot answer after its bounded
 * archive read times out. This component mounts only when the server snapshot
 * was degraded and had no usable event rows, then asks the same-origin runtime
 * endpoint for a bounded retry instead of leaving the section absent. A
 * passive recovery is not an explicit visitor refresh and must not consume
 * the separate, rate-limited cache-bypass allowance.
 */
export default function TodayEventsRecovery() {
  const [state, setState] = useState<RecoveryState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function recover() {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (controller.signal.aborted) return;
          const response = await fetch("/api/today/events", {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Today events request failed");
          const parsed = parseResponse(await response.json());
          if (!parsed) throw new Error("Today events response was invalid");
          if (parsed.events.length > 0 || !parsed.partial) {
            setState({ status: "ready", response: parsed });
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
  }, []);

  return (
    <TodayEventsRecoveryView
      response={state.status === "ready" ? state.response : null}
      failed={state.status === "failed"}
    />
  );
}

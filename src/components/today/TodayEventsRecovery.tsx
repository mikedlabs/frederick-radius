"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import DismissibleSection from "@/components/today/DismissibleSection";
import type {
  TodayEvent,
  TodayEventResponse,
} from "@/lib/today-events";

type RecoveryState =
  | { status: "loading" }
  | { status: "ready"; response: TodayEventResponse }
  | { status: "failed" };

const RECOVERY_RETRY_DELAY_MS = 750;

function isTodayEvent(value: unknown): value is TodayEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TodayEvent>;
  return (
    typeof event.slug === "string" &&
    typeof event.title === "string" &&
    typeof event.venue === "string" &&
    typeof event.municipality === "string" &&
    typeof event.time === "string" &&
    ["Now", "Later", "Tonight", "Today"].includes(String(event.moment)) &&
    (typeof event.image === "string" || event.image === null) &&
    typeof event.free === "boolean"
  );
}

function parseResponse(value: unknown): TodayEventResponse | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    events?: unknown;
    partial?: unknown;
  };
  if (!Array.isArray(candidate.events) || typeof candidate.partial !== "boolean") {
    return null;
  }
  const events = candidate.events.filter(isTodayEvent);
  if (events.length !== candidate.events.length) return null;
  return { events, partial: candidate.partial };
}

function rowTime(event: TodayEvent): string {
  if (event.moment === "Now") return "Now";
  if (event.moment === "Today") return "Today";
  return event.time;
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
  return (
    <section
      className="mt-5 space-y-3"
      aria-label="Events today"
      data-today-event-recovery="true"
    >
      <DismissibleSection
        id="upcoming-recovery"
        title="Events today"
        href="/events"
        cta={events.length > 0 ? "See all" : "Full board"}
        flat
        meta={
          events.length > 0
            ? `${events.length} current listing${events.length === 1 ? "" : "s"}${response?.partial ? " · Partial coverage" : ""}`
            : healthyEmpty
              ? "No current listings"
            : failed
              ? "Current listings unavailable"
              : "Refreshing current listings"
        }
      >
        {events.length > 0 ? (
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
                    {event.moment === "Now" && (
                      <span
                        aria-hidden
                        className="live-dot h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--app-brand)" }}
                      />
                    )}
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
        ) : (
          <p
            role="status"
            className="px-0.5 py-2 text-[13.5px] leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            {healthyEmpty
              ? "No current event listings met Radius's Today checks. Use the full events board."
              : failed
              ? "Current event listings could not load here. Use the full events board."
              : "Radius is checking the current event board."}
          </p>
        )}
      </DismissibleSection>
    </section>
  );
}

/**
 * Client recovery for the one state an ISR page cannot answer at build time:
 * the database-backed event archive is deliberately unavailable during the
 * promoted build. Runtime pages normally replace this with the full server
 * program. If a cold archive read misses its deadline, this small endpoint
 * retry keeps a healthy event board from disappearing for the whole ISR
 * window.
 */
export default function TodayEventsRecovery() {
  const [state, setState] = useState<RecoveryState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function recover() {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
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
          if (attempt === 0) {
            await new Promise<void>((resolve) => {
              const timeout = window.setTimeout(resolve, RECOVERY_RETRY_DELAY_MS);
              controller.signal.addEventListener(
                "abort",
                () => {
                  window.clearTimeout(timeout);
                  resolve();
                },
                { once: true },
              );
            });
          }
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

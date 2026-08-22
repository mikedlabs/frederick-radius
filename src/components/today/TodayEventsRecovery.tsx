"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
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
    typeof event.free === "boolean" &&
    typeof event.when === "string" &&
    typeof event.description === "string" &&
    typeof event.address === "string" &&
    typeof event.admission === "string" &&
    typeof event.sourceLabel === "string" &&
    (event.sourceUrl === null ||
      (typeof event.sourceUrl === "string" &&
        event.sourceUrl.startsWith("https://"))) &&
    typeof event.highlight === "boolean"
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

function highlightLabel(event: TodayEvent): string {
  if (event.moment === "Now") return "On Carroll Creek now";
  if (event.moment === "Tonight") return "On Carroll Creek tonight";
  return "On Carroll Creek today";
}

function TodayEventRecoveryFeature({ event }: { event: TodayEvent }) {
  return (
    <article
      className="border-y py-3"
      style={{ borderColor: "var(--app-border)" }}
      data-today-event-highlight="carroll-creek"
    >
      <p
        className="mb-1.5 flex items-center gap-1.5 px-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--app-brand-press)" }}
      >
        {event.moment === "Now" ? (
          <span
            aria-hidden
            className="live-dot h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--app-brand)" }}
          />
        ) : null}
        {highlightLabel(event)}
      </p>
      <h3 className="px-0.5 font-editorial text-[clamp(1.75rem,8vw,2.5rem)] leading-[0.98] tracking-[-0.025em] [text-wrap:balance]">
        <Link
          href={`/events/${event.slug}`}
          prefetch={false}
          className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--app-bg)]"
          style={{ color: "var(--app-ink)" }}
        >
          {event.title}
        </Link>
      </h3>
      <div
        className="mt-2 space-y-1 px-0.5 text-[13px] leading-snug"
        style={{ color: "var(--app-ink-2)" }}
      >
        <p className="font-mono font-semibold tabular-nums">{event.when}</p>
        <p style={{ color: "var(--app-ink-3)" }}>
          {event.venue}
          {event.address ? ` · ${event.address}` : ""}
        </p>
        <p>
          <span className="font-semibold" style={{ color: "var(--app-ink-3)" }}>
            Admission
          </span>
          <span
            style={{
              color: event.free ? "var(--app-cool)" : "var(--app-ink-2)",
            }}
          >
            {` · ${event.admission}`}
          </span>
        </p>
      </div>
      {event.description ? (
        <p
          className="mt-3 max-w-[68ch] px-0.5 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          {event.description}
        </p>
      ) : null}
      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[12px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <Link
          href={`/events/${event.slug}`}
          prefetch={false}
          className="tap-44-y inline-flex items-center gap-1 font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Full event details
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
        </Link>
        <span>Source · {event.sourceLabel}</span>
        {event.sourceUrl ? (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44-y inline-flex items-center gap-1 font-semibold underline decoration-current/40 underline-offset-2"
            style={{ color: "var(--app-brand-press)" }}
          >
            Official event page
            <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function TodayEventsRecoveryView({
  response,
  failed = false,
}: {
  response: TodayEventResponse | null;
  failed?: boolean;
}) {
  const events = response?.events ?? [];
  const feature = events.find((event) => event.highlight) ?? null;
  const rows = feature
    ? events.filter((event) => event.slug !== feature.slug)
    : events;
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
          <>
            {feature ? <TodayEventRecoveryFeature event={feature} /> : null}
            {rows.length > 0 ? (
              <ul>
                {rows.map((event) => (
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
            ) : null}
          </>
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

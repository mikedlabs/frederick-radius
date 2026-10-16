"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  ExternalLink,
  LoaderCircle,
  WifiOff,
} from "lucide-react";
import TRANSIT from "@/data/transit.json";
import { agoLabel } from "@/lib/format/relativeTime";
import styles from "./TransitServiceAlerts.module.css";

const POLL_INTERVAL_MS = 60_000;
const COUNTY_UPDATES_URL =
  "https://frederickcountymd.gov/225/Rider-Bulletins-News-Updates-Publication";

type TransitRoute = {
  id: string;
  short: string;
  name: string;
};

type ServiceAlert = {
  id: string;
  header: string;
  description?: string;
  routeIds: string[];
  stopIds: string[];
  activePeriods: Array<{ start?: number; end?: number }>;
  cause?: string;
  effect?: string;
};

type Freshness = {
  at: number | null;
  source: "provider" | "radius";
};

type AlertState =
  | { kind: "loading" }
  | { kind: "unavailable"; checkedAt: number }
  | { kind: "available-empty"; freshness: Freshness }
  | { kind: "alerts"; alerts: ServiceAlert[]; freshness: Freshness };

const ROUTES = (TRANSIT.routes as TransitRoute[]).map((route) => ({
  ...route,
  normalizedId: route.id.toLocaleLowerCase(),
  normalizedShort: route.short.toLocaleLowerCase(),
  normalizedName: route.name.toLocaleLowerCase(),
}));

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(text).filter((item): item is string => Boolean(item))),
  );
}

function activePeriods(
  value: unknown,
): Array<{ start?: number; end?: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((period) => {
    if (!isRecord(period)) return [];
    const start = number(period.start);
    const end = number(period.end);
    return start == null && end == null ? [] : [{ start, end }];
  });
}

function serviceAlert(value: unknown, index: number): ServiceAlert | null {
  if (!isRecord(value)) return null;
  const header = text(value.header);
  if (!header) return null;
  return {
    id: text(value.id) ?? `transit-alert-${index + 1}`,
    header,
    description: text(value.description),
    routeIds: stringList(value.routeIds),
    stopIds: stringList(value.stopIds),
    activePeriods: activePeriods(value.activePeriods),
    cause: text(value.cause),
    effect: text(value.effect),
  };
}

function routeLabel(route: TransitRoute): string {
  const nameIncludesNumber = route.name
    .toLocaleLowerCase()
    .includes(route.short.toLocaleLowerCase());
  return nameIncludesNumber
    ? route.name
    : `${route.name} (${route.short})`;
}

function affectedRoutes(routeIds: string[]): string[] {
  if (routeIds.length === 0) return ["Provider did not name a route"];

  return Array.from(
    new Set(
      routeIds.map((routeId) => {
        const normalized = routeId.toLocaleLowerCase();
        const route = ROUTES.find(
          (candidate) =>
            candidate.normalizedId === normalized ||
            candidate.normalizedShort === normalized ||
            candidate.normalizedName === normalized,
        );
        return route ? routeLabel(route) : `Route ${routeId}`;
      }),
    ),
  );
}

function freshnessFrom(payload: Record<string, unknown>): Freshness {
  const providerSeconds = number(payload.feedTimestamp);
  if (providerSeconds != null && providerSeconds > 0) {
    return { at: providerSeconds * 1000, source: "provider" };
  }
  const updatedAt = number(payload.updatedAt);
  return {
    at: updatedAt != null && updatedAt > 0 ? updatedAt : null,
    source: "radius",
  };
}

function freshnessText(freshness: Freshness, nowMs: number): string {
  const prefix =
    freshness.source === "provider" ? "Provider update" : "Checked";
  if (freshness.at == null || nowMs === 0) return `${prefix} recently`;
  return `${prefix} ${agoLabel(nowMs - freshness.at)}`;
}

function activePeriodText(
  periods: ServiceAlert["activePeriods"],
): string | null {
  const period = periods[0];
  if (!period) return null;
  const start =
    period.start != null ? DATE_TIME.format(new Date(period.start * 1000)) : null;
  const end =
    period.end != null ? DATE_TIME.format(new Date(period.end * 1000)) : null;
  if (start && end) return `${start}–${end}`;
  if (start) return `Starts ${start}`;
  return end ? `Through ${end}` : null;
}

function OfficialUpdatesLink() {
  return (
    <a
      href={COUNTY_UPDATES_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Official county updates"
      className={styles.updates}
    >
      Updates
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </a>
  );
}

function AlertDetails({ alert }: { alert: ServiceAlert }) {
  const routes = affectedRoutes(alert.routeIds);
  const timing = activePeriodText(alert.activePeriods);

  return (
    <details
      className={`group ${styles.alert}`}
    >
      <summary className={styles.alertSummary}>
        <AlertTriangle
          className="h-4 w-4 shrink-0"
          strokeWidth={2.2}
          style={{ color: "var(--state-closing)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span
            className={styles.alertTitle}
          >
            {alert.header}
          </span>
          <span
            className={styles.alertMeta}
          >
            Effect: {alert.effect ?? "Not specified"} · Cause:{" "}
            {alert.cause ?? "Not specified"}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition group-open:rotate-180"
          strokeWidth={2.2}
          style={{ color: "var(--app-ink-3)" }}
          aria-hidden
        />
      </summary>

      <div
        className="space-y-3 border-t px-3 pb-3 pt-2.5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          <div>
            <dt style={{ color: "var(--app-ink-3)" }}>Effect</dt>
            <dd className="font-semibold" style={{ color: "var(--app-ink)" }}>
              {alert.effect ?? "Not specified"}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--app-ink-3)" }}>Cause</dt>
            <dd className="font-semibold" style={{ color: "var(--app-ink)" }}>
              {alert.cause ?? "Not specified"}
            </dd>
          </div>
          {timing ? (
            <div className="col-span-2">
              <dt style={{ color: "var(--app-ink-3)" }}>Timing</dt>
              <dd className="font-semibold" style={{ color: "var(--app-ink)" }}>
                {timing}
              </dd>
            </div>
          ) : null}
        </dl>

        <div>
          <p
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            Affected service
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {routes.map((route) => (
              <li
                key={route}
                className="rounded-full border px-2 py-1 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--app-border-strong)",
                  color: "var(--app-ink-2)",
                }}
              >
                {route}
              </li>
            ))}
            {alert.stopIds.length > 0 ? (
              <li
                className="rounded-full border px-2 py-1 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--app-border-strong)",
                  color: "var(--app-ink-2)",
                }}
              >
                {alert.stopIds.length} specific{" "}
                {alert.stopIds.length === 1 ? "stop" : "stops"}
              </li>
            ) : null}
          </ul>
        </div>

        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          {alert.description ?? "No additional description was provided."}
        </p>
      </div>
    </details>
  );
}

export default function TransitServiceAlerts() {
  const [state, setState] = useState<AlertState>({ kind: "loading" });
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let controller: AbortController | null = null;

    const loadAlerts = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/transit/alerts", {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Transit alerts request failed");

        const payload: unknown = await response.json();
        const checkedAt = Date.now();
        if (!active) return;
        setNowMs(checkedAt);

        if (
          !isRecord(payload) ||
          payload.available === false ||
          payload.status === "unavailable" ||
          !Array.isArray(payload.alerts)
        ) {
          setState({ kind: "unavailable", checkedAt });
          return;
        }

        const alerts = payload.alerts.flatMap((item, index) => {
          const alert = serviceAlert(item, index);
          return alert ? [alert] : [];
        });
        if (payload.alerts.length > 0 && alerts.length === 0) {
          setState({ kind: "unavailable", checkedAt });
          return;
        }

        const freshness = freshnessFrom(payload);
        setState(
          alerts.length > 0
            ? { kind: "alerts", alerts, freshness }
            : { kind: "available-empty", freshness },
        );
      } catch (error) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          const checkedAt = Date.now();
          setNowMs(checkedAt);
          setState({ kind: "unavailable", checkedAt });
        }
      } finally {
        inFlight = false;
      }
    };

    void loadAlerts();
    const timer = window.setInterval(() => void loadAlerts(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const freshness =
    state.kind === "available-empty" || state.kind === "alerts"
      ? freshnessText(state.freshness, nowMs)
      : null;

  return (
    <section
      aria-labelledby="transit-service-alerts-heading"
      aria-live="polite"
      aria-busy={state.kind === "loading"}
      data-state={state.kind}
      className={styles.bulletins}
    >
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden>
          {state.kind === "loading" ? (
            <LoaderCircle
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              strokeWidth={2.2}
            />
          ) : state.kind === "unavailable" ? (
            <WifiOff className="h-4 w-4" strokeWidth={2.2} />
          ) : state.kind === "alerts" ? (
            <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
          ) : (
            <Clock3 className="h-4 w-4" strokeWidth={2.2} />
          )}
        </span>

        <div className={styles.copy}>
          <h2 id="transit-service-alerts-heading">TransIT service bulletins</h2>
          <p>
            {state.kind === "loading"
              ? "Checking provider bulletins…"
              : state.kind === "unavailable"
                ? `Provider bulletin feed unavailable · Checked ${agoLabel(
                    nowMs - state.checkedAt,
                  )}`
                : state.kind === "available-empty"
                  ? "No provider bulletin posted"
                  : `${state.alerts.length} ${
                      state.alerts.length === 1 ? "bulletin" : "bulletins"
                    } · ${freshness}`}
          </p>
        </div>
        <OfficialUpdatesLink />
      </div>

      {state.kind === "alerts" ? (
        <div className={styles.alertList}>
          {state.alerts.map((alert) => (
            <AlertDetails key={alert.id} alert={alert} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Clock3, MapPinned, Radio, Route } from "lucide-react";
import type {
  LiveIncidentSignal,
  LiveIncidentSnapshot,
} from "@/lib/live/incidentSnapshot";

const POLL_MS = 60_000;
const CLOCK_TICK_MS = 30_000;

function relativeTime(iso: string, nowMs: number): string {
  const reportedAt = Date.parse(iso);
  if (!Number.isFinite(reportedAt) || nowMs <= 0) return "Time unavailable";
  const minutes = Math.max(0, Math.floor((nowMs - reportedAt) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

function updatedClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Latest response";
  return `Updated at ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function directionWord(value?: string): string {
  const normalized = value?.toLocaleLowerCase().replace(/[()]/g, "").trim();
  const labels: Record<string, string> = {
    nb: "northbound",
    north: "northbound",
    northbound: "northbound",
    sb: "southbound",
    south: "southbound",
    southbound: "southbound",
    eb: "eastbound",
    east: "eastbound",
    eastbound: "eastbound",
    wb: "westbound",
    west: "westbound",
    westbound: "westbound",
  };
  return normalized ? labels[normalized] ?? normalized : "";
}

function roadContext(incident: LiveIncidentSignal): string | null {
  const official = incident.officialRoadImpact;
  if (!official) return null;
  const road = [official.road, directionWord(official.direction)]
    .filter(Boolean)
    .join(" ");
  const lane = official.lanesAffected?.trim();
  if (road && lane) return `MDOT also reports an impact on ${road}: ${lane}.`;
  if (road) return `MDOT also reports a road impact on ${road}.`;
  if (lane) return `MDOT also reports this road impact: ${lane}.`;
  return "MDOT also reports a road incident nearby.";
}

function mapHref(incident: LiveIncidentSignal): string {
  const { lat, lng } = incident.coordinate;
  return `/map?at=${lat.toFixed(6)},${lng.toFixed(6)}&show=incidents,cameras`;
}

function IncidentRow({
  incident,
  nowMs,
}: {
  incident: LiveIncidentSignal;
  nowMs: number;
}) {
  const corroborated = incident.status === "corroborated";
  const context = roadContext(incident);

  return (
    <li
      className="overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{
        borderColor: corroborated
          ? "color-mix(in srgb, var(--app-cool) 34%, var(--app-border))"
          : "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <div className="p-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{
              color: corroborated ? "var(--app-cool)" : "var(--app-brand-press)",
              background: corroborated
                ? "color-mix(in srgb, var(--app-cool) 11%, transparent)"
                : "color-mix(in srgb, var(--app-brand) 10%, transparent)",
            }}
          >
            {corroborated ? (
              <Route className="h-4 w-4" strokeWidth={2.1} />
            ) : (
              <Radio className="h-4 w-4" strokeWidth={2.1} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3
                className="text-[14px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {incident.kind}
              </h3>
              <span
                className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]"
                style={{
                  color: corroborated ? "var(--app-cool)" : "var(--app-ink-2)",
                  background: corroborated
                    ? "color-mix(in srgb, var(--app-cool) 10%, transparent)"
                    : "var(--app-bg-sunken)",
                }}
              >
                {corroborated ? "MDOT nearby" : "Preliminary"}
              </span>
            </div>
            <p
              className="mt-1 text-[13px] font-medium leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              {incident.location}
            </p>
            <p
              className="mt-1.5 flex items-center gap-1.5 text-[10.5px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <Clock3 aria-hidden className="h-3 w-3 shrink-0" />
              <time dateTime={incident.lastReportedAt}>
                {relativeTime(incident.lastReportedAt, nowMs)}
              </time>
              {incident.updates > 1 ? (
                <span>· {incident.updates} public updates</span>
              ) : null}
            </p>
          </div>
        </div>

        {context ? (
          <p
            className="mt-3 border-t pt-2.5 text-[12px] leading-relaxed"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-ink-2)",
            }}
          >
            {context}
          </p>
        ) : null}
      </div>

      <Link
        href={mapHref(incident)}
        className="flex min-h-11 items-center justify-between gap-3 border-t px-3.5 text-[12px] font-semibold transition active:opacity-70"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-ink)",
          background: "var(--app-bg-sunken)",
        }}
      >
        <span className="inline-flex items-center gap-2">
          <MapPinned aria-hidden className="h-4 w-4" />
          View on the map
        </span>
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}

export default function ScannerTimeline({
  initial,
}: {
  initial: LiveIncidentSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.updatedAt) || 0);
  const shown = snapshot.items.slice(0, 2);
  const corroboratedCount = snapshot.corroboratedCount;

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/pulse/incidents", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = (await response.json()) as LiveIncidentSnapshot;
        if (!mounted || !Array.isArray(next.items)) return;
        setSnapshot(next);
        setNowMs(Date.now());
      } catch {
        // Keep the last usable response. A brief source failure should not
        // erase information that was already visible in the open drawer.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const tick = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="space-y-1 px-0.5">
        <p
          className="text-[12.5px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          {snapshot.totalCount > 0
            ? `${snapshot.totalCount} public road ${
                snapshot.totalCount === 1 ? "report includes" : "reports include"
              } a safe map location.${
                snapshot.totalCount > shown.length
                  ? " The two newest are shown here."
                  : ""
              }`
            : "No public road report with a safe map location is available in the latest response. This is not an all-clear."}
        </p>
        <p
          aria-live="polite"
          className="font-mono text-[9.5px] uppercase tracking-[0.08em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {updatedClock(snapshot.updatedAt)}.{" "}
          {corroboratedCount === 1
            ? "One report also appears in MDOT traffic data."
            : corroboratedCount > 1
              ? `${corroboratedCount} reports also appear in MDOT traffic data.`
              : "No report currently has a nearby MDOT match."}
        </p>
      </div>

      {!snapshot.chartAvailable ? (
        <p
          className="rounded-[var(--app-radius-sm)] border px-3 py-2 text-[11.5px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--app-warning) 35%, var(--app-border))",
            color: "var(--app-ink-2)",
            background:
              "color-mix(in srgb, var(--app-warning) 7%, var(--app-bg-elevated))",
          }}
        >
          MDOT traffic context could not be refreshed. Scanner reports may still
          appear below, but they remain preliminary.
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="space-y-2">
          {shown.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              nowMs={nowMs}
            />
          ))}
        </ul>
      ) : (
        <div
          className="rounded-[var(--app-radius-md)] border p-5 text-center"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-sunken)",
          }}
        >
          <Radio
            aria-hidden
            className="mx-auto h-5 w-5"
            strokeWidth={1.8}
            style={{ color: "var(--app-ink-3)" }}
          />
          <p
            className="mt-2 text-[12px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            The public feed excludes medical and personal calls. An empty
            response does not prove that every road is clear.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/map?show=incidents,cameras"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 text-center text-[12px] font-semibold transition active:scale-[0.98]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink)",
            background: "var(--app-bg-elevated)",
          }}
        >
          <MapPinned aria-hidden className="h-4 w-4" />
          Open live map
        </Link>
        <Link
          href="/scanner"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 text-center text-[12px] font-semibold transition active:scale-[0.98]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink)",
            background: "var(--app-bg-elevated)",
          }}
        >
          <Radio aria-hidden className="h-4 w-4" />
          Full public board
        </Link>
      </div>

      <p
        className="px-1 text-[10.5px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        Frederick Scanner provides the public report, and MDOT CHART adds
        nearby road context when available. Medical and personal calls stay
        hidden; locations remain block-level.
      </p>
    </div>
  );
}

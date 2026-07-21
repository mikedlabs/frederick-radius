"use client";

import { useEffect, useState } from "react";
import type { ChartIncident } from "@/lib/integrations/mdot-chart";

/**
 * HighwayConditions — the state's live highway picture on /scanner, from MDOT
 * CHART. Complements the FredScanner block-level dispatch board: this is the
 * interstates and main routes (road, direction, what's affected). Server-seeded,
 * then polls so it stays current like the dispatch board. Honest empty state
 * when the highways are clear.
 */

const POLL_MS = 60_000;

const TYPE_TONE: Record<ChartIncident["type"], string> = {
  Incident: "var(--app-brand)",
  Construction: "#B4712A",
  Disabled: "var(--app-cool)",
  Weather: "var(--app-cool)",
  Special: "var(--app-cool)",
  Other: "var(--app-ink-3)",
};
const TYPE_LABEL: Record<ChartIncident["type"], string> = {
  Incident: "Crash / incident",
  Construction: "Roadwork",
  Disabled: "Disabled vehicle",
  Weather: "Weather",
  Special: "Event",
  Other: "Traffic",
};
const SEVERITY_RANK: Record<ChartIncident["severity"], number> = { High: 0, Medium: 1, Low: 2 };

function sortIncidents(list: ChartIncident[]): ChartIncident[] {
  return [...list].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      Date.parse(b.started_at) - Date.parse(a.started_at),
  );
}

function IncidentRow({ inc }: { inc: ChartIncident }) {
  const tone = TYPE_TONE[inc.type] ?? "var(--app-brand)";
  return (
    <div
      className="flex items-start gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone }} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          <span className="truncate">
            {inc.road}
            {inc.direction ? ` ${inc.direction}` : ""}
          </span>
          {inc.severity === "High" && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase leading-none tracking-wide text-white"
              style={{ background: tone }}
            >
              Major
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {inc.description}
        </p>
        {inc.lanes_affected && (
          <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            {inc.lanes_affected}
          </p>
        )}
      </div>
      {/* Ink (not the accent tone) so small text stays AA-contrast; the tone
          lives only on the decorative dot and the high-contrast Major pill. */}
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
        {TYPE_LABEL[inc.type] ?? "Traffic"}
      </span>
    </div>
  );
}

export default function HighwayConditions() {
  const [incidents, setIncidents] = useState<ChartIncident[]>([]);
  // Loaded is false until the first fetch settles, so we don't flash the
  // "all clear" empty state before we actually know.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/scanner/highways", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { incidents?: ChartIncident[] };
        if (alive && Array.isArray(d.incidents)) {
          setIncidents(sortIncidents(d.incidents));
          setLoaded(true);
        }
      } catch {
        /* keep last known */
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  // Until the first fetch settles, render nothing — no bare header, no flash of
  // "all clear" before we know.
  if (!loaded) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[20px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          On the highways
        </h2>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
          MDOT CHART
        </span>
      </div>

      {incidents.length > 0 ? (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <IncidentRow key={inc.id} inc={inc} />
          ))}
        </div>
      ) : (
        <p
          className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px]"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
        >
          The interstates and main routes are clear right now.
        </p>
      )}
    </section>
  );
}

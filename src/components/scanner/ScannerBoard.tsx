"use client";

import { useEffect, useMemo, useState } from "react";
import { Radio } from "lucide-react";
import type { ScannerIncident } from "@/lib/integrations/scannerIncidents";

/**
 * ScannerBoard — the interactive half of /scanner. Server-rendered incidents
 * seed it; then it polls /api/scanner/feed live, so the board updates like a
 * real scanner without a reload. Kind chips filter the list (with live counts),
 * and a pulse dot shows it's current. Still only ever public, non-medical calls
 * — the allowlist ran server-side.
 */

const POLL_MS = 45_000;
/** A multi-post call updated within this window is still being worked. */
const ACTIVE_MS = 12 * 60 * 1000;

const KIND_TONE: Record<string, string> = {
  Crash: "var(--app-brand)",
  "Wires down": "#B4712A",
  "Gas leak": "#B4712A",
  "Structure fire": "var(--app-brand-press)",
  "Outside fire": "#B4712A",
  "Water rescue": "var(--app-cool)",
};
const toneOf = (kind: string) => KIND_TONE[kind] ?? "var(--app-brand)";

function agoLabel(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/** A call is "active" when it has posted more than once and its latest post is
 *  recent — the honest, unit-free sign that units are still on it. */
function isActive(inc: ScannerIncident, now: number): boolean {
  return inc.updates > 1 && now > 0 && now - Date.parse(inc.at) < ACTIVE_MS;
}

function IncidentRow({ inc, now }: { inc: ScannerIncident; now: number }) {
  const active = isActive(inc, now);
  const tone = toneOf(inc.kind);
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
      style={{
        borderColor: active ? tone : "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "motion-safe:animate-pulse" : ""}`}
        style={{ background: tone }}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          <span className="truncate">{inc.kind}</span>
          {active && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase leading-none tracking-wide text-white"
              style={{ background: tone }}
            >
              Active
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {inc.location}
        </p>
        {inc.updates > 1 && now > 0 && (
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            Updated {agoLabel(inc.at, now)} · {inc.updates} updates
          </p>
        )}
      </div>
      <span className="shrink-0 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
        {inc.time}
      </span>
    </div>
  );
}

export default function ScannerBoard({ initial }: { initial: ScannerIncident[] }) {
  const [incidents, setIncidents] = useState<ScannerIncident[]>(initial);
  const [live, setLive] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  // Wall-clock now (ms) for "updated X ago" / active detection, stamped on poll
  // and a slow tick so no Date.now() runs during render (react-hooks purity).
  const [nowMs, setNowMs] = useState(0);

  // Poll the live feed. Keeps the last good set on a hiccup.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/scanner/feed", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { incidents?: ScannerIncident[] };
        if (alive && Array.isArray(d.incidents)) {
          setIncidents(d.incidents);
          setLive(true);
          setNowMs(Date.now());
        }
      } catch {
        /* keep last known */
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  // Counts per kind, for the filter chips.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of incidents) m.set(i.kind, (m.get(i.kind) ?? 0) + 1);
    return m;
  }, [incidents]);

  const kinds = useMemo(() => [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)), [counts]);
  const shown = kind ? incidents.filter((i) => i.kind === kind) : incidents;
  const activeCount = useMemo(() => incidents.filter((i) => isActive(i, nowMs)).length, [incidents, nowMs]);

  return (
    <div className="space-y-3">
      {/* Status line — count + a live pulse. */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <p className="text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
          <span className="font-mono font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
            {incidents.length}
          </span>{" "}
          {incidents.length === 1 ? "public call" : "public calls"} in the last hour
          {activeCount > 0 && (
            <>
              {" · "}
              <span className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
                {activeCount} active
              </span>
            </>
          )}
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${live ? "motion-safe:animate-pulse" : ""}`}
            style={{ background: live ? "var(--app-brand)" : "var(--app-ink-3)" }}
          />
          {live ? "Live" : "Idle"}
        </span>
      </div>

      {/* Kind filter chips (only when there's a mix to filter). */}
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setKind(null)}
            aria-pressed={kind === null}
            className={`min-h-9 rounded-full px-3 text-[12px] font-semibold transition ${kind === null ? "text-white" : "border"}`}
            style={kind === null ? { background: "var(--app-ink)" } : { borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            All {incidents.length}
          </button>
          {kinds.map((k) => {
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(on ? null : k)}
                aria-pressed={on}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition"
                style={on ? { background: toneOf(k), color: "#fff" } : { border: "1px solid var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
              >
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : toneOf(k) }} />
                {k}
                <span className="font-mono tabular-nums" style={{ color: on ? "rgba(255,255,255,0.85)" : "var(--app-ink-3)" }}>
                  {counts.get(k)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="space-y-2">
          {shown.map((inc) => (
            <IncidentRow key={`${inc.kind}:${inc.location}:${inc.at}`} inc={inc} now={nowMs} />
          ))}
        </div>
      ) : (
        <div
          className="rounded-[var(--app-radius-lg)] border p-6 text-center"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
        >
          <Radio className="mx-auto h-6 w-6" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {kind ? `No ${kind.toLowerCase()} calls right now` : "Nothing on the public wire right now"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            {kind
              ? "Try another kind, or clear the filter."
              : "Crashes, wires down, fires, and other public calls appear here as they are dispatched."}
          </p>
        </div>
      )}
    </div>
  );
}

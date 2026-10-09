"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveLayerGate, type LiveLayerGate } from "./liveLayerGate";
import { Marker, Popup } from "react-map-gl/mapbox";
import { exposeMarkerChild } from "./markerA11y";
import { AlertTriangle } from "lucide-react";
import type {
  LiveIncidentSignal,
  LiveIncidentSnapshot,
} from "@/lib/live/incidentSnapshot";
import { countRecentPublicReports, SCANNER_SOURCE_CHECK_MAX_AGE_MS } from "@/lib/live/incidentFreshness";
import {
  liveLayerHealth,
  type LiveLayerHealth,
} from "@/lib/live-layer-health";

/**
 * LiveIncidents — the map's live public-safety layer, fed by the FredScanner
 * #incidents CAD stream through the shared /api/pulse/incidents snapshot.
 * Only public, non-medical, in-county-geocoded incidents ever arrive (the
 * allowlist + geocoder run server-side), so this component just polls, pins,
 * and ages them out visually. Self-contained: it owns its markers AND its
 * popup, so AppMap mounts it with one line. Empty (renders nothing) until the
 * feed is live. Polls only while its layer toggle is on.
 */

const POLL_MS = 60_000;
const PROBE_POLL_MS = 120_000;

const KIND_COLOR: Record<string, string> = {
  Crash: "var(--app-brand)",
  "Pedestrian struck": "var(--app-brand)",
  "Vehicle fire": "var(--app-brand-press)",
  "Wires down": "#B4712A",
  "Gas leak": "#B4712A",
  Hazmat: "#B4712A",
  "Structure fire": "var(--app-brand-press)",
  "Outside fire": "#B4712A",
  "Water rescue": "var(--app-cool)",
  Rescue: "var(--app-cool)",
  Medevac: "var(--app-brand-press)",
  Flooding: "var(--app-cool)",
};

function agoLabel(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function LiveIncidents({
  show,
  probe,
  onHealth,
  onSnapshot,
  focusIncidentId,
  onFocusIncidentChange,
  gate,
}: {
  show: boolean;
  /** Main /map probes quietly while the layer is off so its edge control can
   * report source health and a safe current count. A slower background probe
   * keeps the attention control current; marker rendering still waits for the
   * person to turn the layer on. */
  probe?: boolean;
  onHealth?: (health: LiveLayerHealth) => void;
  onSnapshot?: (items: LiveIncidentSignal[]) => void;
  /** Puts this internally-owned popup under AppMap's one-foreground gate. */
  gate?: LiveLayerGate;
  /** Edge-tool selection. Derived during render so focusing an already-probed
   * report opens its popup without a state-setting synchronization effect. */
  focusIncidentId?: string | null;
  onFocusIncidentChange?: (id: string | null) => void;
}) {
  const [incidents, setIncidents] = useState<LiveIncidentSignal[]>([]);
  const [sourceVerified, setSourceVerified] = useState(false);
  const [selected, setSelected] = useState<LiveIncidentSignal | null>(null);
  useLiveLayerGate(gate, () => setSelected(null));
  const incidentsRef = useRef<LiveIncidentSignal[]>([]);
  const snapshotRef = useRef<Partial<LiveIncidentSnapshot> | null>(null);
  const failedRef = useRef(false);
  // Wall-clock now (ms) for the "X min ago" label, stamped on poll/tick so no
  // Date.now() runs during render (react-hooks purity).
  const [nowMs, setNowMs] = useState(0);
  const onHealthRef = useRef(onHealth);
  useEffect(() => { onHealthRef.current = onHealth; }, [onHealth]);
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);

  useEffect(() => {
    // The main map may make a slower off-state probe for its edge status.
    // Marker rendering still waits for an explicit layer toggle.
    // We deliberately DON'T clear state here — the next fetch refreshes it.
    if (!show && !probe) return;
    let alive = true;
    const reportHealth = () => {
      if (!alive) return;
      const cached = incidentsRef.current;
      const snapshot = snapshotRef.current;
      const timestamp = snapshot?.scannerCheckedAt ?? snapshot?.updatedAt;
      const sourceAge = Date.now() - Date.parse(snapshot?.scannerCheckedAt ?? "");
      const verified = !failedRef.current && snapshot?.scannerAvailable === true && Number.isFinite(sourceAge) && sourceAge >= -5 * 60_000 && sourceAge <= SCANNER_SOURCE_CHECK_MAX_AGE_MS;
      setSourceVerified(verified);
      const count = verified ? countRecentPublicReports(cached, Date.now()) : 0;
      const health = liveLayerHealth({ source: "FrederickScanner", count,
        earlierCount: cached.length - count, reportedCount: snapshot?.reportedCount, notShownCount: snapshot?.notShownCount,
        unavailable: !snapshot || snapshot.scannerAvailable !== true || !Number.isFinite(sourceAge) || sourceAge < -5 * 60_000,
        timestamp,
        timestampBasis: snapshot?.scannerCheckedAt ? "checked" : "snapshot",
        maxAgeMs: SCANNER_SOURCE_CHECK_MAX_AGE_MS,
      });
      onHealthRef.current?.(failedRef.current ? { ...health, status: cached.length ? "stale" : "unavailable" } : health);
    };
    const reportFailure = () => { if (!alive) return; failedRef.current = true; reportHealth(); };
    const load = async () => {
      try {
        const r = await fetch("/api/pulse/incidents", { cache: "no-store" });
        if (!r.ok) {
          reportFailure();
          return;
        }
        const d = (await r.json()) as Partial<LiveIncidentSnapshot>;
        if (alive && d.scannerAvailable === false) {
          reportFailure();
          return;
        }
        if (alive && Array.isArray(d.items)) {
          setIncidents(d.items);
          incidentsRef.current = d.items;
          snapshotRef.current = d;
          failedRef.current = false;
          onSnapshotRef.current?.(d.items);
          setNowMs(Date.now());
          reportHealth();
        } else if (alive) {
          reportFailure();
        }
      } catch {
        reportFailure();
      }
    };
    void load();
    const pollMs = show ? POLL_MS : probe ? PROBE_POLL_MS : null;
    const poll = pollMs ? setInterval(load, pollMs) : null;
    const tick = setInterval(() => { setNowMs(Date.now()); reportHealth(); }, 30_000);
    const onVisible = () => {
      if ((show || probe) && document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (poll) clearInterval(poll);
      if (tick) clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [probe, show]);

  if (!show) return null;
  const focusedIncident = focusIncidentId
    ? incidents.find((incident) => incident.id === focusIncidentId) ?? null
    : null;
  const visibleSelection = focusedIncident ?? selected;
  const reportIsCurrent = (report: LiveIncidentSignal) => sourceVerified && countRecentPublicReports([report], nowMs) > 0;
  const selectedIsPast = visibleSelection ? !reportIsCurrent(visibleSelection) : false;

  return (
    <>
      {incidents.map((inc) => {
        // Earlier or unverified reports stay visible without implying a
        // current scene through the marker's pulse animation.
        const isPast = !reportIsCurrent(inc);
        return (
        <Marker
          key={inc.id}
          ref={exposeMarkerChild}
          longitude={inc.coordinate.lng}
          latitude={inc.coordinate.lat}
          anchor="center"
        >
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onFocusIncidentChange?.(null);
              gate?.onWillOpen();
              setSelected(inc);
            }}
            aria-label={`${inc.kind} near ${inc.location}${isPast ? " (earlier report)" : ""}`}
            className="fr-incident-marker"
            data-stale={isPast ? "true" : undefined}
            style={{ "--inc-color": KIND_COLOR[inc.kind] ?? "var(--app-brand)" } as React.CSSProperties}
          >
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </Marker>
        );
      })}

      {visibleSelection && (
        <Popup
          longitude={visibleSelection.coordinate.lng}
          latitude={visibleSelection.coordinate.lat}
          anchor="bottom"
          offset={18}
          closeOnClick={false}
          onClose={() => {
            setSelected(null);
            onFocusIncidentChange?.(null);
            gate?.onDidClose();
          }}
        >
          <div className="min-w-[176px] p-1">
            <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {visibleSelection.kind}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              {visibleSelection.location}
            </p>
            {visibleSelection.updates > 1 && (
              <p
                className="mt-1 text-[11px] font-semibold"
                style={{ color: selectedIsPast ? "var(--app-ink-3)" : "var(--app-brand-press)" }}
              >
                {selectedIsPast ? `${visibleSelection.updates} updates` : `Active · ${visibleSelection.updates} updates`}
              </p>
            )}
            {selectedIsPast && <p className="mt-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>Earlier report; current activity is unverified.</p>}
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
              {nowMs ? `${agoLabel(visibleSelection.lastReportedAt, nowMs)} · ` : ""}
              {visibleSelection.status === "corroborated"
                ? "Frederick Scanner + MDOT CHART"
                : "via Frederick Scanner"}
            </p>
          </div>
        </Popup>
      )}
    </>
  );
}

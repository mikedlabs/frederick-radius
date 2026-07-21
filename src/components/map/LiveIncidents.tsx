"use client";

import { useEffect, useState } from "react";
import { Marker, Popup } from "react-map-gl/mapbox";
import { AlertTriangle } from "lucide-react";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";

/**
 * LiveIncidents — the map's live public-safety layer, fed by the FredScanner
 * #incidents CAD stream through /api/scanner/incidents. Only public,
 * non-medical, in-county-geocoded incidents ever arrive (the allowlist +
 * geocoder run server-side), so this component just polls, pins, and ages
 * them out visually. Self-contained: it owns its markers AND its popup, so
 * AppMap mounts it with one line. Empty (renders nothing) until the feed is
 * live. Polls only while its layer toggle is on.
 */

const POLL_MS = 60_000;

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

export default function LiveIncidents({ show }: { show: boolean }) {
  const [incidents, setIncidents] = useState<GeocodedIncident[]>([]);
  const [selected, setSelected] = useState<GeocodedIncident | null>(null);
  // Wall-clock now (ms) for the "X min ago" label, stamped on poll/tick so no
  // Date.now() runs during render (react-hooks purity).
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    // When off, poll nothing and render nothing (see the `if (!show)` guard
    // below). We deliberately DON'T clear state here — clearing synchronously
    // in an effect body triggers cascading renders; the null render hides any
    // stale markers, and the next poll refreshes them on re-enable.
    if (!show) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/scanner/incidents", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { incidents?: GeocodedIncident[] };
        if (alive && Array.isArray(d.incidents)) {
          setIncidents(d.incidents);
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
  }, [show]);

  if (!show) return null;

  return (
    <>
      {incidents.map((inc) => (
        <Marker
          key={`inc:${inc.kind}:${inc.location}:${inc.at}`}
          longitude={inc.lng}
          latitude={inc.lat}
          anchor="center"
        >
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected(inc);
            }}
            aria-label={`${inc.kind} near ${inc.location}`}
            className="fr-incident-marker"
            style={{ "--inc-color": KIND_COLOR[inc.kind] ?? "var(--app-brand)" } as React.CSSProperties}
          >
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </Marker>
      ))}

      {selected && (
        <Popup
          longitude={selected.lng}
          latitude={selected.lat}
          anchor="bottom"
          offset={18}
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          <div className="min-w-[176px] p-1">
            <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {selected.kind}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              {selected.location}
            </p>
            {selected.updates > 1 && (
              <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                Active · {selected.updates} updates
              </p>
            )}
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
              {nowMs ? `${agoLabel(selected.at, nowMs)} · ` : ""}via FrederickScanner
            </p>
          </div>
        </Popup>
      )}
    </>
  );
}

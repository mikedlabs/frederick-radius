"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveLayerGate, type LiveLayerGate } from "./liveLayerGate";
import { Layer, Marker, Popup, Source } from "react-map-gl/mapbox";
import { Cross, Helicopter } from "lucide-react";
import {
  FMH_HELIPORT,
  emptyFmhActivity,
  fmhActivityCount,
  type FmhActivitySummary,
  type RotorcraftApiResponse,
  type RotorcraftSignal,
} from "@/lib/aviation/rotorcraft-public";
import {
  liveLayerHealth,
  type LiveLayerHealth,
} from "@/lib/live-layer-health";
import { haptic } from "@/lib/haptics";

/**
 * Privacy-reduced live rotorcraft layer for AppMap.
 *
 * Keep mounted inside AppMap. `show` controls rendering; `probe` controls quiet
 * off-state monitoring. Generic positions are rounded server-side. Trooper
 * activity is status-only, and FMH activity pulses the fixed 7MD3 heliport
 * rather than exposing an aircraft position. Polling pauses offscreen.
 */

const POLL_MS = 60_000;
const UNAVAILABLE_NOTE =
  "Coverage unavailable. This does not mean no helicopters are flying.";
type FmhSemanticState = "arrival" | "departure" | "nearby" | "quiet";

export type RotorcraftLayerStatus = {
  available: boolean;
  coverage: "incomplete" | "unavailable";
  count: number;
  trooperCount: number;
  fmhCount: number;
  observedAt: string | null;
  stale: boolean;
  note: string;
};

function movementLine(signal: RotorcraftSignal): string {
  const parts: string[] = [];
  if (signal.altitudeFt !== null) {
    parts.push(`about ${signal.altitudeFt.toLocaleString()} ft`);
  }
  if (signal.groundSpeedKt !== null) {
    parts.push(`about ${Math.round(signal.groundSpeedKt * 1.15078)} mph`);
  }
  return parts.join(" · ");
}

function reportAgo(
  signal: RotorcraftSignal,
  receivedAt: string | null,
  nowMs: number,
): string {
  const elapsed =
    receivedAt && nowMs > 0
      ? Math.max(0, (nowMs - Date.parse(receivedAt)) / 1_000)
      : 0;
  const seconds = Math.round(signal.reportAgeSeconds + elapsed);
  if (seconds < 10) return "latest public snapshot";
  if (seconds < 60) return `about ${seconds}s old`;
  return `about ${Math.max(1, Math.round(seconds / 60))} min old`;
}

function activityLabel(activity: FmhActivitySummary): string {
  if (activity.possibleArrivalCount > 0) {
    return "Possible FMH helicopter arrival activity";
  }
  if (activity.possibleDepartureCount > 0) {
    return "Possible FMH helicopter departure activity";
  }
  if (activity.helicopterNearbyCount > 0) {
    return "Public helicopter activity near FMH";
  }
  return "Frederick Health Hospital Heliport";
}

function fmhSemanticState(activity: FmhActivitySummary): FmhSemanticState {
  if (activity.possibleArrivalCount > 0) return "arrival";
  if (activity.possibleDepartureCount > 0) return "departure";
  if (activity.helicopterNearbyCount > 0) return "nearby";
  return "quiet";
}

function ActivityCount({
  count,
  label,
  pluralLabel = `${label}s`,
}: {
  count: number;
  label: string;
  pluralLabel?: string;
}) {
  if (count < 1) return null;
  return (
    <li>
      {count} {count === 1 ? label : pluralLabel}
    </li>
  );
}

export default function LiveRotorcraft({
  show,
  probe = false,
  onHealth,
  onStatus,
  gate,
}: {
  show: boolean;
  probe?: boolean;
  onHealth?: (health: LiveLayerHealth) => void;
  onStatus?: (status: RotorcraftLayerStatus) => void;
  /** Puts this internally-owned popup under AppMap's one-foreground gate. */
  gate?: LiveLayerGate;
}) {
  const [signals, setSignals] = useState<RotorcraftSignal[]>([]);
  const [fmhActivity, setFmhActivity] = useState<FmhActivitySummary>(() =>
    emptyFmhActivity(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useLiveLayerGate(gate, () => setSelectedId(null));
  const [fmhOpen, setFmhOpen] = useState(false);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [fmhSweep, setFmhSweep] = useState<
    "arrival" | "departure" | null
  >(null);
  const onHealthRef = useRef(onHealth);
  const onStatusRef = useRef(onStatus);
  const previousFmhStateRef = useRef<FmhSemanticState | null>(null);
  const fmhSweepTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onHealthRef.current = onHealth;
    onStatusRef.current = onStatus;
  }, [onHealth, onStatus]);

  useEffect(() => {
    if (!show && !probe) return;
    let alive = true;

    const clearActivity = () => {
      setSignals([]);
      setFmhActivity(emptyFmhActivity());
      setSelectedId(null);
      setFmhOpen(false);
      setReceivedAt(null);
      setNowMs(Date.now());
      previousFmhStateRef.current = null;
      setFmhSweep(null);
    };

    const reportUnavailable = () => {
      if (!alive) return;
      clearActivity();
      onHealthRef.current?.(
        liveLayerHealth({ source: "ADSB.lol", unavailable: true }),
      );
      onStatusRef.current?.({
        available: false,
        coverage: "unavailable",
        count: 0,
        trooperCount: 0,
        fmhCount: 0,
        observedAt: null,
        stale: false,
        note: UNAVAILABLE_NOTE,
      });
    };

    const load = async () => {
      try {
        const response = await fetch("/api/aviation/rotorcraft", {
          cache: "no-store",
        });
        if (!response.ok) {
          reportUnavailable();
          return;
        }
        const data = (await response.json()) as RotorcraftApiResponse;
        if (!alive) return;

        // Never keep stale activity markers or attention counts after coverage
        // becomes unavailable. A stale snapshot is not current flight status.
        const current = data.available && data.stale !== true;
        if (!current) {
          reportUnavailable();
          return;
        }

        const nextSignals = Array.isArray(data.signals) ? data.signals : [];
        const nextFmhActivity = data.fmhActivity ?? emptyFmhActivity();
        const nextFmhState = fmhSemanticState(nextFmhActivity);
        const previousFmhState = previousFmhStateRef.current;
        if (
          show &&
          previousFmhState !== null &&
          previousFmhState !== nextFmhState &&
          (nextFmhState === "arrival" || nextFmhState === "departure") &&
          document.visibilityState === "visible"
        ) {
          setFmhSweep(nextFmhState);
          haptic("warning");
          if (fmhSweepTimerRef.current) {
            window.clearTimeout(fmhSweepTimerRef.current);
          }
          fmhSweepTimerRef.current = window.setTimeout(
            () => setFmhSweep(null),
            2_000,
          );
        }
        previousFmhStateRef.current = nextFmhState;
        setSignals(nextSignals);
        setFmhActivity(nextFmhActivity);
        setReceivedAt(data.receivedAt);
        setNowMs(Date.now());
        setSelectedId((selected) =>
          selected &&
          nextSignals.some((signal) => signal.id === selected)
            ? selected
            : null,
        );

        const nextFmhCount = fmhActivityCount(nextFmhActivity);
        onHealthRef.current?.(
          liveLayerHealth({
            source: "ADSB.lol",
            count: data.observationCount,
            timestamp: data.observedAt,
            maxAgeMs: 150_000,
          }),
        );
        onStatusRef.current?.({
          available: true,
          coverage: data.coverage,
          count: data.observationCount,
          trooperCount: data.trooperAirborneCount,
          fmhCount: nextFmhCount,
          observedAt: data.observedAt,
          stale: false,
          note: data.note,
        });
      } catch {
        reportUnavailable();
      }
    };

    const loadWhileVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    loadWhileVisible();
    const poll = window.setInterval(loadWhileVisible, POLL_MS);
    const clock = window.setInterval(() => {
      if (document.visibilityState === "visible") setNowMs(Date.now());
    }, 15_000);
    document.addEventListener("visibilitychange", loadWhileVisible);

    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
      if (fmhSweepTimerRef.current) {
        window.clearTimeout(fmhSweepTimerRef.current);
      }
      document.removeEventListener("visibilitychange", loadWhileVisible);
    };
  }, [probe, show]);

  const selected = useMemo(
    () => signals.find((signal) => signal.id === selectedId) ?? null,
    [selectedId, signals],
  );
  const fmhCount = fmhActivityCount(fmhActivity);
  const fmhAttention = fmhCount > 0;

  if (!show) return probe ? <MapAttributionSource /> : null;

  return (
    <>
      <MapAttributionSource />
      <style>
        {
          "@keyframes fr-fmh-arrival{0%{opacity:0;transform:scale(2.2)}24%{opacity:.72}100%{opacity:0;transform:scale(.72)}}" +
            "@keyframes fr-fmh-departure{0%{opacity:.72;transform:scale(.72)}100%{opacity:0;transform:scale(2.2)}}"
        }
      </style>

      <Marker
        longitude={FMH_HELIPORT.lng}
        latitude={FMH_HELIPORT.lat}
        anchor="center"
      >
        <button
          type="button"
          aria-label={`${activityLabel(fmhActivity)}. Open details.`}
          onClick={(event) => {
            event.stopPropagation();
            haptic(fmhAttention ? "medium" : "light");
            setFmhOpen((open) => !open);
            setSelectedId(null);
          }}
          className="relative grid h-11 w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            color: "var(--app-brand-press)",
            outlineColor: "var(--app-brand-press)",
          }}
        >
          {fmhAttention && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                border: "3px solid var(--app-brand-press)",
                opacity: 0.24,
              }}
            />
          )}
          {fmhSweep && (
            <span
              key={fmhSweep}
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                border: "3px solid var(--app-brand-press)",
                animation: `fr-fmh-${fmhSweep} 1.8s ease-out both`,
              }}
            />
          )}
          <span
            aria-hidden
            className="relative grid h-8 w-8 place-items-center rounded-full border-2"
            style={{
              borderColor: "var(--app-brand-press)",
              background: "var(--app-bg-elevated-solid)",
              boxShadow: fmhAttention
                ? "0 4px 18px color-mix(in srgb, var(--app-brand-press) 38%, transparent)"
                : "var(--app-shadow-2)",
            }}
          >
            <Cross className="h-4 w-4" strokeWidth={3} />
          </span>
          {fmhAttention && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 font-mono text-[10px] font-bold text-white"
              style={{ background: "var(--app-brand-press)" }}
            >
              {fmhCount}
            </span>
          )}
        </button>
      </Marker>

      {signals.map((signal) => (
        <Marker
          key={signal.id}
          longitude={signal.lng}
          latitude={signal.lat}
          anchor="center"
        >
          <button
            type="button"
            aria-label="Approximate public helicopter observation. Open details."
            onClick={(event) => {
              event.stopPropagation();
              haptic("light");
              setFmhOpen(false);
              // A toggle-closed tap must not clear the rest of the map, so
              // the gate only runs on the OPEN half.
              if (selectedId !== signal.id) gate?.onWillOpen();
              setSelectedId((current) =>
                current === signal.id ? null : signal.id,
              );
            }}
            className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              color: "var(--app-cool)",
              outlineColor: "var(--app-cool)",
            }}
          >
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full border-2"
              style={{
                borderColor: "var(--app-cool)",
                background: "var(--app-bg-elevated-solid)",
                boxShadow: "var(--app-shadow-2)",
              }}
            >
              <Helicopter className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </span>
          </button>
        </Marker>
      ))}

      {fmhOpen && (
        <Popup
          longitude={FMH_HELIPORT.lng}
          latitude={FMH_HELIPORT.lat}
          anchor="bottom"
          offset={24}
          closeOnClick={false}
          onClose={() => setFmhOpen(false)}
          maxWidth="290px"
        >
          <div className="min-w-[230px] p-1">
            <p
              className="font-serif text-[14px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {activityLabel(fmhActivity)}
            </p>
            <p
              className="mt-0.5 text-[10.5px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Frederick Health Hospital Heliport · 7MD3
            </p>

            {fmhAttention ? (
              <ul
                className="mt-2 space-y-0.5 text-[11px]"
                style={{ color: "var(--app-ink-2)" }}
              >
                <ActivityCount
                  count={fmhActivity.possibleArrivalCount}
                  label="possible arrival"
                />
                <ActivityCount
                  count={fmhActivity.possibleDepartureCount}
                  label="possible departure"
                />
                <ActivityCount
                  count={fmhActivity.helicopterNearbyCount}
                  label="helicopter nearby"
                  pluralLabel="helicopters nearby"
                />
              </ul>
            ) : (
              <p
                className="mt-2 text-[11px]"
                style={{ color: "var(--app-ink-2)" }}
              >
                The latest public snapshot shows no nearby helicopter.
              </p>
            )}

            <p
              className="mt-2 text-[10.5px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              Activity is inferred from public position, heading, altitude, and
              movement, then shown only at the fixed heliport. It does not
              confirm a hospital landing or takeoff.
            </p>
            <Attribution />
          </div>
        </Popup>
      )}

      {selected && (
        <Popup
          longitude={selected.lng}
          latitude={selected.lat}
          anchor="bottom"
          offset={22}
          closeOnClick={false}
          onClose={() => setSelectedId(null)}
          maxWidth="280px"
        >
          <div className="min-w-[220px] p-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{
                  color: "var(--app-cool)",
                  background:
                    "color-mix(in srgb, var(--app-cool) 12%, transparent)",
                }}
              >
                <Helicopter className="h-4 w-4" />
              </span>
              <p
                className="font-serif text-[14px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Public helicopter observation
              </p>
            </div>

            <p
              className="mt-2 font-mono text-[10.5px] tabular-nums"
              style={{ color: "var(--app-ink-2)" }}
            >
              {movementLine(selected) || "Movement details unavailable"}
            </p>
            <p
              className="mt-1 font-mono text-[10px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {selected.aircraftType
                ? `${selected.aircraftType} · `
                : ""}
              {reportAgo(selected, receivedAt, nowMs)}
            </p>
            <p
              className="mt-2 text-[10.5px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              Location is rounded to about 0.01°, roughly one kilometer. No
              route or flight history is retained.
            </p>
            <Attribution />
          </div>
        </Popup>
      )}
    </>
  );
}

function MapAttributionSource() {
  return (
    <Source
      id="live-rotorcraft-attribution"
      type="geojson"
      attribution='<a href="https://adsb.lol" target="_blank" rel="noopener noreferrer">Aircraft © ADSB.lol contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL 1.0</a>'
      data={{ type: "FeatureCollection", features: [] }}
    >
      <Layer
        id="live-rotorcraft-attribution-anchor"
        type="circle"
        paint={{ "circle-radius": 0, "circle-opacity": 0 }}
      />
    </Source>
  );
}

function Attribution() {
  return (
    <p
      className="mt-2 border-t pt-1.5 text-[9.5px] leading-snug"
      style={{
        borderColor: "var(--app-border)",
        color: "var(--app-ink-3)",
      }}
    >
      Public ADS-B coverage is incomplete.{" "}
      <a
        href="https://adsb.lol"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        ADSB.lol contributors
      </a>{" "}
      ·{" "}
      <a
        href="https://opendatacommons.org/licenses/odbl/1-0/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        ODbL 1.0
      </a>
    </p>
  );
}

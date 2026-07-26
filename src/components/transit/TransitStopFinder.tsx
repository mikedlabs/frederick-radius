"use client";

import { useMemo, useState } from "react";
import { ChevronDown, LocateFixed, MapPin, Search, X } from "lucide-react";
import TRANSIT from "@/data/transit.json";
import { haversineMeters } from "@/lib/geo";
import { useGeolocation } from "@/hooks/useGeolocation";
import StopArrivalsPopup, { type SelectedStop } from "./StopArrivalsPopup";

type StopRecord = { id: string | number; name: string; lat: number; lng: number };

const STOPS: SelectedStop[] = (TRANSIT.stops as StopRecord[]).map((stop) => ({
  id: String(stop.id),
  name: stop.name,
  lat: stop.lat,
  lng: stop.lng,
}));

const MAX_RESULTS = 6;

function milesLabel(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.max(1, Math.round(meters * 3.28084))} ft` : `${miles.toFixed(1)} mi`;
}

function directionsUrl(stop: SelectedStop): string {
  const destination = encodeURIComponent(`${stop.lat},${stop.lng}`);
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${destination}`;
}

/**
 * Keyboard- and screen-reader-accessible counterpart to the map's stop dots.
 * It stays collapsed until needed, then offers the same live arrival detail by
 * stop name or current location without forcing anyone to operate a canvas.
 */
export default function TransitStopFinder() {
  const { state: geoState, request: requestLocation } = useGeolocation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedStop | null>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const position = geoState.status === "granted" ? geoState.position : null;

  const results = useMemo(() => {
    if (normalized.length >= 2) {
      return STOPS.filter((stop) =>
        stop.name.toLocaleLowerCase().includes(normalized),
      )
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_RESULTS)
        .map((stop) => ({ stop, distance: null as number | null }));
    }
    if (!position) return [];
    return STOPS.map((stop) => ({
      stop,
      distance: haversineMeters(position, stop),
    }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_RESULTS);
  }, [normalized, position]);

  return (
    <details
      className="group overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{
              color: "var(--app-cool)",
              background: "var(--app-cool-tint-14)",
            }}
          >
            <MapPin className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Find a bus stop
            </span>
            <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
              Search by name or use your location
            </span>
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition group-open:rotate-180"
          strokeWidth={2.25}
          aria-hidden
          style={{ color: "var(--app-ink-3)" }}
        />
      </summary>

      <div className="space-y-3 border-t px-3 pb-3 pt-3" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search bus stops by name</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              strokeWidth={2}
              aria-hidden
              style={{ color: "var(--app-ink-3)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(null);
              }}
              placeholder="Stop or street name"
              className="min-h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] py-2 pl-9 pr-9 text-[14px]"
              style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelected(null);
                }}
                aria-label="Clear stop search"
                className="tap-44 absolute right-0 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full"
                style={{ color: "var(--app-ink-3)" }}
              >
                <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={requestLocation}
            disabled={geoState.status === "loading"}
            aria-label="Show the nearest bus stops"
            className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--app-radius-md)] border disabled:opacity-60"
            style={{
              borderColor: position ? "var(--app-cool)" : "var(--app-control-border)",
              color: position ? "var(--app-cool)" : "var(--app-ink-2)",
              background: position ? "var(--app-cool-tint-6)" : "var(--app-bg-elevated-solid)",
            }}
          >
            <LocateFixed className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden />
          </button>
        </div>

        {normalized.length === 1 && (
          <p className="text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            Type one more letter to search.
          </p>
        )}

        {normalized.length >= 2 && results.length === 0 && (
          <p className="text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
            No mapped stop matches that name.
          </p>
        )}

        {!normalized && !position && (
          <p className="text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Use the location button to list the nearest mapped stops. Frederick Radius only asks after you tap.
          </p>
        )}

        {results.length > 0 && !selected && (
          <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
            {results.map(({ stop, distance }) => (
              <li key={stop.id}>
                <button
                  type="button"
                  onClick={() => setSelected(stop)}
                  className="tap-44-y flex w-full items-center gap-3 py-2 text-left"
                >
                  <MapPin
                    className="h-4 w-4 shrink-0"
                    strokeWidth={2.15}
                    aria-hidden
                    style={{ color: "var(--app-cool)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    {stop.name}
                  </span>
                  {distance != null && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      {milesLabel(distance)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div
            className="rounded-[var(--app-radius-md)] border p-3"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-sunken)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                {selected.name}
              </p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="tap-44 -mr-2 -mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-full"
                aria-label="Close stop arrivals"
                style={{ color: "var(--app-ink-3)" }}
              >
                <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
            <div className="mt-2">
              <StopArrivalsPopup key={selected.id} stop={selected} showName={false} />
            </div>
            <a
              href={directionsUrl(selected)}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44-y mt-2 inline-flex items-center text-[12px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              Walking directions to this stop
            </a>
          </div>
        )}
      </div>
    </details>
  );
}

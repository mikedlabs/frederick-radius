"use client";

import { useState } from "react";
import { Marker, Popup } from "react-map-gl/mapbox";
import stationsData from "@/data/fire-stations.json";

/**
 * FireStations — the county's fire & rescue companies pinned on the map, from
 * Frederick County GIS (authoritative, static). Each pin is the station's own
 * number, which is the root of its call signs (Engine 1, Tower 1… all live at
 * Station 1), so the map doubles as a call-sign key. Opt-in, OFF by default;
 * self-contained (owns its markers + popup) so AppMap mounts it with one line.
 * Data is baked into the bundle (30 stations that never move), so there's no
 * fetch and nothing to fail.
 */

type FireStation = {
  station: string;
  name: string;
  town: string;
  lng: number;
  lat: number;
};

const STATIONS = stationsData as FireStation[];

export default function FireStations({ show }: { show: boolean }) {
  const [selected, setSelected] = useState<FireStation | null>(null);

  if (!show) return null;

  return (
    <>
      {STATIONS.map((s) => (
        <Marker key={`fs:${s.station}`} longitude={s.lng} latitude={s.lat} anchor="center">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected(s);
            }}
            aria-label={`Fire Station ${s.station}: ${s.name}`}
            className="flex items-center justify-center rounded-full font-mono text-[10px] font-bold tabular-nums text-white shadow-sm"
            style={{
              width: 22,
              height: 22,
              background: "var(--app-brand-2)",
              border: "1.5px solid #fff",
            }}
          >
            {s.station}
          </button>
        </Marker>
      ))}

      {selected && (
        <Popup
          longitude={selected.lng}
          latitude={selected.lat}
          anchor="bottom"
          offset={16}
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          <div className="min-w-[176px] p-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-brand-2)" }}>
              Station {selected.station}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
              {selected.name}
            </p>
            {selected.town && (
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                {selected.town}
              </p>
            )}
            <p className="mt-1.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
              Units on this company carry its number (Engine {selected.station}, Tower {selected.station}…).
            </p>
          </div>
        </Popup>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Map, { Marker, Popup, AttributionControl } from "react-map-gl/maplibre";
import { useFrederickFlavorStyle } from "@/components/map/useFrederickFlavorStyle";
import { FREDERICK_CENTER } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * OverheadMap — the "where are the planes" answer on a real map. Every
 * transmitting aircraft is plotted at its true position on the same
 * self-hosted county basemap the rest of the app uses, each a plane glyph
 * rotated to its heading and colored by altitude band. Tap one for a popup with
 * its callsign, route (from → to), altitude, and speed.
 *
 * Structurally typed `planes` prop (a subset of the /api/aircraft shape) so it
 * stays decoupled from PlanesOverhead, which owns the polling + selection.
 */

type Plane = {
  hex: string;
  flight: string | null;
  type: string | null;
  desc: string | null;
  alt: number | null;
  gs: number | null;
  track: number | null;
  lat: number;
  lon: number;
  dst: number | null;
  emergency: string | null;
  route?: { from: { iata: string; name: string } | null; to: { iata: string; name: string } | null } | null;
  photo?: { thumb: string; link: string; by: string } | null;
};

function band(alt: number | null): string {
  if (alt == null || alt < 5_000) return "var(--app-brand)";
  if (alt < 18_000) return "var(--app-accent)";
  return "var(--app-cool)";
}
const mph = (kt: number): number => Math.round(kt * 1.15078);

export default function OverheadMap({
  planes,
  selected,
  onSelect,
  height = 400,
}: {
  planes: Plane[];
  selected: string | null;
  onSelect: (hex: string | null) => void;
  height?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const mapStyle = useFrederickFlavorStyle();
  const sel = planes.find((p) => p.hex === selected) ?? null;
  const open = sel ?? planes.find((p) => p.hex === hover) ?? null;

  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", height }}
    >
      <Map
        mapStyle={mapStyle}
        initialViewState={{ longitude: FREDERICK_CENTER.lng, latitude: FREDERICK_CENTER.lat, zoom: 7.7 }}
        style={{ width: "100%", height: "100%" }}
        interactive
        cooperativeGestures={false}
        attributionControl={false}
        onClick={() => onSelect(null)}
      >
        <AttributionControl compact position="bottom-right" />
        {/* Frederick — the home point. */}
        <Marker longitude={FREDERICK_CENTER.lng} latitude={FREDERICK_CENTER.lat} anchor="center">
          <span aria-hidden className="block h-2.5 w-2.5 rounded-full" style={{ background: "var(--app-brand)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--app-brand) 28%, transparent)" }} />
        </Marker>

        {planes.map((p) => {
          const c = p.emergency ? "var(--app-danger)" : band(p.alt);
          const isSel = p.hex === selected;
          return (
            <Marker key={p.hex} longitude={p.lon} latitude={p.lat} anchor="center">
              <button
                type="button"
                aria-label={`${p.flight || p.type || "Aircraft"}: tap for detail`}
                onClick={(e) => { e.stopPropagation(); haptic("light"); onSelect(isSel ? null : p.hex); }}
                onMouseEnter={() => setHover(p.hex)}
                onMouseLeave={() => setHover((h) => (h === p.hex ? null : h))}
                className="grid place-items-center"
                style={{ width: 26, height: 26, cursor: "pointer", background: "none", border: "none", padding: 0 }}
              >
                {isSel && (
                  <span aria-hidden className="absolute h-[22px] w-[22px] rounded-full" style={{ border: `1.5px solid ${c}`, opacity: 0.9 }} />
                )}
                {/* A top-down airplane silhouette (nose up), rotated to the
                    aircraft's true heading. */}
                <svg width="19" height="19" viewBox="-8 -8 16 16" style={{ transform: `rotate(${p.track ?? 0}deg)`, display: "block" }} aria-hidden>
                  <path
                    d="M0,-7 L1.2,-4 L1.2,-1.5 L7,2 L7,3.4 L1.2,1.8 L1.2,4.8 L3,6.3 L3,7.2 L0,6.3 L-3,7.2 L-3,6.3 L-1.2,4.8 L-1.2,1.8 L-7,3.4 L-7,2 L-1.2,-1.5 L-1.2,-4 Z"
                    fill={c}
                    stroke="#fff"
                    strokeWidth="0.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Marker>
          );
        })}

        {open && (
          <Popup
            longitude={open.lon}
            latitude={open.lat}
            anchor="bottom"
            offset={16}
            closeButton={false}
            closeOnClick={false}
            onClose={() => onSelect(null)}
            maxWidth="240px"
          >
            <div className="space-y-1 px-0.5 py-0.5" style={{ fontFamily: "var(--font-sans)" }}>
              {/* A real spotter photo of the airframe (planespotters), linking
                  to the photo page with the photographer credit. */}
              {open.photo && (
                <a
                  href={open.photo.link || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative mb-1.5 block h-[118px] w-full overflow-hidden rounded-[var(--app-radius-sm)]"
                  style={{ background: "var(--app-bg-sunken)" }}
                >
                  <Image src={open.photo.thumb} alt={`${open.flight || open.type || "Aircraft"} photo`} fill sizes="220px" className="object-cover" />
                  {open.photo.by && (
                    <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white">
                      © {open.photo.by}
                    </span>
                  )}
                </a>
              )}
              <p className="font-serif text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                {open.flight || open.type || open.hex.toUpperCase()}
                {open.desc && <span className="font-sans text-[11px] font-normal" style={{ color: "var(--app-ink-3)" }}>{`  ·  ${open.desc}`}</span>}
              </p>
              {open.route && (open.route.from || open.route.to) && (
                <p className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}
                  title={`${open.route.from?.name ?? "Origin unknown"} → ${open.route.to?.name ?? "Arrival unknown"}`}>
                  {open.route.from?.iata ?? "???"} <span style={{ color: "var(--app-ink-3)" }}>→</span> {open.route.to?.iata ?? "???"}
                </p>
              )}
              <p className="font-mono text-[10.5px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {open.alt != null ? `${open.alt.toLocaleString()} ft` : "altitude n/a"}
                {open.gs != null && `  ·  ${mph(open.gs)} mph`}
                {open.dst != null && `  ·  ${Math.round(open.dst)} nm`}
              </p>
            </div>
          </Popup>
        )}
      </Map>
      {/* No on-map badge: it collides with the basemap attribution, and the
          legend row beneath the map already carries "N in range · live". */}
    </div>
  );
}

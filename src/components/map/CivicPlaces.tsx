"use client";

import { useState } from "react";
import { Marker, Popup } from "react-map-gl/mapbox";
import { Trees, BookOpen, ExternalLink } from "lucide-react";
import parksData from "@/data/parks.json";
import librariesData from "@/data/libraries.json";

/**
 * CivicPlaces — county parks and public libraries pinned from Frederick County
 * GIS (authoritative, static; they don't move, so the data is baked into the
 * bundle). One opt-in layer, OFF by default, mirroring FireStations. Parks are
 * spruce with a tree; libraries are the cool blue with a book. Self-contained
 * (owns markers + popup) so AppMap mounts it with one line.
 */

type Park = { name: string; address: string; town: string; lng: number; lat: number };
type Library = { name: string; address: string; town: string; phone: string; web: string; lng: number; lat: number };

const PARKS = parksData as Park[];
const LIBRARIES = librariesData as Library[];

type Selected =
  | { kind: "park"; item: Park }
  | { kind: "library"; item: Library };

export default function CivicPlaces({ show }: { show: boolean }) {
  const [selected, setSelected] = useState<Selected | null>(null);

  if (!show) return null;

  return (
    <>
      {PARKS.map((p) => (
        <Marker key={`park:${p.name}`} longitude={p.lng} latitude={p.lat} anchor="center">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected({ kind: "park", item: p });
            }}
            aria-label={`Park: ${p.name}`}
            className="flex items-center justify-center rounded-full text-white shadow-sm"
            style={{ width: 20, height: 20, background: "var(--app-brand-2)", border: "1.5px solid #fff" }}
          >
            <Trees className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
          </button>
        </Marker>
      ))}

      {LIBRARIES.map((l) => (
        <Marker key={`lib:${l.name}`} longitude={l.lng} latitude={l.lat} anchor="center">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected({ kind: "library", item: l });
            }}
            aria-label={`Library: ${l.name}`}
            className="flex items-center justify-center rounded-full text-white shadow-sm"
            style={{ width: 20, height: 20, background: "var(--app-cool)", border: "1.5px solid #fff" }}
          >
            <BookOpen className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
          </button>
        </Marker>
      ))}

      {selected && (
        <Popup
          longitude={selected.item.lng}
          latitude={selected.item.lat}
          anchor="bottom"
          offset={14}
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          <div className="min-w-[176px] p-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wide" style={{ color: selected.kind === "park" ? "var(--app-brand-2)" : "var(--app-cool)" }}>
              {selected.kind === "park" ? "County park" : "Public library"}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
              {selected.item.name}
            </p>
            {selected.item.address && (
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                {selected.item.address}
                {selected.item.town ? `, ${selected.item.town}` : ""}
              </p>
            )}
            {selected.kind === "library" && selected.item.phone && (
              <p className="mt-0.5 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {selected.item.phone}
              </p>
            )}
            {selected.kind === "library" && selected.item.web && (
              <a
                href={selected.item.web}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold underline"
                style={{ color: "var(--app-cool)" }}
              >
                Hours & branch page
                <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              </a>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}

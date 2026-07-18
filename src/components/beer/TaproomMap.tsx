"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";

/** The county brewery map stays tap-to-activate so Mapbox loads on demand. */

const AppMapClient = dynamic(() => import("@/components/map/AppMapClient"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[62vh] min-h-[380px] w-full items-center justify-center border"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
    >
      <span className="text-[13px]">Loading map…</span>
    </div>
  ),
});

export default function TaproomMap({ places }: { places: PlaceCardData[] }) {
  const [open, setOpen] = useState(false);
  if (places.length === 0) return null;

  return (
    <section aria-labelledby="taproom-map-heading">
      <header className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>Brewery map</p>
        <h2
          id="taproom-map-heading"
          className="mt-1 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]"
          style={{ color: "var(--app-ink)" }}
        >
          See breweries across the county.
        </h2>
        </div>
        <p className="max-w-[22rem] text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>Compare the downtown cluster with breweries in Brunswick, Thurmont, Mount Airy, and the countryside.</p>
      </header>

      {open ? (
        <div
          className="relative h-[62vh] min-h-[380px] w-full overflow-hidden border"
          style={{ borderColor: "var(--app-border)" }}
        >
          <AppMapClient places={places} fullBleed />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group grid min-h-[152px] w-full grid-cols-[110px_minmax(0,1fr)] overflow-hidden rounded-[12px] border border-black/12 bg-[#f7f0e4] text-left text-[#281e14] transition hover:border-black/24 sm:grid-cols-[190px_minmax(0,1fr)]"
        >
          <span className="relative min-h-[152px] overflow-hidden" aria-hidden>
            <Image
              src="/images/seasons/summer/083.jpg"
              alt=""
              fill
              sizes="(max-width: 640px) 110px, 190px"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          </span>
          <span className="flex min-w-0 items-center justify-between gap-3 p-4 sm:p-6">
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[10px] font-semibold text-black/65"><MapIcon className="h-3.5 w-3.5" aria-hidden />Interactive map</span>
              <span className="mt-2 block text-[16px] font-semibold">Open the brewery map</span>
              <span className="mt-1 block text-[10px] text-black/65">{places.length} breweries pinned</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-black/65 transition group-hover:translate-x-1" aria-hidden />
          </span>
        </button>
      )}
    </section>
  );
}

"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Map as MapIcon, MapPin } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * The taproom map — every brewery on one county view, promoted to its own
 * visible section (owner ask, Jul 2026: a beer command center that shows
 * them all on a map; it existed but sat buried as the explorer's third
 * tab). Tap-to-activate on purpose: Mapbox only downloads when the user
 * opens the map, so the guide's initial load stays light.
 */

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
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-brand-press)" }}>The county pour map</p>
        <h2
          id="taproom-map-heading"
          className="mt-2 max-w-[10ch] font-serif text-[clamp(2.8rem,8vw,4.7rem)] font-semibold leading-[0.87] tracking-[-0.05em]"
          style={{ color: "var(--app-ink)" }}
        >
          Seventeen rooms. One county.
        </h2>
        </div>
        <p className="max-w-[22rem] text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>See the downtown cluster, the farm breweries, and the rooms worth building a drive around.</p>
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
          className="beer-map-gate group relative min-h-[340px] w-full overflow-hidden border border-white/10 bg-[#201c16] p-5 text-left text-[#f7f0e4] shadow-[0_28px_60px_-36px_rgba(23,16,9,.8)] sm:min-h-[380px] sm:p-8"
        >
          <Image
            src="/images/seasons/summer/083.jpg"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 840px"
            className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.025]"
          />
          <span className="absolute inset-0 bg-[linear-gradient(105deg,rgba(18,14,10,.94)_0%,rgba(18,14,10,.72)_48%,rgba(18,14,10,.34)_100%)]" aria-hidden />
          <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_38%,rgba(13,10,7,.78)_100%)]" aria-hidden />
          {[
            [18, 68], [31, 48], [43, 59], [55, 39], [66, 57], [78, 32], [84, 66], [48, 75], [69, 78],
          ].map(([left, top], index) => (
            <span key={`${left}-${top}`} className="absolute grid h-5 w-5 place-items-center rounded-full border border-[#e3b65d]/55 bg-[#15130f] text-[#e3b65d] transition-transform duration-300 group-hover:scale-110" style={{ left: `${left}%`, top: `${top}%`, transitionDelay: `${index * 25}ms` }} aria-hidden>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
          ))}
          <span className="relative flex items-start justify-between gap-5">
            <span>
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#e3b65d]">Interactive map</span>
              <span className="mt-2 block max-w-[8ch] font-serif text-[42px] font-semibold leading-[0.86] tracking-[-0.045em] sm:text-[54px]">Open the whole beer county.</span>
            </span>
            <span className="grid h-12 w-12 shrink-0 place-items-center border border-white/20 bg-white/5">
              <MapIcon className="h-5 w-5" strokeWidth={1.8} />
            </span>
          </span>
          <span className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3 border-t border-white/14 pt-4 sm:bottom-8 sm:left-8 sm:right-8">
            <span className="flex items-center gap-2 text-[10px] text-white/54"><MapPin className="h-3.5 w-3.5 text-[#e3b65d]" aria-hidden />{places.length} breweries pinned</span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold">Launch map <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" aria-hidden /></span>
          </span>
        </button>
      )}
    </section>
  );
}

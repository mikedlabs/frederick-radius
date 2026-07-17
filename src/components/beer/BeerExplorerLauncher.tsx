"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronUp, Search, SlidersHorizontal } from "lucide-react";
import { ALL_BEERS } from "@/data/beers";
import type { PlaceCardData } from "@/lib/loaders/places";

const EXPLORER_ID = "beer-explorer-panel";

// BeerFinder (and its search/filter UI) is requested only when the user opens
// the secondary explorer. Its Mapbox child remains separately lazy by tab.
const LazyBeerFinder = dynamic(() => import("./BeerFinder"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-32 items-center justify-center border border-dashed px-4 py-8 text-[13px]"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
    >
      Loading the beer explorer…
    </div>
  ),
});

/**
 * Progressive-disclosure shell for the complete catalog. It accepts the
 * same props as BeerFinder so the page can swap it in without changing its
 * data contract.
 */
export default function BeerExplorerLauncher({
  breweryCards,
}: {
  breweryCards: PlaceCardData[];
}) {
  // The catalog is depth, not the front door. Opening it on arrival turned the
  // guide back into a 174-row directory and loaded client code before intent.
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(false);
  const beerCount = ALL_BEERS.length;

  const mounted = useRef(false);
  useEffect(() => {
    // Focus management is for USER toggles only. With the explorer open by
    // default, running this on mount stole focus (and drew a ring) on a
    // heading mid-page before the user did anything.
    if (!mounted.current) {
      mounted.current = true;
      wasOpen.current = open;
      return;
    }
    if (open) headingRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <section
      id="all-beer"
      aria-labelledby={open ? "beer-explorer-heading" : "all-beer-heading"}
      className="-mx-4 scroll-mt-24 overflow-hidden border-y sm:-mx-5 lg:mx-0 lg:rounded-[8px] lg:border"
      style={{
        borderColor: "rgba(255,255,255,.1)",
        background: open ? "var(--app-bg-elevated-solid)" : "#15130f",
        boxShadow: "0 28px 62px -38px rgba(20,14,8,.78)",
      }}
    >
      <div id={EXPLORER_ID} hidden={!open} className="space-y-5 p-4 sm:p-7">
        <header className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--app-border)" }}>
          <div className="min-w-0">
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Full beer catalog
            </p>
            <h2
              ref={headingRef}
              id="beer-explorer-heading"
              tabIndex={-1}
              className="mt-1 font-serif text-[22px] font-semibold tracking-tight focus-visible:outline-none"
              style={{ color: "var(--app-ink)" }}
            >
              Search all {beerCount} beers
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-controls={EXPLORER_ID}
            aria-expanded="true"
            className="tap-44-y inline-flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-[12px] font-semibold"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-bg-elevated-solid)",
              color: "var(--app-ink-2)",
            }}
          >
            Collapse
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        </header>

        <div>
          {hasOpened && <LazyBeerFinder breweryCards={breweryCards} />}
        </div>
      </div>

      <div hidden={open} className="relative grid min-h-[330px] gap-7 overflow-hidden p-5 text-[#f7f0e4] sm:grid-cols-[1fr_auto] sm:items-end sm:p-9">
        <span className="pointer-events-none absolute -right-3 -top-10 font-serif text-[190px] font-semibold leading-none text-white/[0.035]" aria-hidden>{beerCount}</span>
        <div className="relative flex gap-4">
          <span aria-hidden className="mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center border border-[#e3b65d]/45 text-[#e3b65d]">
            <SlidersHorizontal className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#e3b65d]">
              Looking for something specific?
            </p>
            <h2
              id="all-beer-heading"
              className="mt-3 max-w-[8ch] font-serif text-[clamp(2.8rem,9vw,5rem)] font-semibold leading-[0.84] tracking-[-0.05em]"
            >
              Every pour, searchable.
            </h2>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-white/56">
              Search all {beerCount} beers by name, style, brewery, or town.
            </p>
          </div>
        </div>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setHasOpened(true);
            setOpen(true);
          }}
          aria-controls={EXPLORER_ID}
          aria-expanded="false"
          className="relative inline-flex min-h-13 w-full items-center justify-center gap-2 border border-[#e3b65d]/55 bg-[#e3b65d] px-5 py-3 text-[13px] font-bold text-[#17130e] transition hover:bg-[#f0ca7c] sm:w-auto"
        >
          <Search className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Search all {beerCount} beers
        </button>
      </div>
    </section>
  );
}

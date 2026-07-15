"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, ChevronUp, Search } from "lucide-react";
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
      className="flex min-h-32 items-center justify-center rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-[13px]"
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
  beerCount,
}: {
  breweryCards: PlaceCardData[];
  beerCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) headingRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <section
      id="all-beer"
      aria-labelledby={open ? "beer-explorer-heading" : "all-beer-heading"}
      className="scroll-mt-24 overflow-hidden rounded-[28px] border"
      style={{
        borderColor: open ? "var(--app-border-strong)" : "rgba(226, 194, 144, 0.24)",
        background: open ? "var(--app-bg-elevated)" : "var(--beer-ink)",
        boxShadow: open ? "var(--app-shadow-1)" : "0 22px 58px rgba(20,28,23,.18)",
      }}
    >
      <div id={EXPLORER_ID} hidden={!open} className="space-y-5 p-4 sm:p-5">
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
            className="tap-44-y inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
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

      <div hidden={open} className="grid gap-7 p-6 sm:grid-cols-[1fr_auto] sm:items-end sm:p-9">
        <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-white/42">
              The complete index
            </p>
            <h2
              id="all-beer-heading"
              className="mt-3 max-w-[11ch] font-serif text-[clamp(2.1rem,5vw,3.5rem)] font-semibold leading-[0.94] tracking-[-0.035em] text-[#f7f0e4]"
            >
              Know exactly what you want?
            </h2>
            <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-white/52">
              Open the full index only when you need it. Search all {beerCount} beers by name, style, brewery, town, strength, or distance.
            </p>
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
          className="tap-44-y group inline-flex w-full items-center justify-center gap-3 rounded-full px-5 py-3 text-[13px] font-semibold sm:w-auto"
          style={{ background: "#f4efe4", color: "var(--beer-ink)" }}
        >
          <Search className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Open the full index
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </section>
  );
}

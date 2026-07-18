"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronUp, Search } from "lucide-react";
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
        borderColor: "rgba(51,35,20,.15)",
        background: open ? "var(--app-bg-elevated-solid)" : "rgba(247,240,228,.68)",
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

      <div hidden={open} className="grid gap-5 p-5 text-[#281e14] sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
        <div className="flex gap-3.5">
          <span aria-hidden className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#85501f]/30 text-[#85501f]">
            <Search className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#85501f]">
              Full beer catalog
            </p>
            <h2
              id="all-beer-heading"
              className="mt-1.5 text-[18px] font-semibold"
            >
              Search all {beerCount} signature beers
            </h2>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-black/65">
              Search by beer name, style, brewery, or town.
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
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#382517] bg-[#382517] px-5 text-[12px] font-bold text-[#fffaf2] transition hover:bg-[#24170f] sm:w-auto"
        >
          <Search className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Open beer search
        </button>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronUp, Search, SlidersHorizontal } from "lucide-react";
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
      className="scroll-mt-24 overflow-hidden rounded-[var(--app-radius-xl)] border"
      style={{
        borderColor: "var(--app-border-strong)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 10%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 58%, color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated)) 100%)",
        boxShadow: "var(--app-shadow-1), var(--app-hi)",
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

      <div hidden={open} className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div className="flex gap-3.5">
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-accent) 18%, transparent)",
              color: "var(--app-accent-press)",
            }}
          >
            <SlidersHorizontal className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Looking for something specific?
            </p>
            <h2
              id="all-beer-heading"
              className="mt-1 font-serif text-[22px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              The complete beer explorer
            </h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
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
          className="tactile tactile-interactive tap-44-y inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white sm:w-auto"
          style={{ background: "var(--app-brand)", boxShadow: "var(--app-shadow-1)" }}
        >
          <Search className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Search all {beerCount} beers
        </button>
      </div>
    </section>
  );
}

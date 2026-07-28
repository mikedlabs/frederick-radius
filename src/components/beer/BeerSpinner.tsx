"use client";

import Link from "next/link";
import { ArrowRight, Beer as BeerIcon, RefreshCw, Store } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ALL_BEERS,
  BREWERIES,
  FAMILY_BY_KEY,
  type BeerWithBrewery,
  type Brewery,
} from "@/data/beers";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { buildSpinSequence } from "@/lib/beer/spinner";

type SpinMode = "beer" | "brewery";

const MODES: ReadonlyArray<{
  key: SpinMode;
  label: string;
  Icon: typeof BeerIcon;
}> = [
  { key: "beer", label: "A beer", Icon: BeerIcon },
  { key: "brewery", label: "A brewery", Icon: Store },
];

const FRAME_DELAYS = [0, 70, 145, 225, 315, 420, 545, 695, 875, 1_080] as const;

function townName(slug: string): string {
  return MUNICIPALITY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ");
}

function resultAnnouncement(mode: SpinMode, item: BeerWithBrewery | Brewery): string {
  return mode === "beer"
    ? `Your beer pick is ${item.name} by ${(item as BeerWithBrewery).breweryName}.`
    : `Your brewery pick is ${item.name} in ${townName((item as Brewery).town)}.`;
}

/**
 * A restrained random picker for indecisive beer drinkers. The reel uses the
 * stored signature-beer catalog only; it never implies that a selected beer is
 * currently pouring.
 */
export default function BeerSpinner() {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<SpinMode>("beer");
  const [selectedByMode, setSelectedByMode] = useState<Record<SpinMode, number | null>>({
    beer: null,
    brewery: null,
  });
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const runRef = useRef(0);
  const lastIndexRef = useRef<Record<SpinMode, number | null>>({
    beer: null,
    brewery: null,
  });

  useEffect(() => {
    return () => {
      runRef.current += 1;
    };
  }, []);

  const items = mode === "beer" ? ALL_BEERS : BREWERIES;
  const displayIndex = previewIndex ?? selectedByMode[mode];
  const displayItem = displayIndex == null ? null : items[displayIndex];

  function chooseMode(nextMode: SpinMode) {
    if (nextMode === mode) return;
    runRef.current += 1;
    setMode(nextMode);
    setPreviewIndex(null);
    setSpinning(false);
    setAnnouncement("");
  }

  function spin() {
    const activeMode = mode;
    const activeItems = activeMode === "beer" ? ALL_BEERS : BREWERIES;
    const previewRandomValues = reduceMotion
      ? []
      : Array.from({ length: FRAME_DELAYS.length - 1 }, () => Math.random());
    const sequence = buildSpinSequence(
      activeItems.length,
      lastIndexRef.current[activeMode],
      previewRandomValues,
      Math.random(),
    );
    if (sequence.length === 0) return;

    const run = runRef.current + 1;
    runRef.current = run;
    setAnnouncement("");
    setSpinning(true);

    sequence.forEach((index, frame) => {
      const delay = reduceMotion ? 0 : FRAME_DELAYS[frame] ?? FRAME_DELAYS.at(-1) ?? 0;
      window.setTimeout(() => {
        if (runRef.current !== run) return;
        setPreviewIndex(index);

        if (frame !== sequence.length - 1) return;

        const item = activeItems[index];
        lastIndexRef.current[activeMode] = index;
        setSelectedByMode((current) => ({ ...current, [activeMode]: index }));
        setPreviewIndex(null);
        setSpinning(false);
        setAnnouncement(resultAnnouncement(activeMode, item));
      }, delay);
    });
  }

  return (
    <section
      id="find-your-pour"
      aria-labelledby="beer-spinner-heading"
      className="relative scroll-mt-24 overflow-hidden rounded-[var(--app-radius-lg)] border border-t-[3px] bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-elev-1)]"
      style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-amber-text)" }}
    >
      <div className="p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <p
              className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]"
              style={{ color: "var(--app-amber-text)" }}
            >
              Random pick
            </p>
            <h2
              id="beer-spinner-heading"
              className="mt-1 font-sans text-[24px] font-semibold leading-tight tracking-[-0.035em] sm:text-[28px]"
              style={{ color: "var(--app-ink)" }}
            >
              Leave the next one to chance.
            </h2>
            <p className="mt-1.5 max-w-[34rem] text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              The reel can choose a signature beer or a Frederick County brewery.
            </p>
          </div>

          <div
            role="group"
            aria-label="Choose what to spin for"
            className="grid grid-cols-2 overflow-hidden rounded-full border p-0.5"
            style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg)" }}
          >
            {MODES.map(({ key, label, Icon }) => {
              const selected = key === mode;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseMode(key)}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-[11.5px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                  style={{
                    color: selected ? "var(--app-bg)" : "var(--app-ink-2)",
                    background: selected ? "var(--app-ink)" : "transparent",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
          <div
            aria-busy={spinning}
            className="relative min-h-[124px] overflow-hidden rounded-[var(--app-radius-md)] border px-4 py-4"
            style={{
              borderColor: "var(--app-border)",
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--app-amber) 7%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 62%)",
            }}
          >
            {displayItem ? (
              <motion.div
                key={`${mode}-${displayIndex}`}
                initial={reduceMotion ? false : { opacity: 0.35, y: spinning ? 12 : 6, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: spinning ? 0.08 : 0.2, ease: "easeOut" }}
                className="relative"
              >
                {spinning ? (
                  <p className="flex min-h-[88px] items-center font-sans text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
                    {displayItem.name}
                  </p>
                ) : mode === "beer" ? (
                  <BeerResult beer={displayItem as BeerWithBrewery} />
                ) : (
                  <BreweryResult brewery={displayItem as Brewery} />
                )}
              </motion.div>
            ) : (
              <div className="relative flex min-h-[88px] items-center">
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                  Your pick will appear here.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={spin}
            disabled={spinning}
            className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-5 text-[13px] font-semibold outline-none transition hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-75 sm:min-w-[154px]"
            style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}
          >
            <RefreshCw
              className={`h-4 w-4${spinning && !reduceMotion ? " animate-spin" : " transition-transform group-hover:rotate-45"}`}
              strokeWidth={2.2}
              aria-hidden
            />
            {spinning ? "Choosing…" : `Spin for ${mode === "beer" ? "a beer" : "a brewery"}`}
          </button>
        </div>

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </div>
    </section>
  );
}

function BeerResult({ beer }: { beer: BeerWithBrewery }) {
  const family = FAMILY_BY_KEY[beer.family];
  return (
    <div>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
        {beer.style}
        {beer.abv != null ? ` · ${beer.abv.toFixed(1)}% ABV` : ""}
      </p>
      <h3 className="mt-1.5 font-sans text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
        {beer.name}
      </h3>
      <p className="mt-0.5 text-[11px] font-semibold" style={{ color: family.deep }}>
        {beer.breweryName}
      </p>
      <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {beer.notes}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-1.5" style={{ borderColor: "var(--app-border)" }}>
        <p className="text-[9.5px]" style={{ color: "var(--app-ink-3)" }}>
          This is a catalog pick. Check the current tap list.
        </p>
        <Link
          href={`/places/${beer.brewerySlug}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold text-[var(--app-brand-press)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          Open brewery guide
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function BreweryResult({ brewery }: { brewery: Brewery }) {
  return (
    <div>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
        {townName(brewery.town)}
      </p>
      <h3 className="mt-1.5 font-sans text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
        {brewery.name}
      </h3>
      <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {brewery.focus}
      </p>
      <div className="mt-2 flex justify-end border-t pt-1.5" style={{ borderColor: "var(--app-border)" }}>
        <Link
          href={`/places/${brewery.slug}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold text-[var(--app-brand-press)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        >
          Open brewery guide
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

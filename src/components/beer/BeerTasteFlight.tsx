"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bookmark, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { BreweryLogo } from "@/components/beer/BreweryLogo";
import {
  ALL_BEERS,
  BREWERY_BY_SLUG,
  FAMILY_BY_KEY,
  beerKey,
  type BeerWithBrewery,
} from "@/data/beers";
import { addSaved, useSavedList } from "@/hooks/useSaved";
import {
  buildTasteFlight,
  tastePathStats,
  TASTE_PATHS,
  TASTE_PATH_BY_KEY,
  type BeerStrength,
  type TastePathKey,
} from "@/lib/beer-experience";

const STRENGTHS: Array<{ key: BeerStrength; label: string; detail: string }> = [
  { key: "easy", label: "Easy", detail: "Up to 5.5%" },
  { key: "any", label: "Open", detail: "Any strength" },
  { key: "bold", label: "Bold", detail: "8% and up" },
];

const STATS = Object.fromEntries(
  TASTE_PATHS.map((path) => [path.key, tastePathStats(ALL_BEERS, path.key)]),
) as Record<TastePathKey, { beers: number; breweries: number }>;

export default function BeerTasteFlight() {
  const [pathKey, setPathKey] = useState<TastePathKey>("hoppy");
  const [strength, setStrength] = useState<BeerStrength>("any");
  const savedList = useSavedList();
  const savedKeys = useMemo(
    () => new Set(savedList.filter((item) => item.type === "beer").map((item) => item.id)),
    [savedList],
  );
  const flight = useMemo(
    () => buildTasteFlight(ALL_BEERS, pathKey, strength),
    [pathKey, strength],
  );
  const path = TASTE_PATH_BY_KEY[pathKey];
  const allSaved = flight.length > 0 && flight.every((beer) => savedKeys.has(beerKey(beer)));

  function saveFlight() {
    for (const beer of flight) addSaved("beer", beerKey(beer));
  }

  return (
    <section
      id="find-your-pour"
      aria-labelledby="shortlist-heading"
      className="scroll-mt-24 overflow-hidden rounded-[30px] border bg-[var(--beer-ink)] text-white shadow-[0_28px_72px_rgba(20,28,23,0.18)]"
      style={{ borderColor: "rgba(226, 194, 144, 0.22)" }}
    >
      <div className="border-b border-white/12 px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--beer-copper-light)]">The taste matcher</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 id="shortlist-heading" className="max-w-[12ch] font-serif text-[clamp(2.5rem,6vw,4.9rem)] font-semibold leading-[0.92] tracking-[-0.045em] text-[#f7f0e4]">
              Tell us what sounds good.
            </h2>
            <p className="mt-4 max-w-[42rem] text-[13px] leading-relaxed text-white/58 sm:text-[15px]">
              Pick a flavor and a strength. Radius builds a focused three-pour flight from three different Frederick County breweries.
            </p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">Signature pours · not a live tap list</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[310px_minmax(0,1fr)]">
        <div className="border-b border-white/12 p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
          <p className="px-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/38">01 · Choose a profile</p>
          <div role="group" aria-label="Choose a beer taste" className="mt-3 -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {TASTE_PATHS.map((taste, index) => {
              const selected = taste.key === pathKey;
              const stats = STATS[taste.key];
              return (
                <button
                  key={taste.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPathKey(taste.key)}
                  className="group min-w-[220px] snap-start border px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--beer-copper-light)] lg:grid lg:min-w-0 lg:grid-cols-[22px_1fr_auto] lg:items-center lg:gap-2 lg:border-x-0 lg:border-b-0 lg:border-t lg:px-2 lg:py-4"
                  style={{
                    borderColor: selected ? "rgba(233,189,125,.44)" : "rgba(255,255,255,.10)",
                    background: selected ? "rgba(233,189,125,.10)" : "transparent",
                    color: selected ? "#f7f0e4" : "rgba(255,255,255,.58)",
                  }}
                >
                  <span className="hidden font-mono text-[9px] tabular-nums opacity-45 lg:block">0{index + 1}</span>
                  <span>
                    <span className="block text-[14px] font-semibold">{taste.label}</span>
                    <span className="mt-1 block text-[10px] leading-snug opacity-58">{taste.description}</span>
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-2 lg:mt-0 lg:block lg:text-right">
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] opacity-45">{stats.beers} pours</span>
                    <ArrowRight className={`h-3.5 w-3.5 text-[var(--beer-copper-light)] transition-opacity lg:ml-auto lg:mt-1 ${selected ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-white/12 pt-5">
            <p className="px-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/38">02 · Pick a strength</p>
            <div role="group" aria-label="Choose beer strength" className="mt-3 grid grid-cols-3 gap-1 rounded-[14px] bg-white/6 p-1">
              {STRENGTHS.map((option) => {
                const selected = option.key === strength;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStrength(option.key)}
                    className="tap-44 rounded-[10px] px-2 py-2.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--beer-copper-light)]"
                    style={{ background: selected ? "#f4efe4" : "transparent", color: selected ? "var(--beer-ink)" : "rgba(255,255,255,.5)" }}
                  >
                    <span className="block text-[11px] font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-[8px] leading-tight opacity-65">{option.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-7 lg:p-8">
          <p className="sr-only" aria-live="polite">{flight.length} {path.label.toLowerCase()} signature {flight.length === 1 ? "pour" : "pours"} selected.</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/38">03 · Your flight</p>
              <h3 className="mt-2 font-serif text-[30px] font-semibold leading-none text-[#f7f0e4]">{path.shortLabel}, three ways.</h3>
              <p className="mt-2 text-[11px] text-white/45">One signature pour per brewery, ranked for a useful first look.</p>
            </div>
            <button
              type="button"
              onClick={saveFlight}
              disabled={flight.length === 0 || allSaved}
              className="tap-44-y inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-semibold disabled:opacity-65"
              style={{ borderColor: allSaved ? "rgba(134,190,152,.55)" : "rgba(255,255,255,.20)", color: allSaved ? "#a7d4b5" : "#f7f0e4" }}
            >
              {allSaved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}
              {allSaved ? "Flight saved" : "Save this flight"}
            </button>
          </div>

          {flight.length > 0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {flight.map((beer, index) => (
                <PourCard key={beerKey(beer)} beer={beer} index={index} saved={savedKeys.has(beerKey(beer))} />
              ))}
            </div>
          ) : (
            <div className="mt-6 border border-dashed border-white/20 px-5 py-12 text-center">
              <p className="font-serif text-[22px] text-[#f7f0e4]">Nothing in that lane.</p>
              <button type="button" onClick={() => setStrength("any")} className="tap-44 mt-2 text-[12px] font-semibold text-[var(--beer-copper-light)] underline underline-offset-4">Open the strength range</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PourCard({ beer, index, saved }: { beer: BeerWithBrewery; index: number; saved: boolean }) {
  const family = FAMILY_BY_KEY[beer.family];
  const brewery = BREWERY_BY_SLUG[beer.brewerySlug];
  const untappdUrl = beer.untappd ?? brewery?.untappd;
  const key = beerKey(beer);

  return (
    <article className="group flex min-h-[360px] flex-col overflow-hidden rounded-[20px] bg-[#f4efe4] text-[var(--beer-ink)] shadow-[0_14px_36px_rgba(0,0,0,.18)]">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <span className="font-serif text-[38px] leading-none text-[var(--beer-ink)]/20">0{index + 1}</span>
        <BreweryLogo brewerySlug={beer.brewerySlug} breweryName={beer.breweryName} decorative sizes="48px" className="h-12 w-12 rounded-[11px] bg-white object-contain p-1.5 shadow-sm" />
      </div>
      <div className="mx-4 h-1 rounded-full" style={{ background: `linear-gradient(90deg, ${family.base}, ${family.deep})` }} />
      <div className="flex flex-1 flex-col p-4 pt-5">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--beer-ink)]/45">{family.label}</p>
        <h4 className="mt-2 font-serif text-[24px] font-semibold leading-[0.98] tracking-[-0.025em]">{beer.name}</h4>
        <p className="mt-3 line-clamp-4 text-[11px] leading-relaxed text-[var(--beer-ink)]/62">{beer.notes}</p>

        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between gap-3 border-t border-[var(--beer-ink)]/12 pt-3">
            <Link href={`/places/${beer.brewerySlug}`} className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]">
              <span className="block truncate text-[11px] font-semibold">{beer.breweryName}</span>
              <span className="mt-0.5 block truncate text-[9px] text-[var(--beer-ink)]/45">{beer.style}</span>
            </Link>
            {beer.abv != null ? <span className="font-serif text-[24px] leading-none tabular-nums">{beer.abv.toFixed(1)}<span className="text-[10px]">%</span></span> : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            {untappdUrl ? (
              <a href={untappdUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--beer-ink)]/48 hover:text-[var(--beer-ink)]">
                Untappd <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
            ) : <span />}
            <button
              type="button"
              onClick={() => addSaved("beer", key)}
              disabled={saved}
              aria-label={saved ? `${beer.name} is saved to My taps` : `Save ${beer.name} to My taps`}
              className="tap-44 inline-flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-70"
              style={{ borderColor: saved ? family.deep : "rgba(16,23,19,.22)", background: saved ? family.deep : "transparent", color: saved ? "white" : "var(--beer-ink)" }}
            >
              {saved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

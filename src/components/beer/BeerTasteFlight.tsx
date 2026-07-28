"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Check } from "lucide-react";
import { useMemo, useState } from "react";
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

const STRENGTHS: Array<{ key: BeerStrength; label: string }> = [
  { key: "easy", label: "Up to 5.5%" },
  { key: "any", label: "Any ABV" },
  { key: "bold", label: "8%+" },
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
  const flight = useMemo(() => buildTasteFlight(ALL_BEERS, pathKey, strength), [pathKey, strength]);
  const path = TASTE_PATH_BY_KEY[pathKey];
  const allSaved = flight.length > 0 && flight.every((beer) => savedKeys.has(beerKey(beer)));

  function saveFlight() {
    for (const beer of flight) addSaved("beer", beerKey(beer));
  }

  return (
    <section aria-labelledby="flight-heading">
      <header className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>Beer finder</p>
          <h2 id="flight-heading" className="mt-1 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]" style={{ color: "var(--app-ink)" }}>Match a beer to your taste.</h2>
          <p className="mt-2 max-w-[38rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>Choose a flavor and strength to see a short list from different Frederick County breweries.</p>
        </div>
        <div role="group" aria-label="Choose beer strength" className="grid grid-cols-3 border-y" style={{ borderColor: "var(--app-border-strong)" }}>
          {STRENGTHS.map((option) => (
            <button key={option.key} type="button" aria-pressed={option.key === strength} onClick={() => setStrength(option.key)} className="min-h-11 border-r px-3 text-[10px] font-semibold last:border-r-0" style={{ borderColor: "var(--app-border)", color: option.key === strength ? "var(--app-ink)" : "var(--app-ink-3)", background: option.key === strength ? "color-mix(in srgb, var(--app-amber) 10%, transparent)" : "transparent", boxShadow: option.key === strength ? "inset 0 -2px 0 var(--app-amber-text)" : undefined }}>{option.label}</button>
          ))}
        </div>
      </header>

      <div
        role="group"
        aria-label="Choose a beer taste"
        className="mt-5 grid grid-cols-2 border-l border-t sm:grid-cols-5"
        style={{ borderColor: "var(--app-border)" }}
      >
        {TASTE_PATHS.map((taste, index) => {
          const selected = taste.key === pathKey;
          const fillsLastMobileRow = index === TASTE_PATHS.length - 1 && TASTE_PATHS.length % 2 === 1;
          return (
            <button key={taste.key} type="button" aria-pressed={selected} onClick={() => setPathKey(taste.key)} className={`min-h-[68px] border-b border-r px-3 py-2.5 text-left${fillsLastMobileRow ? " col-span-2 sm:col-span-1" : ""}`} style={{ borderColor: selected ? "color-mix(in srgb, var(--app-amber-text) 54%, var(--app-border))" : "var(--app-border)", background: selected ? "color-mix(in srgb, var(--app-amber) 8%, transparent)" : "transparent", color: "var(--app-ink)", boxShadow: selected ? "inset 0 -3px 0 var(--app-amber-text)" : undefined }}>
              <span className="block text-[12px] font-semibold">{taste.label}</span>
              <span className="mt-1 block text-[9px] text-black/65">{STATS[taste.key].beers} signature beers</span>
            </button>
          );
        })}
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {path.shortLabel}: {flight.length} signature {flight.length === 1 ? "beer" : "beers"} match the selected strength.
      </p>

      <div className="mt-6 flex items-end justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>{path.shortLabel} picks</p>
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>{flight.length} signature beers from {flight.length} breweries</p>
        </div>
        <button type="button" onClick={saveFlight} disabled={flight.length === 0 || allSaved} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] border px-3 text-[11.5px] font-semibold disabled:opacity-60" style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}>
          {allSaved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}{allSaved ? "Saved" : "Save flight"}
        </button>
      </div>

      {flight.length > 0 ? (
        <ol className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {flight.map((beer, index) => <PourCard key={beerKey(beer)} beer={beer} index={index} saved={savedKeys.has(beerKey(beer))} pathKey={pathKey} />)}
        </ol>
      ) : (
        <div className="mt-3 border-y py-6 text-center" style={{ borderColor: "var(--app-border)" }}><p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>No pours fit that strength.</p><button type="button" onClick={() => setStrength("any")} className="mt-2 inline-flex min-h-11 items-center text-[12px] font-semibold underline" style={{ color: "var(--app-brand-press)" }}>Show any ABV</button></div>
      )}
      <p className="mt-3 text-[10px]" style={{ color: "var(--app-ink-3)" }}>These are signature beers, not a live tap list. Check availability with the brewery.</p>
    </section>
  );
}

function PourCard({ beer, index, saved, pathKey }: { beer: BeerWithBrewery; index: number; saved: boolean; pathKey: TastePathKey }) {
  const family = FAMILY_BY_KEY[beer.family];
  const brewery = BREWERY_BY_SLUG[beer.brewerySlug];
  const untappdUrl = beer.untappd ?? brewery?.untappd;
  const key = beerKey(beer);
  const visualLabel = pathKey === "old-world" && beer.family === "wheat-hazy" ? "Traditional wheat" : pathKey === "hoppy" && beer.family === "wheat-hazy" ? "Hazy IPA" : family.label;
  return (
    <li
      className="relative grid min-h-[132px] grid-cols-[minmax(0,1fr)_56px] overflow-hidden border-b border-t-[3px] bg-transparent"
      style={{ borderBottomColor: "var(--app-border)", borderTopColor: family.base }}
    >
      <div className="min-w-0 p-3.5">
        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--app-ink-3)]">0{index + 1} · {visualLabel}{beer.abv != null ? ` · ${beer.abv.toFixed(1)}%` : ""}</p>
        <h3 className="mt-1.5 truncate text-[14px] font-bold text-[var(--app-ink)]">{beer.name}</h3>
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--app-ink-3)]">{beer.notes}</p>
        <Link href={`/places/${beer.brewerySlug}`} className="mt-1 inline-flex min-h-11 max-w-full items-center text-[10px] font-semibold text-[var(--app-ink-2)] hover:underline">
          <span className="truncate">{beer.breweryName}</span>
        </Link>
        {untappdUrl ? <a href={untappdUrl} target="_blank" rel="noreferrer" aria-label={`Open ${beer.name} by ${beer.breweryName} on Untappd`} className="ml-2 inline-flex min-h-11 items-center gap-1 text-[9px] text-[var(--app-ink-3)] hover:text-[var(--app-ink-2)]">Untappd <ArrowUpRight className="h-3 w-3" aria-hidden /></a> : null}
      </div>

      <button type="button" onClick={() => addSaved("beer", key)} disabled={saved} aria-label={saved ? `${beer.name} is saved to My taps` : `Save ${beer.name} to My taps`} className="m-1.5 grid h-11 w-11 place-items-center self-start rounded-[var(--app-radius-sm)] border text-[var(--app-ink-3)] disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
        {saved ? <Check className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
      </button>
    </li>
  );
}

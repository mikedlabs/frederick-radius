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
import { BreweryPhoto, type BreweryPhotoMap } from "./BreweryPhoto";
import { BreweryLogo } from "./BreweryLogo";
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

export default function BeerTasteFlight({ photos }: { photos: BreweryPhotoMap }) {
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
    <section id="find-your-pour" aria-labelledby="flight-heading" className="scroll-mt-24">
      <header className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>Match by taste</p>
          <h2 id="flight-heading" className="mt-1 font-serif text-[30px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>What sounds good?</h2>
          <p className="mt-1 max-w-[38rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>Choose a flavor and strength. Radius returns three different breweries instead of fifty beer cards.</p>
        </div>
        <div role="group" aria-label="Choose beer strength" className="flex border-b" style={{ borderColor: "var(--app-border-strong)" }}>
          {STRENGTHS.map((option) => (
            <button key={option.key} type="button" aria-pressed={option.key === strength} onClick={() => setStrength(option.key)} className="min-h-11 px-3 text-[11px] font-semibold" style={{ color: option.key === strength ? "var(--app-ink)" : "var(--app-ink-3)", borderBottom: option.key === strength ? "2px solid var(--app-ink)" : "2px solid transparent" }}>{option.label}</button>
          ))}
        </div>
      </header>

      <div
        role="group"
        aria-label="Choose a beer taste"
        className="-mx-4 mt-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-0 sm:overflow-visible sm:border-y sm:px-0 sm:pb-0"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        {TASTE_PATHS.map((taste, index) => {
          const selected = taste.key === pathKey;
          return (
            <button key={taste.key} type="button" aria-pressed={selected} onClick={() => setPathKey(taste.key)} className="min-h-[96px] w-[72vw] max-w-[230px] shrink-0 snap-start rounded-[var(--app-radius-md)] border px-3 py-3 text-left sm:w-auto sm:max-w-none sm:rounded-none sm:border-0 sm:border-r sm:last:border-r-0" style={{ borderColor: "var(--app-border)", background: selected ? "var(--app-ink)" : "var(--app-bg-elevated)", color: selected ? "var(--app-bg)" : "var(--app-ink)" }}>
              <span className="flex justify-between gap-2 font-mono text-[9px] opacity-50"><span>0{index + 1}</span><span>{STATS[taste.key].beers} pours</span></span>
              <span className="mt-2 block text-[13px] font-semibold">{taste.label}</span>
              <span className="mt-1 block line-clamp-2 text-[10px] leading-snug opacity-65">{taste.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[16px] font-semibold" style={{ color: "var(--app-ink)" }}>Your {path.shortLabel.toLowerCase()} flight</p>
          <p className="text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>{flight.length} signature pours · {flight.length} breweries</p>
        </div>
        <button type="button" onClick={saveFlight} disabled={flight.length === 0 || allSaved} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold disabled:opacity-60" style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}>
          {allSaved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}{allSaved ? "Saved" : "Save flight"}
        </button>
      </div>

      {flight.length > 0 ? (
        <ol className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {flight.map((beer, index) => <PourCard key={beerKey(beer)} beer={beer} index={index} saved={savedKeys.has(beerKey(beer))} pathKey={pathKey} photo={photos[beer.brewerySlug]} />)}
        </ol>
      ) : (
        <div className="mt-3 border-y py-6 text-center" style={{ borderColor: "var(--app-border)" }}><p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>No pours fit that strength.</p><button type="button" onClick={() => setStrength("any")} className="mt-2 inline-flex min-h-11 items-center text-[12px] font-semibold underline" style={{ color: "var(--app-brand-press)" }}>Show any ABV</button></div>
      )}
      <p className="mt-2 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>Signature-pour snapshot, not a live tap list. Check availability with the brewery.</p>
    </section>
  );
}

function PourCard({ beer, index, saved, pathKey, photo }: { beer: BeerWithBrewery; index: number; saved: boolean; pathKey: TastePathKey; photo?: string | null }) {
  const family = FAMILY_BY_KEY[beer.family];
  const brewery = BREWERY_BY_SLUG[beer.brewerySlug];
  const untappdUrl = beer.untappd ?? brewery?.untappd;
  const key = beerKey(beer);
  const visualLabel = pathKey === "old-world" && beer.family === "wheat-hazy" ? "Traditional wheat" : pathKey === "hoppy" && beer.family === "wheat-hazy" ? "Hazy IPA" : family.label;
  return (
    <li
      className="group relative flex min-h-[330px] w-[82vw] max-w-[310px] shrink-0 snap-center flex-col overflow-hidden border border-white/12 p-4 text-white shadow-[0_20px_42px_-24px_rgba(24,16,8,.7)] sm:w-auto sm:max-w-none"
      style={{ background: `linear-gradient(155deg, ${family.base}, ${family.deep} 62%, #24160f 115%)` }}
    >
      <div className="absolute inset-0" aria-hidden>
        <BreweryPhoto
          brewerySlug={beer.brewerySlug}
          breweryName={beer.breweryName}
          src={photo}
          decorative
          sizes="(max-width: 640px) 82vw, 33vw"
          className="h-full w-full"
          imageClassName="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]"
        />
      </div>
      <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(12,9,6,.08) 0%, color-mix(in srgb, ${family.deep} 82%, rgba(15,11,8,.94)) 58%, #120e0b 100%)` }} aria-hidden />

      <div className="relative flex items-start justify-between gap-3">
        <span className="flex items-center gap-2">
          <BreweryLogo brewerySlug={beer.brewerySlug} breweryName={beer.breweryName} decorative sizes="42px" className="h-10 w-10 bg-[#f7f0e4] object-contain p-1 shadow-[0_10px_24px_rgba(0,0,0,.34)]" />
          <span className="font-serif text-[30px] leading-none text-white/48">0{index + 1}</span>
        </span>
        <button type="button" onClick={() => addSaved("beer", key)} disabled={saved} aria-label={saved ? `${beer.name} is saved to My taps` : `Save ${beer.name} to My taps`} className="grid h-11 w-11 place-items-center border border-white/25 bg-black/10 text-white backdrop-blur-sm disabled:opacity-60">
          {saved ? <Check className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      <div className="relative mt-auto">
        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/58">{visualLabel}{beer.abv != null ? ` · ${beer.abv.toFixed(1)}%` : ""}</p>
        <h3 className="mt-2 max-w-[9ch] font-serif text-[31px] font-semibold leading-[0.9] tracking-[-0.035em]">{beer.name}</h3>
        <p className="mt-3 line-clamp-2 text-[11.5px] leading-relaxed text-white/68">{beer.notes}</p>

        <div className="mt-5 flex items-center gap-2 border-t border-white/16 pt-3">
          <BreweryLogo brewerySlug={beer.brewerySlug} breweryName={beer.breweryName} decorative sizes="32px" className="h-8 w-8 bg-white object-contain p-0.5" />
          <Link href={`/places/${beer.brewerySlug}`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-[10.5px] font-semibold hover:underline">
            <span className="block truncate">{beer.breweryName}</span>
            <span className="block truncate font-normal text-white/50">{beer.style}{beer.rating != null ? ` · ★ ${beer.rating.toFixed(2)}` : ""}</span>
          </Link>
          {untappdUrl ? <a href={untappdUrl} target="_blank" rel="noreferrer" aria-label={`Check ${beer.name} on Untappd`} className="grid h-11 w-11 shrink-0 place-items-center border border-white/20 text-white/70 transition hover:text-white"><ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a> : null}
        </div>
      </div>
    </li>
  );
}

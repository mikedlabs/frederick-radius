"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Check, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { BeerGlassArt } from "@/components/beer/BeerGlassArt";
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

const GLASS_VARIANTS = ["pint", "tulip", "pilsner", "snifter", "tulip"] as const;

const STRENGTHS: Array<{ key: BeerStrength; label: string; detail: string }> = [
  { key: "easy", label: "Up to 5.5%", detail: "Lighter strength" },
  { key: "any", label: "Any ABV", detail: "Show the range" },
  { key: "bold", label: "8%+", detail: "Higher strength" },
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
    <section id="find-your-pour" aria-labelledby="flight-heading" className="scroll-mt-24 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[38rem]">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Pick by taste
          </p>
          <h2
            id="flight-heading"
            className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Build a Frederick flight
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Pick a flavor and ABV range. We&rsquo;ll match up to three beers from different breweries.
          </p>
        </div>
        <div
          aria-hidden
          className="hidden items-center gap-2 rounded-full border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] sm:flex"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--app-accent-press)" }} />
          Taste first, list later
        </div>
      </div>

      <div
        role="group"
        aria-label="Choose a beer taste"
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0"
      >
        {TASTE_PATHS.map((taste, index) => {
          const selected = taste.key === pathKey;
          const stats = STATS[taste.key];
          return (
            <button
              key={taste.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setPathKey(taste.key)}
              className="tap-44 group relative min-h-[174px] w-[72vw] max-w-[230px] shrink-0 snap-start overflow-hidden rounded-[22px] border p-3 text-left transition-[transform,border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto sm:min-w-0"
              style={{
                borderColor: selected ? taste.colors[1] : "var(--app-border)",
                background: selected
                  ? `linear-gradient(150deg, color-mix(in srgb, ${taste.colors[1]} 84%, #111), ${taste.colors[1]})`
                  : "var(--app-bg-elevated)",
                boxShadow: selected ? "0 12px 30px color-mix(in srgb, var(--app-ink) 20%, transparent)" : "var(--app-shadow-1)",
                color: selected ? "#fffaf0" : "var(--app-ink)",
                transform: selected ? "translateY(-3px)" : undefined,
              }}
            >
              <span className="flex items-start justify-between gap-2">
                <BeerGlassArt
                  family={taste.families[0]}
                  variant={GLASS_VARIANTS[index]}
                  className="h-16 w-12 drop-shadow-sm"
                />
                <span
                  className="rounded-full border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    borderColor: selected ? "rgba(255,255,255,.35)" : "var(--app-border)",
                    background: selected ? "rgba(255,255,255,.12)" : "var(--app-bg-sunken)",
                  }}
                >
                  {stats.beers} pours
                </span>
              </span>
              <span className="mt-2 block font-serif text-[18px] font-semibold leading-tight">
                {taste.label}
              </span>
              <span
                className="mt-1.5 block text-[11px] leading-snug"
                style={{ color: selected ? "rgba(255,250,240,.82)" : "var(--app-ink-3)" }}
              >
                {taste.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-[var(--app-radius-lg)] border p-2 sm:flex-row sm:items-center" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
        <p className="px-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          ABV range
        </p>
        <div role="group" aria-label="Choose beer strength" className="grid flex-1 grid-cols-3 gap-1.5">
          {STRENGTHS.map((option) => {
            const selected = option.key === strength;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setStrength(option.key)}
                className="tap-44 rounded-[var(--app-radius-md)] border px-2 py-2 text-center"
                style={{
                  borderColor: selected ? "var(--app-ink)" : "transparent",
                  background: selected ? "var(--app-bg-elevated)" : "transparent",
                  boxShadow: selected ? "var(--app-shadow-1)" : undefined,
                  color: selected ? "var(--app-ink)" : "var(--app-ink-3)",
                }}
              >
                <span className="block text-[12px] font-semibold leading-tight">{option.label}</span>
                <span className="mt-0.5 hidden text-[9px] leading-tight sm:block">{option.detail}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <p className="sr-only" aria-live="polite">
          {flight.length} {path.label.toLowerCase()} signature {flight.length === 1 ? "pour" : "pours"} selected. Strength: {STRENGTHS.find((option) => option.key === strength)?.label.toLowerCase()}.
        </p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-serif text-[20px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Your {path.shortLabel.toLowerCase()} flight
            </p>
            <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {flight.length} signature {flight.length === 1 ? "pour" : "pours"} · {flight.length} different {flight.length === 1 ? "brewery" : "breweries"}
            </p>
          </div>
          <button
            type="button"
            onClick={saveFlight}
            disabled={flight.length === 0 || allSaved}
            className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-semibold disabled:opacity-65"
            style={{
              borderColor: allSaved ? "var(--app-positive)" : "var(--app-border-strong)",
              background: allSaved ? "color-mix(in srgb, var(--app-positive) 10%, var(--app-bg-elevated))" : "var(--app-bg-elevated)",
              color: allSaved ? "var(--app-positive)" : "var(--app-ink)",
            }}
          >
            {allSaved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}
            {allSaved ? "Flight saved" : "Save flight"}
          </button>
        </div>

        {flight.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-12">
            {flight.map((beer, index) => (
              <PourCard
                key={beerKey(beer)}
                beer={beer}
                featured={index === 0}
                saved={savedKeys.has(beerKey(beer))}
                pathKey={pathKey}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--app-radius-lg)] border border-dashed p-6 text-center" style={{ borderColor: "var(--app-border-strong)" }}>
            <p className="font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
              No {path.shortLabel.toLowerCase()} pours fit that strength.
            </p>
            <button type="button" onClick={() => setStrength("any")} className="tap-44 mt-2 text-[13px] font-semibold underline underline-offset-4" style={{ color: "var(--app-brand-press)" }}>
              Show every strength
            </button>
          </div>
        )}

        <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          These are signature pours from our July 2026 guide, not a live tap list. Verify today&rsquo;s availability with the brewery.
        </p>
      </div>
    </section>
  );
}

function PourCard({
  beer,
  featured,
  saved,
  pathKey,
}: {
  beer: BeerWithBrewery;
  featured: boolean;
  saved: boolean;
  pathKey: TastePathKey;
}) {
  const family = FAMILY_BY_KEY[beer.family];
  const brewery = BREWERY_BY_SLUG[beer.brewerySlug];
  const untappdUrl = beer.untappd ?? brewery?.untappd;
  const key = beerKey(beer);
  const visualLabel = pathKey === "old-world" && beer.family === "wheat-hazy"
    ? "Traditional wheat"
    : pathKey === "hoppy" && beer.family === "wheat-hazy"
      ? "Hazy IPA"
      : family.label;

  return (
    <article
      className={`group overflow-hidden rounded-[22px] border ${featured ? "md:col-span-6" : "md:col-span-3"}`}
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-shadow-2)" }}
    >
      <div
        className={`relative overflow-hidden ${featured ? "min-h-[190px]" : "min-h-[150px]"} p-4`}
        style={{ background: `linear-gradient(145deg, ${family.base}, ${family.deep})` }}
      >
        <div aria-hidden className="absolute -right-6 -top-10 h-36 w-36 rounded-full border border-white/15" />
        <div aria-hidden className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full border border-white/10" />
        <div className="relative flex h-full items-end justify-between gap-4">
          <BeerGlassArt
            family={beer.family}
            variant={featured ? "tulip" : "pint"}
            ink="#FBF3E2"
            className={featured ? "h-36 w-24" : "h-28 w-20"}
          />
          <div className="pb-1 text-right text-[#fffaf0]">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{visualLabel}</p>
            {beer.abv != null && (
              <p className={`${featured ? "text-[42px]" : "text-[30px]"} font-serif font-semibold leading-none tabular-nums`}>
                {beer.abv.toFixed(1)}<span className="text-[14px]">%</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
            {featured ? "First pour" : "Also in the flight"}
          </p>
          <h3 className={`${featured ? "text-[24px]" : "text-[19px]"} mt-1 font-serif font-semibold leading-tight tracking-tight`} style={{ color: "var(--app-ink)" }}>
            {beer.name}
          </h3>
          <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {beer.notes}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          <Link href={`/places/${beer.brewerySlug}`} className="min-w-0 text-[12px] font-semibold hover:underline" style={{ color: "var(--app-ink)" }}>
            <span className="block truncate">{beer.breweryName}</span>
            <span className="block truncate text-[10px] font-normal" style={{ color: "var(--app-ink-3)" }}>
              {beer.style}
              {beer.rating != null && (
                <span style={{ color: "var(--app-accent-press)" }}> · ★ {beer.rating.toFixed(2)} Untappd</span>
              )}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => addSaved("beer", key)}
            disabled={saved}
            aria-label={saved ? `${beer.name} is saved to My taps` : `Save ${beer.name} to My taps`}
            className="tap-44 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border disabled:opacity-70"
            style={{
              borderColor: saved ? "var(--app-positive)" : "var(--app-border-strong)",
              background: saved ? "var(--app-positive)" : "transparent",
              color: saved ? "white" : "var(--app-ink-2)",
            }}
          >
            {saved ? <Check className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        {untappdUrl && (
          <a
            href={untappdUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            View on Untappd
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}

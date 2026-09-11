"use client";

import { Bookmark, X } from "lucide-react";
import { useMemo } from "react";
import { useSavedList, useToggleSave, useMounted } from "@/hooks/useSaved";
import { BEER_BY_KEY, FAMILY_BY_KEY, type BeerWithBrewery } from "@/data/beers";
import { BreweryLogo } from "./BreweryLogo";

const prettyTown = (slug: string) =>
  slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * "My taps" — the beers a user saved from the deck (love) or the directory
 * (bookmark). Reads the shared saved store, resolves keys back to beers, and
 * self-hides when empty so it is safe to mount on /beer and the Saved page.
 */
export default function MyTaps({ heading = true }: { heading?: boolean }) {
  const mounted = useMounted();
  const list = useSavedList();

  const beers = useMemo<Array<{ beer: BeerWithBrewery; key: string }>>(() => {
    if (!mounted) return [];
    return list
      .filter((r) => r.type === "beer")
      .sort((a, b) => (b.saved_at || "").localeCompare(a.saved_at || ""))
      .map((r) => ({ beer: BEER_BY_KEY[r.id], key: r.id }))
      .filter((x): x is { beer: BeerWithBrewery; key: string } => Boolean(x.beer));
  }, [list, mounted]);

  if (!mounted || beers.length === 0) return null;

  return (
    <section
      id="my-taps"
      aria-label="Saved pours"
      className="scroll-mt-24 -mx-4 space-y-5 overflow-hidden border-y px-4 py-8 sm:-mx-5 sm:px-8 lg:mx-0 lg:rounded-[var(--app-radius-sm)] lg:border lg:px-10"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-sunken)",
        boxShadow: "0 24px 52px -36px rgba(52,35,20,.4)",
      }}
    >
      {heading && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: "color-mix(in srgb, var(--app-amber-text) 85%, var(--app-ink))" }}><Bookmark className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />Saved beers</p>
            <h2 className="mt-2 font-serif text-[34px] leading-none tracking-[-0.04em] text-[var(--app-ink)]">
              Your saved pours
            </h2>
          </div>
          <span className="border px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-[var(--app-ink-3)]" style={{ borderColor: "var(--app-control-border)" }}>
            {beers.length} {beers.length === 1 ? "pour" : "pours"}
          </span>
        </div>
      )}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        {beers.map(({ beer, key }, index) => (
          <TapRow key={key} beer={beer} savedKey={key} index={index} />
        ))}
      </ul>
    </section>
  );
}

function TapRow({ beer, savedKey, index }: { beer: BeerWithBrewery; savedKey: string; index: number }) {
  const remove = useToggleSave("beer", savedKey);
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <li
      className="group relative flex min-h-[230px] w-[76vw] max-w-[290px] shrink-0 snap-center flex-col overflow-hidden border border-white/14 p-4 text-white"
      style={{ background: `linear-gradient(150deg, ${fam.base}, ${fam.deep} 62%, var(--app-ink))` }}
    >
      {/* The pour's own color IS the card — no gamble on an uncurated brewery
          photo, and it echoes the color mosaic at the top of the page. A soft
          floor keeps the beer name legible over a pale family color. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, transparent, color-mix(in srgb, ${fam.deep} 70%, rgba(14,10,8,.92)) 66%, var(--app-ink))` }} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <span className="flex items-center gap-2">
          <BreweryLogo brewerySlug={beer.brewerySlug} breweryName={beer.breweryName} decorative sizes="42px" className="h-10 w-10 bg-[var(--app-bg-elevated-solid)] object-contain p-1 shadow-[0_10px_22px_rgba(0,0,0,.34)]" />
          <span className="font-data text-[30px] font-light leading-none text-white/46">{String(index + 1).padStart(2, "0")}</span>
        </span>
        <button
          type="button"
          onClick={remove}
          aria-label={`Remove ${beer.name} from saved pours`}
          className="grid h-11 w-11 shrink-0 place-items-center border border-white/24 bg-black/20 text-white/72 backdrop-blur-sm"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      <div className="relative mt-auto min-w-0">
        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/54">{beer.style}{beer.abv != null && ` · ${beer.abv.toFixed(1)}%`}</p>
        <p className="mt-1 max-w-[9ch] font-serif text-[28px] leading-[0.98] tracking-[-0.03em]">
          {beer.name}
        </p>
        <p className="mt-3 truncate text-[10px] text-white/56">
          {beer.breweryName} · {prettyTown(beer.town)}
        </p>
      </div>
    </li>
  );
}

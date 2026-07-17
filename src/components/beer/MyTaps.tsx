"use client";

import { Bookmark, X } from "lucide-react";
import { useMemo } from "react";
import { useSavedList, useToggleSave, useMounted } from "@/hooks/useSaved";
import { BEER_BY_KEY, FAMILY_BY_KEY, type BeerWithBrewery } from "@/data/beers";
import { BreweryLogo } from "./BreweryLogo";
import { BreweryPhoto, type BreweryPhotoMap } from "./BreweryPhoto";

const prettyTown = (slug: string) =>
  slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * "My taps" — the beers a user saved from the deck (love) or the directory
 * (bookmark). Reads the shared saved store, resolves keys back to beers, and
 * self-hides when empty so it is safe to mount on /beer and the Saved page.
 */
export default function MyTaps({ heading = true, photos = {} }: { heading?: boolean; photos?: BreweryPhotoMap }) {
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
      aria-label="My taps"
      className="-mx-4 space-y-5 overflow-hidden border-y border-white/10 px-4 py-8 sm:-mx-5 sm:px-8 lg:mx-0 lg:rounded-[8px] lg:border lg:px-10"
      style={{
        background: "#15130f",
        boxShadow: "0 24px 52px -34px rgba(20,14,8,.7)",
      }}
    >
      {heading && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#e3b65d]"><Bookmark className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />Your bar tab</p>
            <h2 className="mt-2 font-serif text-[34px] font-semibold leading-none tracking-[-0.04em] text-[#f7f0e4]">
              Your saved pours
            </h2>
          </div>
          <span className="border border-white/20 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-white/65">
            {beers.length} {beers.length === 1 ? "pour" : "pours"}
          </span>
        </div>
      )}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        {beers.map(({ beer, key }, index) => (
          <TapRow key={key} beer={beer} savedKey={key} index={index} photo={photos[beer.brewerySlug]} />
        ))}
      </ul>
    </section>
  );
}

function TapRow({ beer, savedKey, index, photo }: { beer: BeerWithBrewery; savedKey: string; index: number; photo?: string | null }) {
  const remove = useToggleSave("beer", savedKey);
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <li
      className="group relative flex min-h-[230px] w-[76vw] max-w-[290px] shrink-0 snap-center flex-col overflow-hidden border border-white/14 p-4 text-white"
      style={{ background: `linear-gradient(145deg, ${fam.base}, ${fam.deep} 68%, #1c1510)` }}
    >
      <div className="absolute inset-0" aria-hidden>
        <BreweryPhoto brewerySlug={beer.brewerySlug} breweryName={beer.breweryName} src={photo} decorative sizes="76vw" className="h-full w-full" imageClassName="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]" />
      </div>
      <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(12,9,6,.08), color-mix(in srgb, ${fam.deep} 82%, rgba(14,10,8,.95)) 60%, #120e0b)` }} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <span className="flex items-center gap-2">
          <BreweryLogo brewerySlug={beer.brewerySlug} breweryName={beer.breweryName} decorative sizes="42px" className="h-10 w-10 bg-[#f7f0e4] object-contain p-1 shadow-[0_10px_22px_rgba(0,0,0,.34)]" />
          <span className="font-serif text-[30px] leading-none text-white/46">{String(index + 1).padStart(2, "0")}</span>
        </span>
        <button
          type="button"
          onClick={remove}
          aria-label={`Remove ${beer.name} from My taps`}
          className="grid h-11 w-11 shrink-0 place-items-center border border-white/24 bg-black/20 text-white/72 backdrop-blur-sm"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      <div className="relative mt-auto min-w-0">
        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/54">{beer.style}{beer.abv != null && ` · ${beer.abv.toFixed(1)}%`}</p>
        <p className="mt-1 max-w-[9ch] font-serif text-[28px] font-semibold leading-[0.9] tracking-[-0.03em]">
          {beer.name}
        </p>
        <p className="mt-3 truncate text-[10px] text-white/56">
          {beer.breweryName} · {prettyTown(beer.town)}
        </p>
      </div>
    </li>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Star } from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";
import { BreweryPhoto } from "@/components/beer/BreweryPhoto";
import { FAMILY_BY_KEY, beerKey, type BeerWithBrewery } from "@/data/beers";
import { useIsSaved, useToggleSave } from "@/hooks/useSaved";
import { haptic } from "@/lib/haptics";

/**
 * BeerSheet — a beer's detail in a bottom sheet, so tapping a pour opens its
 * story in place instead of bouncing straight to Untappd. A family-gradient
 * header carries the name; below it the notes, the brewery (a photo link to its
 * page), and two actions: save to My taps, and open on Untappd when it exists.
 */
export default function BeerSheet({
  beer,
  photo,
  onClose,
}: {
  beer: BeerWithBrewery | null;
  photo?: string | null;
  onClose: () => void;
}) {
  return (
    <BottomDrawer
      open={beer !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={beer?.name ?? "Beer"}
      bareHeader
    >
      {beer && <BeerSheetBody beer={beer} photo={photo} />}
    </BottomDrawer>
  );
}

function BeerSheetBody({ beer, photo }: { beer: BeerWithBrewery; photo?: string | null }) {
  const fam = FAMILY_BY_KEY[beer.family];
  const key = beerKey(beer);
  const saved = useIsSaved("beer", key);
  const toggle = useToggleSave("beer", key);
  const meta = [
    beer.style,
    beer.abv != null ? `${beer.abv.toFixed(1)}%` : null,
    beer.rating != null ? `★ ${beer.rating.toFixed(2)}` : null,
  ].filter(Boolean).join("  ·  ");

  return (
    <div className="px-4 pb-3 text-[#281e14]">
      {/* Family-gradient header band */}
      <div
        className="-mx-4 -mt-1 px-4 pb-4 pt-2"
        style={{ background: `linear-gradient(158deg, ${fam.base}, ${fam.deep})` }}
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">{fam.label}</p>
        <div className="mt-1 flex items-start gap-2">
          <h2 className="min-w-0 flex-1 font-serif text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#fffaf2]">
            {beer.name}
          </h2>
          {beer.flagship && <Star className="mt-1.5 h-4 w-4 shrink-0 text-[#f7d98a]" strokeWidth={2} fill="currentColor" aria-label="Flagship" />}
        </div>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-white/90">{meta}</p>
      </div>

      {beer.notes && (
        <p className="mt-4 text-[14px] leading-relaxed text-[#3a2a17]">{beer.notes}</p>
      )}

      {/* Brewery — a photo link to its canonical page */}
      <Link
        href={`/places/${beer.brewerySlug}`}
        className="mt-4 flex items-center gap-3 rounded-[12px] border border-black/12 bg-[#faf5ea] p-2.5 transition active:scale-[0.99]"
      >
        <BreweryPhoto
          brewerySlug={beer.brewerySlug}
          breweryName={beer.breweryName}
          src={photo}
          decorative
          sizes="56px"
          className="h-14 w-14 shrink-0 rounded-[10px]"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#85501f]">Brewery</span>
          <span className="block truncate font-serif text-[16px] font-semibold text-[#281e14]">{beer.breweryName}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-black/35" strokeWidth={2.25} aria-hidden />
      </Link>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => { toggle(); haptic("light"); }}
          aria-pressed={saved}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition active:scale-[0.98]"
          style={
            saved
              ? { background: "var(--app-brand)", color: "var(--app-on-brand)" }
              : { border: "1px solid rgba(0,0,0,0.15)", background: "#faf5ea", color: "#281e14" }
          }
        >
          <Star className="h-4 w-4" strokeWidth={2.25} fill={saved ? "currentColor" : "none"} aria-hidden />
          {saved ? "Saved to My taps" : "Save to My taps"}
        </button>
        {beer.untappd && (
          <a
            href={beer.untappd}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#382517] text-[13px] font-semibold text-[#fffaf2] transition active:scale-[0.98]"
          >
            Open on Untappd
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

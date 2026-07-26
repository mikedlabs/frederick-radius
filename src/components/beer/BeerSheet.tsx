"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Star } from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";
import { BreweryPhoto } from "@/components/beer/BreweryPhoto";
import { FAMILY_BY_KEY, beerKey, type BeerWithBrewery } from "@/data/beers";
import { useIsSaved, useToggleSave } from "@/hooks/useSaved";
import type { BreweryPhotoAsset } from "@/lib/beer/brewery-media";
import { haptic } from "@/lib/haptics";

/**
 * BeerSheet — a beer's detail in a bottom sheet, so tapping a pour opens its
 * story in place instead of bouncing straight to Untappd. The native brewery
 * detail and save action lead; the third-party reference remains secondary.
 */
export default function BeerSheet({
  beer,
  photo,
  onClose,
}: {
  beer: BeerWithBrewery | null;
  photo?: BreweryPhotoAsset | null;
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

function BeerSheetBody({
  beer,
  photo,
}: {
  beer: BeerWithBrewery;
  photo?: BreweryPhotoAsset | null;
}) {
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
    <div className="px-4 pb-3 text-[var(--app-ink)]">
      {/* Beer-family color remains a data cue, not a dark page theme. */}
      <div
        className="-mx-4 -mt-1 border-y border-l-4 px-4 pb-4 pt-3"
        style={{
          borderColor: "var(--app-border)",
          borderLeftColor: fam.deep,
          background: `color-mix(in srgb, ${fam.base} 12%, var(--app-bg-elevated-solid))`,
        }}
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: fam.deep }}>{fam.label}</p>
        <div className="mt-1 flex items-start gap-2">
          <h2 className="min-w-0 flex-1 font-sans text-[26px] font-semibold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
            {beer.name}
          </h2>
          {beer.flagship && <Star className="mt-1.5 h-4 w-4 shrink-0 text-[var(--app-amber)]" strokeWidth={2} fill="currentColor" aria-label="Flagship" />}
        </div>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--app-ink-2)]">{meta}</p>
      </div>

      {beer.notes && (
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--app-ink-2)]">{beer.notes}</p>
      )}

      {/* Brewery — a photo link to its canonical page */}
      <Link
        href={`/places/${beer.brewerySlug}`}
        className="mt-4 flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] p-2.5 transition active:scale-[0.99]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <BreweryPhoto
          brewerySlug={beer.brewerySlug}
          breweryName={beer.breweryName}
          photo={photo}
          decorative
          sizes="56px"
          className="h-14 w-14 shrink-0 rounded-[10px]"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--app-amber-text)]">Brewery</span>
          <span className="block truncate font-sans text-[16px] font-semibold text-[var(--app-ink)]">{beer.breweryName}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-black/35" strokeWidth={2.25} aria-hidden />
      </Link>

      {/* Actions */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => { toggle(); haptic("light"); }}
          aria-pressed={saved}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition active:scale-[0.98]"
          style={
            saved
              ? { background: "var(--app-brand)", color: "var(--app-on-brand)" }
              : { border: "1px solid var(--app-control-border)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }
          }
        >
          <Star className="h-4 w-4" strokeWidth={2.25} fill={saved ? "currentColor" : "none"} aria-hidden />
          {saved ? "Saved" : "Save this pour"}
        </button>
        {beer.untappd && (
          <a
            href={beer.untappd}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-[11.5px] font-semibold text-[var(--app-ink-2)] transition active:opacity-70"
          >
            View the reference on Untappd
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

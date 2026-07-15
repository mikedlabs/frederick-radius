"use client";

import { Bookmark, X } from "lucide-react";
import { useMemo } from "react";
import { useSavedList, useToggleSave, useMounted } from "@/hooks/useSaved";
import { BEER_BY_KEY, FAMILY_BY_KEY, type BeerWithBrewery } from "@/data/beers";

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
      aria-label="My taps"
      className="space-y-3 overflow-hidden rounded-[var(--app-radius-lg)] border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--app-accent) 32%, var(--app-border))",
        background: "linear-gradient(135deg, var(--app-brand-2), #0d241d)",
        boxShadow: "var(--app-shadow-2)",
      }}
    >
      {heading && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bookmark className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--app-accent)" }} aria-hidden />
            <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-on-brand)" }}>
              Your saved pours
            </h2>
          </div>
          <span className="rounded-full border border-white/20 px-2.5 py-1 font-mono text-[11px] tabular-nums text-white/75">
            {beers.length} {beers.length === 1 ? "pour" : "pours"}
          </span>
        </div>
      )}
      <ul className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {beers.map(({ beer, key }) => (
          <TapRow key={key} beer={beer} savedKey={key} />
        ))}
      </ul>
    </section>
  );
}

function TapRow({ beer, savedKey }: { beer: BeerWithBrewery; savedKey: string }) {
  const remove = useToggleSave("beer", savedKey);
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <li
      className="flex min-w-[245px] max-w-[290px] snap-start items-center gap-3 rounded-[var(--app-radius-md)] border p-3"
      style={{ borderColor: "rgba(255,255,255,.14)", background: "var(--app-bg-elevated-solid)" }}
    >
      <span aria-hidden className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: fam.base }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
          {beer.name}
        </p>
        <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          {beer.style}
          {beer.abv != null && ` · ${beer.abv.toFixed(1)}%`} · {beer.breweryName}, {prettyTown(beer.town)}
        </p>
      </div>
      <button
        type="button"
        onClick={remove}
        aria-label={`Remove ${beer.name} from My taps`}
        className="tap-44 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
        style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink-3)" }}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </button>
    </li>
  );
}

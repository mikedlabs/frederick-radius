"use client";

import Link from "next/link";
import { Bookmark, X, ArrowRight } from "lucide-react";
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

  const breweries = [...new Set(beers.map((b) => b.beer.brewerySlug))];

  return (
    <section aria-label="My taps" className="space-y-3">
      {heading && (
        <div className="flex items-baseline gap-2.5">
          <Bookmark className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--app-brand)" }} aria-hidden />
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            My taps
          </h2>
          <span className="font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {beers.length}
          </span>
        </div>
      )}
      <ul className="space-y-2">
        {beers.map(({ beer, key }) => (
          <TapRow key={key} beer={beer} savedKey={key} />
        ))}
      </ul>
      <Link
        href="/collections/beer-around-frederick"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
        style={{ color: "var(--app-brand-press)" }}
      >
        Plan a day around these {breweries.length} {breweries.length === 1 ? "brewery" : "breweries"}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </Link>
    </section>
  );
}

function TapRow({ beer, savedKey }: { beer: BeerWithBrewery; savedKey: string }) {
  const remove = useToggleSave("beer", savedKey);
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <li
      className="flex items-center gap-3 rounded-[var(--app-radius-md)] border p-2.5"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
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
      {beer.rating != null && (
        <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          ★ {beer.rating.toFixed(2)}
        </span>
      )}
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

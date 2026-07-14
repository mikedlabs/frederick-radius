"use client";

import Link from "next/link";
import { Sparkles, Bookmark } from "lucide-react";
import { useSavedList, useIsSaved, useToggleSave, useMounted } from "@/hooks/useSaved";
import {
  ALL_BEERS,
  BEER_BY_KEY,
  FAMILY_BY_KEY,
  beerKey,
  type StyleFamily,
  type BeerWithBrewery,
} from "@/data/beers";

const prettyTown = (slug: string) =>
  slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * "More you might like" — reads the beers saved to My taps, figures out the
 * styles the user leans toward, and suggests well-rated beers in those styles
 * they have not saved yet. Self-hides until there is enough signal.
 */
export default function BeerRecs() {
  const mounted = useMounted();
  const list = useSavedList();
  if (!mounted) return null;

  const savedKeys = new Set(list.filter((r) => r.type === "beer").map((r) => r.id));
  if (savedKeys.size < 1) return null;

  // Tally liked style families from saved beers.
  const tally = new Map<StyleFamily, number>();
  for (const k of savedKeys) {
    const b = BEER_BY_KEY[k];
    if (b) tally.set(b.family, (tally.get(b.family) ?? 0) + 1);
  }
  const topFamilies = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => f);
  if (topFamilies.length === 0) return null;

  const recs = ALL_BEERS.filter((b) => topFamilies.includes(b.family) && !savedKeys.has(beerKey(b)))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5);
  if (recs.length === 0) return null;

  return (
    <section aria-label="More you might like" className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <Sparkles className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--app-accent-press)" }} aria-hidden />
        <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          More you might like
        </h2>
      </div>
      <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
        Because you saved {topFamilies.map((f) => FAMILY_BY_KEY[f].label.toLowerCase()).join(" and ")}.
      </p>
      <ul className="space-y-1.5">
        {recs.map((b) => (
          <RecRow key={`${b.brewerySlug}-${b.name}`} beer={b} />
        ))}
      </ul>
    </section>
  );
}

function RecRow({ beer }: { beer: BeerWithBrewery }) {
  const key = beerKey(beer);
  const saved = useIsSaved("beer", key);
  const toggle = useToggleSave("beer", key);
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <li className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] border p-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      <span aria-hidden className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: fam.base }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{beer.name}</p>
        <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          {beer.style}{beer.abv != null && ` · ${beer.abv.toFixed(1)}%`} ·{" "}
          <Link href={`/places/${beer.brewerySlug}`} className="hover:underline" style={{ color: "var(--app-ink-2)" }}>{beer.breweryName}</Link>
          <span className="text-[var(--app-ink-3)]">, {prettyTown(beer.town)}</span>
        </p>
      </div>
      {beer.rating != null && (
        <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums" style={{ color: "var(--app-ink-3)" }}>★ {beer.rating.toFixed(2)}</span>
      )}
      <button type="button" onClick={toggle} aria-pressed={saved} aria-label={saved ? `Remove ${beer.name} from My taps` : `Save ${beer.name} to My taps`} className="tap-44 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: saved ? "var(--app-brand)" : "var(--app-border-strong)", background: saved ? "var(--app-brand)" : "transparent", color: saved ? "var(--app-on-brand)" : "var(--app-ink-3)" }}>
        <Bookmark className="h-4 w-4" strokeWidth={2.25} fill={saved ? "currentColor" : "none"} aria-hidden />
      </button>
    </li>
  );
}

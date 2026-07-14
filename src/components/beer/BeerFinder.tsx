"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Search, MapPin, List, Beer as BeerIcon, Bookmark, X, ArrowUpRight, Navigation } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { haversineMeters } from "@/lib/geo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { useGeolocation } from "@/hooks/useGeolocation";
import FilterChip from "@/components/ui/FilterChip";
import { useIsSaved, useToggleSave, useMounted } from "@/hooks/useSaved";
import {
  BREWERIES,
  ALL_BEERS,
  STYLE_FAMILIES,
  FAMILY_BY_KEY,
  beerKey,
  type StyleFamily,
  type Brewery,
  type BeerWithBrewery,
} from "@/data/beers";

// The map (and Mapbox under it) only downloads when the Map tab is opened.
const AppMapClient = dynamic(() => import("@/components/map/AppMapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[62vh] min-h-[380px] w-full items-center justify-center rounded-[var(--app-radius-lg)] border" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
      <span className="text-[13px]">Loading map…</span>
    </div>
  ),
});

const prettyTown = (slug: string) =>
  MUNICIPALITY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const miles = (m: number) => `${(m / 1609.344).toFixed(1)} mi`;

type Tab = "beers" | "breweries" | "map";
type BeerSort = "az" | "rating" | "abv";
type Amenity = "dog-friendly" | "food-trucks" | "family";
type BeerAttr = "session" | "strong" | "toprated";

const AMENITIES: Array<{ key: Amenity; label: string }> = [
  { key: "dog-friendly", label: "Dog-friendly" },
  { key: "food-trucks", label: "Has food" },
  { key: "family", label: "Family-friendly" },
];
const BEER_ATTRS: Array<{ key: BeerAttr; label: string }> = [
  { key: "session", label: "Session <5%" },
  { key: "strong", label: "Strong 8%+" },
  { key: "toprated", label: "Top rated" },
];
function beerMatchesAttr(b: { abv: number | null; rating: number | null }, a: BeerAttr): boolean {
  if (a === "session") return b.abv != null && b.abv < 5;
  if (a === "strong") return b.abv != null && b.abv >= 8;
  return b.rating != null && b.rating >= 3.9;
}

/**
 * BeerFinder — search, sort, and filter every Frederick County beer and
 * brewery. Filters: style, town, open-now, amenities (dog-friendly, food,
 * family), ABV band, and top-rated; sort A-Z / rating / ABV or Near me
 * (geolocation). Beers/Breweries/Map tabs. Saving keeps My taps.
 */
export default function BeerFinder({ breweryCards }: { breweryCards: PlaceCardData[] }) {
  const [tab, setTab] = useState<Tab>("beers");
  const [q, setQ] = useState("");
  const [fams, setFams] = useState<Set<StyleFamily>>(new Set());
  const [amens, setAmens] = useState<Set<Amenity>>(new Set());
  const [beerAttrs, setBeerAttrs] = useState<Set<BeerAttr>>(new Set());
  const [town, setTown] = useState<string | null>(null);
  const [openNow, setOpenNow] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [sort, setSort] = useState<BeerSort>("az");

  const geo = useGeolocation();
  const position = geo.state.status === "granted" ? geo.state.position : null;
  const query = q.trim().toLowerCase();

  const openSlugs = new Set(breweryCards.filter((p) => isOpenNow(p.open_status)).map((p) => p.slug));
  const cardBySlug = new Map(breweryCards.map((p) => [p.slug, p]));
  const tagsBySlug = new Map(breweryCards.map((p) => [p.slug, new Set(p.tags ?? [])]));
  const distBySlug = new Map<string, number>();
  if (position) {
    for (const p of breweryCards) if (p.geom) distBySlug.set(p.slug, haversineMeters(position, p.geom));
  }

  const townCounts = new Map<string, number>();
  for (const b of BREWERIES) townCounts.set(b.town, (townCounts.get(b.town) ?? 0) + 1);
  const towns = [...townCounts.keys()].sort((a, b) => prettyTown(a).localeCompare(prettyTown(b)));

  function toggle<T>(set: Set<T>, setter: (s: Set<T>) => void, v: T) {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  }

  function amenityOk(slug: string): boolean {
    if (!amens.size) return true;
    const t = tagsBySlug.get(slug);
    if (!t) return false;
    for (const a of amens) if (!t.has(a)) return false;
    return true;
  }

  function breweryPasses(b: Brewery): boolean {
    if (town && b.town !== town) return false;
    if (openNow && !openSlugs.has(b.slug)) return false;
    if (!amenityOk(b.slug)) return false;
    if (fams.size && !b.beers.some((be) => fams.has(be.family))) return false;
    if (beerAttrs.size && !b.beers.some((be) => [...beerAttrs].every((a) => beerMatchesAttr(be, a)))) return false;
    if (query && !`${b.name} ${b.focus} ${b.beers.map((x) => x.name).join(" ")}`.toLowerCase().includes(query)) return false;
    return true;
  }

  const beers = ALL_BEERS.filter((b) => {
    if (fams.size && !fams.has(b.family)) return false;
    if (town && b.town !== town) return false;
    if (openNow && !openSlugs.has(b.brewerySlug)) return false;
    if (!amenityOk(b.brewerySlug)) return false;
    if (beerAttrs.size && ![...beerAttrs].every((a) => beerMatchesAttr(b, a))) return false;
    if (query && !`${b.name} ${b.style} ${b.breweryName}`.toLowerCase().includes(query)) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name);
    if (sort === "abv") return (b.abv ?? 0) - (a.abv ?? 0) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  const breweries = BREWERIES.filter(breweryPasses).sort((a, b) => {
    if (nearMe && position) {
      const da = distBySlug.get(a.slug) ?? Infinity;
      const db = distBySlug.get(b.slug) ?? Infinity;
      if (da !== db) return da - db;
    }
    return a.name.localeCompare(b.name);
  });

  const mapSlugs = new Set(breweries.map((b) => b.slug));
  const mapPlaces = breweryCards.filter((p) => mapSlugs.has(p.slug) && p.geom);

  const activeFilters = fams.size + amens.size + beerAttrs.size + (town ? 1 : 0) + (openNow ? 1 : 0) + (nearMe ? 1 : 0);

  function clearAll() {
    setFams(new Set());
    setAmens(new Set());
    setBeerAttrs(new Set());
    setTown(null);
    setOpenNow(false);
    setNearMe(false);
  }

  function toggleNearMe() {
    if (!nearMe && !position) geo.request();
    setNearMe((v) => !v);
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search beers, breweries, styles"
          aria-label="Search beers and breweries"
          className="w-full rounded-full border py-2.5 pl-9 pr-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }}
        />
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Browse beers, breweries, or map" className="inline-flex w-full rounded-full border p-0.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
        {([["beers", "Beers", BeerIcon], ["breweries", "Breweries", List], ["map", "Map", MapPin]] as const).map(([key, label, Icon]) => {
          const active = tab === key;
          return (
            <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setTab(key)} className="tap-44-y flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors" style={{ background: active ? "var(--app-bg-elevated)" : "transparent", color: active ? "var(--app-ink)" : "var(--app-ink-3)", boxShadow: active ? "var(--app-edge), var(--app-hi)" : "none" }}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        {/* Attributes */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterChip label="Open now" active={openNow} onClick={() => setOpenNow((v) => !v)} />
          <FilterChip label="Near me" active={nearMe} onClick={toggleNearMe} />
          {BEER_ATTRS.map((a) => (
            <FilterChip key={a.key} label={a.label} active={beerAttrs.has(a.key)} onClick={() => toggle(beerAttrs, setBeerAttrs, a.key)} />
          ))}
          {AMENITIES.map((a) => (
            <FilterChip key={a.key} label={a.label} active={amens.has(a.key)} onClick={() => toggle(amens, setAmens, a.key)} />
          ))}
        </div>
        {/* Styles */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {STYLE_FAMILIES.map((f) => (
            <FilterChip key={f.key} label={f.label} active={fams.has(f.key)} onClick={() => toggle(fams, setFams, f.key)} />
          ))}
        </div>
        {/* Towns */}
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterChip label="All towns" active={town === null} onClick={() => setTown(null)} />
          {towns.map((t) => (
            <FilterChip key={t} label={prettyTown(t)} active={town === t} onClick={() => setTown(town === t ? null : t)} />
          ))}
          {activeFilters > 0 && (
            <button type="button" onClick={clearAll} className="tap-44-y ml-auto shrink-0 inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
              <X className="h-3 w-3" strokeWidth={2.5} aria-hidden /> Clear
            </button>
          )}
        </div>
        {nearMe && !position && (
          <p className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <Navigation className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            {geo.state.status === "denied" ? "Location is off. Turn it on to sort by distance." : geo.state.status === "loading" ? "Getting your location…" : "Allow location to sort by distance."}
          </p>
        )}
      </div>

      {/* Content */}
      {tab === "beers" && (
        <>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{beers.length} beers</p>
            <div className="inline-flex rounded-full border p-0.5 text-[12px]" style={{ borderColor: "var(--app-border)" }}>
              {([["az", "A–Z"], ["rating", "Top rated"], ["abv", "Strongest"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className="tap-44-y rounded-full px-2.5 py-1 font-semibold" style={{ background: sort === k ? "var(--app-bg-elevated)" : "transparent", color: sort === k ? "var(--app-ink)" : "var(--app-ink-3)", boxShadow: sort === k ? "var(--app-edge)" : "none" }}>{l}</button>
              ))}
            </div>
          </div>
          {beers.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-1.5">
              {beers.map((b) => (
                <BeerRow key={`${b.brewerySlug}-${b.name}`} beer={b} openBrewery={openSlugs.has(b.brewerySlug)} dist={position ? distBySlug.get(b.brewerySlug) : undefined} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "breweries" && (
        <>
          <p className="font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{breweries.length} breweries</p>
          {breweries.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2.5">
              {breweries.map((b) => (
                <BreweryRow key={b.slug} brewery={b} open={openSlugs.has(b.slug)} card={cardBySlug.get(b.slug)} activeFams={fams} dist={position ? distBySlug.get(b.slug) : undefined} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "map" && (
        mapPlaces.length > 0 ? (
          <div className="relative h-[62vh] min-h-[380px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border" style={{ borderColor: "var(--app-border)" }}>
            <AppMapClient places={mapPlaces} fullBleed recenterToKnownLocation={nearMe && !!position} />
          </div>
        ) : (
          <Empty note="No breweries match on the map with those filters." />
        )
      )}
    </div>
  );
}

function BeerRow({ beer, openBrewery, dist }: { beer: BeerWithBrewery; openBrewery: boolean; dist?: number }) {
  const mounted = useMounted();
  const key = beerKey(beer);
  const saved = useIsSaved("beer", key);
  const toggleSave = useToggleSave("beer", key);
  const on = mounted && saved;
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <li className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] border p-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      <span aria-hidden className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: fam.base }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{beer.name}</p>
        <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          {beer.style}{beer.abv != null && ` · ${beer.abv.toFixed(1)}%`}
          {" · "}
          <Link href={`/places/${beer.brewerySlug}`} className="hover:underline" style={{ color: "var(--app-ink-2)" }}>{beer.breweryName}</Link>
          {dist != null && <span className="font-mono"> · {miles(dist)}</span>}
          {openBrewery && <span style={{ color: "var(--app-positive, #1E6B3A)" }}> · open now</span>}
        </p>
      </div>
      {beer.rating != null && (
        <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums" style={{ color: "var(--app-ink-3)" }}>★ {beer.rating.toFixed(2)}</span>
      )}
      <button type="button" onClick={toggleSave} aria-pressed={on} aria-label={on ? `Remove ${beer.name} from My taps` : `Save ${beer.name} to My taps`} className="tap-44 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: on ? "var(--app-brand)" : "var(--app-border-strong)", background: on ? "var(--app-brand)" : "transparent", color: on ? "var(--app-on-brand)" : "var(--app-ink-3)" }}>
        <Bookmark className="h-4 w-4" strokeWidth={2.25} fill={on ? "currentColor" : "none"} aria-hidden />
      </button>
    </li>
  );
}

function BreweryRow({ brewery, open, card, activeFams, dist }: { brewery: Brewery; open: boolean; card?: PlaceCardData; activeFams: Set<StyleFamily>; dist?: number }) {
  const beers = activeFams.size ? brewery.beers.filter((b) => activeFams.has(b.family)) : brewery.beers;
  const tags = (card?.tags ?? []).filter((t) => t === "dog-friendly" || t === "food-trucks" || t === "family");
  return (
    <li className="rounded-[var(--app-radius-lg)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/places/${brewery.slug}`} className="font-serif text-[17px] font-semibold tracking-tight hover:underline" style={{ color: "var(--app-ink)" }}>
          {brewery.name}
        </Link>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: open ? "var(--app-positive, #1E6B3A)" : "var(--app-ink-3)" }}>
          {open ? "Open now" : prettyTown(brewery.town)}
        </span>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        <span>{prettyTown(brewery.town)}</span>
        {dist != null && <span className="font-mono">· {miles(dist)}</span>}
        {tags.map((t) => (
          <span key={t}>· {t === "dog-friendly" ? "Dog-friendly" : t === "food-trucks" ? "Food" : "Family"}</span>
        ))}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{brewery.focus}</p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {beers.slice(0, 8).map((be) => {
          const fam = FAMILY_BY_KEY[be.family];
          return (
            <li key={be.name} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]" style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }}>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: fam.base }} />
              {be.name}
            </li>
          );
        })}
        {beers.length > 8 && (
          <li className="inline-flex items-center rounded-full px-2 py-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>+{beers.length - 8} more</li>
        )}
      </ul>
      <div className="mt-3 flex items-center gap-4 text-[12px] font-semibold">
        <Link href={`/places/${brewery.slug}`} style={{ color: "var(--app-cool)" }}>See brewery</Link>
        {brewery.untappd && (
          <a href={brewery.untappd} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5" style={{ color: "var(--app-cool)" }}>
            On tap now <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

function Empty({ note = "Nothing matches those filters. Try clearing a few." }: { note?: string }) {
  return (
    <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
      {note}
    </p>
  );
}

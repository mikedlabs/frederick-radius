"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Search, Bookmark, X, ArrowUpRight, Navigation } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import { getOpenStatus, isOpenNow } from "@/lib/hours";
import { isHoursFresh } from "@/lib/hours-freshness";
import { haversineMeters } from "@/lib/geo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { useGeolocation } from "@/hooks/useGeolocation";
import FilterChip from "@/components/ui/FilterChip";
import { BeerGlassArt } from "@/components/beer/BeerGlassArt";
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

type Tab = "beers" | "breweries" | "map" | "best";
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
  { key: "toprated", label: "Rated 3.9+" },
];
const INITIAL_BEER_ROWS = 24;
const INITIAL_BREWERY_ROWS = 12;
function beerMatchesAttr(b: { abv: number | null; rating: number | null }, a: BeerAttr): boolean {
  if (a === "session") return b.abv != null && b.abv < 5;
  if (a === "strong") return b.abv != null && b.abv >= 8;
  return b.rating != null && b.rating >= 3.9;
}

/**
 * BeerFinder — search, sort, and filter every Frederick County beer and
 * brewery. Filters: style, town, open-now, amenities, ABV band, top-rated;
 * sort A-Z / rating / ABV or Near me (geolocation). Tabs: Beers, Breweries,
 * Map, and rating snapshots. Brewery rows carry a visual + Google rating.
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
  const [visibleBeerRows, setVisibleBeerRows] = useState(INITIAL_BEER_ROWS);
  const [visibleBreweryRows, setVisibleBreweryRows] = useState(INITIAL_BREWERY_ROWS);

  const geo = useGeolocation();
  const position = geo.state.status === "granted" ? geo.state.position : null;
  const query = q.trim().toLowerCase();

  // Recompute against the browser's current clock. The server-rendered card
  // status can be up to one ISR window old even when its stored hours are the
  // same. Copy below still labels this as stored-hours guidance, not live data.
  const freshHoursCards = breweryCards.filter(
    (place) => place.hours_verified && isHoursFresh(place.hours_updated_at),
  );
  const hasReliableHoursCoverage = breweryCards.length > 0
    && freshHoursCards.length / breweryCards.length >= 0.6;
  const openSlugs = new Set(
    (hasReliableHoursCoverage ? freshHoursCards : [])
      .filter((place) => isOpenNow(getOpenStatus(place.hours, { verified: place.hours_verified ?? false })))
      .map((place) => place.slug),
  );
  const cardBySlug = new Map(breweryCards.map((p) => [p.slug, p]));
  const tagsBySlug = new Map(breweryCards.map((p) => [p.slug, new Set(p.tags ?? [])]));
  const distBySlug = new Map<string, number>();
  if (position) {
    for (const p of breweryCards) if (p.geom) distBySlug.set(p.slug, haversineMeters(position, p.geom));
  }

  const townCounts = new Map<string, number>();
  for (const b of BREWERIES) townCounts.set(b.town, (townCounts.get(b.town) ?? 0) + 1);
  const towns = [...townCounts.keys()].sort((a, b) => prettyTown(a).localeCompare(prettyTown(b)));

  function resetVisibleCounts() {
    setVisibleBeerRows(INITIAL_BEER_ROWS);
    setVisibleBreweryRows(INITIAL_BREWERY_ROWS);
  }

  function toggle<T>(set: Set<T>, setter: (s: Set<T>) => void, v: T) {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
    resetVisibleCounts();
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
    if (openNow && hasReliableHoursCoverage && !openSlugs.has(b.slug)) return false;
    if (!amenityOk(b.slug)) return false;
    if (fams.size && !b.beers.some((be) => fams.has(be.family))) return false;
    if (beerAttrs.size && !b.beers.some((be) => [...beerAttrs].every((a) => beerMatchesAttr(be, a)))) return false;
    if (query && !`${b.name} ${b.focus} ${b.beers.map((x) => x.name).join(" ")}`.toLowerCase().includes(query)) return false;
    return true;
  }

  const beers = ALL_BEERS.filter((b) => {
    if (fams.size && !fams.has(b.family)) return false;
    if (town && b.town !== town) return false;
    if (openNow && hasReliableHoursCoverage && !openSlugs.has(b.brewerySlug)) return false;
    if (!amenityOk(b.brewerySlug)) return false;
    if (beerAttrs.size && ![...beerAttrs].every((a) => beerMatchesAttr(b, a))) return false;
    if (query && !`${b.name} ${b.style} ${b.breweryName}`.toLowerCase().includes(query)) return false;
    return true;
  }).sort((a, b) => {
    if (nearMe && position) {
      const distanceDifference = (distBySlug.get(a.brewerySlug) ?? Infinity) - (distBySlug.get(b.brewerySlug) ?? Infinity);
      if (distanceDifference !== 0) return distanceDifference;
    }
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

  // Leaderboards: honor the active filters so "best hazy IPAs" works.
  const topBeers = [...beers].filter((b) => b.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 12);
  const topBreweries = breweries
    .map((b) => ({ b, card: cardBySlug.get(b.slug) }))
    .filter((x): x is { b: Brewery; card: PlaceCardData } => Boolean(x.card?.google_rating))
    .sort((x, y) => (y.card.google_rating ?? 0) - (x.card.google_rating ?? 0))
    .slice(0, 10);
  const shownBeers = beers.slice(0, visibleBeerRows);
  const shownBreweries = breweries.slice(0, visibleBreweryRows);
  const beerRowsRemaining = Math.max(0, beers.length - shownBeers.length);
  const breweryRowsRemaining = Math.max(0, breweries.length - shownBreweries.length);

  const activeFilters = fams.size + amens.size + beerAttrs.size + (town ? 1 : 0) + (openNow && hasReliableHoursCoverage ? 1 : 0) + (nearMe ? 1 : 0);

  function clearAll() {
    setFams(new Set());
    setAmens(new Set());
    setBeerAttrs(new Set());
    setTown(null);
    setOpenNow(false);
    setNearMe(false);
    resetVisibleCounts();
  }
  function toggleNearMe() {
    if (!nearMe && !position) geo.request();
    setNearMe((v) => !v);
    resetVisibleCounts();
  }

  // Remember the beer sort across visits.
  useEffect(() => {
    try {
      const s = window.localStorage.getItem("fr.beer-sort");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydration of a localStorage preference; SSR can't read it
      if (s === "az" || s === "rating" || s === "abv") setSort(s);
    } catch {
      /* ignore */
    }
  }, []);
  function setSortAndStore(s: BeerSort) {
    setSort(s);
    resetVisibleCounts();
    try {
      window.localStorage.setItem("fr.beer-sort", s);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            resetVisibleCounts();
          }}
          placeholder="Search beers, breweries, styles"
          aria-label="Search beers and breweries"
          className="w-full rounded-full border py-2.5 pl-9 pr-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }}
        />
      </div>

      {/* Tabs */}
      <div role="group" aria-label="Browse beer guide" className="inline-flex w-full rounded-full border p-0.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
        {([["beers", "Beers"], ["breweries", "Breweries"], ["map", "Map"], ["best", "Ratings"]] as const).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setTab(key);
                resetVisibleCounts();
              }}
              className="tap-44-y flex flex-1 items-center justify-center rounded-full px-2 py-1.5 text-[13px] font-semibold transition-colors"
              style={{ background: active ? "var(--app-bg-elevated)" : "transparent", color: active ? "var(--app-ink)" : "var(--app-ink-3)", boxShadow: active ? "var(--app-edge), var(--app-hi)" : "none" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {hasReliableHoursCoverage && (
            <FilterChip
              label="Hours say open"
              active={openNow}
              onClick={() => {
                setOpenNow((v) => !v);
                resetVisibleCounts();
              }}
            />
          )}
          <FilterChip label="Near me" active={nearMe} onClick={toggleNearMe} />
          {BEER_ATTRS.map((a) => (
            <FilterChip key={a.key} label={a.label} active={beerAttrs.has(a.key)} onClick={() => toggle(beerAttrs, setBeerAttrs, a.key)} />
          ))}
          {AMENITIES.map((a) => (
            <FilterChip key={a.key} label={a.label} active={amens.has(a.key)} onClick={() => toggle(amens, setAmens, a.key)} />
          ))}
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {STYLE_FAMILIES.map((f) => (
            <FilterChip key={f.key} label={f.label} active={fams.has(f.key)} onClick={() => toggle(fams, setFams, f.key)} />
          ))}
        </div>
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterChip
            label="All towns"
            active={town === null}
            onClick={() => {
              setTown(null);
              resetVisibleCounts();
            }}
          />
          {towns.map((t) => (
            <FilterChip
              key={t}
              label={prettyTown(t)}
              active={town === t}
              onClick={() => {
                setTown(town === t ? null : t);
                resetVisibleCounts();
              }}
            />
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
        {openNow && hasReliableHoursCoverage && (
          <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Based on stored hours, not live status. Verify before going.
          </p>
        )}
      </div>

      {/* Inline style explainer when exactly one style is selected. */}
      {fams.size === 1 && (
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>{FAMILY_BY_KEY[[...fams][0]].label}:</span>{" "}
          {FAMILY_BY_KEY[[...fams][0]].tagline}
        </p>
      )}

      {/* Content */}
      {tab === "beers" && (
        <>
          <div className="flex items-center justify-between">
            <p aria-live="polite" className="font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              Showing {shownBeers.length} of {beers.length} beers
            </p>
            <div className="inline-flex rounded-full border p-0.5 text-[12px]" style={{ borderColor: "var(--app-border)" }}>
              {([["az", "A–Z"], ["rating", "Rating"], ["abv", "Strongest"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSortAndStore(k)} aria-pressed={sort === k} className="tap-44-y rounded-full px-2.5 py-1 font-semibold" style={{ background: sort === k ? "var(--app-bg-elevated)" : "transparent", color: sort === k ? "var(--app-ink)" : "var(--app-ink-3)", boxShadow: sort === k ? "var(--app-edge)" : "none" }}>{l}</button>
              ))}
            </div>
          </div>
          {beers.length === 0 ? <Empty /> : (
            <>
              <ul id="beer-results" className="space-y-1.5">
                {shownBeers.map((b) => (
                  <BeerRow key={`${b.brewerySlug}-${b.name}`} beer={b} openBrewery={openSlugs.has(b.brewerySlug)} dist={position ? distBySlug.get(b.brewerySlug) : undefined} />
                ))}
              </ul>
              {beerRowsRemaining > 0 && (
                <button
                  type="button"
                  aria-controls="beer-results"
                  aria-label={`Show ${Math.min(INITIAL_BEER_ROWS, beerRowsRemaining)} more beers. ${beerRowsRemaining} remaining.`}
                  onClick={() => setVisibleBeerRows((count) => Math.min(beers.length, count + INITIAL_BEER_ROWS))}
                  className="tap-44-y mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold"
                  style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
                >
                  Show more beers
                  <span className="font-mono text-[11px] font-normal tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    Next {Math.min(INITIAL_BEER_ROWS, beerRowsRemaining)} · {beerRowsRemaining} remaining
                  </span>
                </button>
              )}
            </>
          )}
        </>
      )}

      {tab === "breweries" && (
        <>
          <p aria-live="polite" className="font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            Showing {shownBreweries.length} of {breweries.length} breweries
          </p>
          {breweries.length === 0 ? <Empty /> : (
            <>
              <ul id="brewery-results" className="space-y-2.5">
                {shownBreweries.map((b) => (
                  <BreweryRow key={b.slug} brewery={b} open={openSlugs.has(b.slug)} card={cardBySlug.get(b.slug)} activeFams={fams} dist={position ? distBySlug.get(b.slug) : undefined} />
                ))}
              </ul>
              {breweryRowsRemaining > 0 && (
                <button
                  type="button"
                  aria-controls="brewery-results"
                  aria-label={`Show ${Math.min(INITIAL_BREWERY_ROWS, breweryRowsRemaining)} more breweries. ${breweryRowsRemaining} remaining.`}
                  onClick={() => setVisibleBreweryRows((count) => Math.min(breweries.length, count + INITIAL_BREWERY_ROWS))}
                  className="tap-44-y mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold"
                  style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
                >
                  Show more breweries
                  <span className="font-mono text-[11px] font-normal tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    Next {Math.min(INITIAL_BREWERY_ROWS, breweryRowsRemaining)} · {breweryRowsRemaining} remaining
                  </span>
                </button>
              )}
            </>
          )}
        </>
      )}

      {tab === "map" && (
        mapPlaces.length > 0 ? (
          <div className="relative h-[62vh] min-h-[380px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border" style={{ borderColor: "var(--app-border)" }}>
            <AppMapClient places={mapPlaces} fullBleed recenterToKnownLocation={nearMe && !!position} />
          </div>
        ) : <Empty note="No breweries match on the map with those filters." />
      )}

      {tab === "best" && (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Beer ratings</h3>
            <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>Untappd ratings captured July 2026. Review counts aren&rsquo;t included, so treat the order as a rough signal{activeFilters > 0 ? " within your filters" : ""}.</p>
            {topBeers.length === 0 ? <Empty /> : (
              <ul className="space-y-1.5">
                {topBeers.map((b, i) => (
                  <BeerRow key={`${b.brewerySlug}-${b.name}`} beer={b} rank={i + 1} openBrewery={openSlugs.has(b.brewerySlug)} dist={position ? distBySlug.get(b.brewerySlug) : undefined} />
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Brewery ratings</h3>
            <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>Google ratings from the latest Radius place record.</p>
            {topBreweries.length === 0 ? <Empty /> : (
              <ul className="space-y-2">
                {topBreweries.map(({ b, card }, i) => (
                  <TopBreweryRow key={b.slug} rank={i + 1} brewery={b} card={card} open={openSlugs.has(b.slug)} dist={position ? distBySlug.get(b.slug) : undefined} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function GoogleRating({ card }: { card?: PlaceCardData }) {
  if (!card?.google_rating) return null;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-2)" }} title="Google rating">
      <span style={{ color: "var(--app-accent-press)" }}>★</span>
      {card.google_rating.toFixed(1)}
      {card.google_rating_count ? <span style={{ color: "var(--app-ink-3)" }}>({card.google_rating_count})</span> : null}
    </span>
  );
}

function BreweryPhoto({
  url,
  size = 56,
  family = "lager-pilsner",
}: {
  url?: string;
  size?: number;
  family?: StyleFamily;
}) {
  const colors = FAMILY_BY_KEY[family];
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[var(--app-radius-md)]"
      style={{
        height: size,
        width: size,
        background: url ? "var(--app-bg-sunken)" : `linear-gradient(145deg, ${colors.base}, ${colors.deep})`,
        boxShadow: "inset 0 0 0 1px var(--app-ink-tint-8)",
      }}
    >
      {url ? (
        <Image src={url} alt="" fill sizes="56px" unoptimized={url.startsWith("/api/place-photo")} className="object-cover" />
      ) : (
        <BeerGlassArt family={family} variant="pint" className="h-full w-full p-1" />
      )}
    </div>
  );
}

function BeerRow({ beer, openBrewery, dist, rank }: { beer: BeerWithBrewery; openBrewery: boolean; dist?: number; rank?: number }) {
  const mounted = useMounted();
  const key = beerKey(beer);
  const saved = useIsSaved("beer", key);
  const toggleSave = useToggleSave("beer", key);
  const on = mounted && saved;
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <li className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] border p-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      {rank != null && (
        <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums" style={{ color: "var(--app-ink-3)", width: 20, textAlign: "right" }}>{rank}</span>
      )}
      <span aria-hidden className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: fam.base }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{beer.name}</p>
        <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          {beer.style}{beer.abv != null && ` · ${beer.abv.toFixed(1)}%`}
          {" · "}
          <Link href={`/places/${beer.brewerySlug}`} className="hover:underline" style={{ color: "var(--app-ink-2)" }}>{beer.breweryName}</Link>
          {dist != null && <span className="font-mono"> · {miles(dist)}</span>}
          {openBrewery && <span style={{ color: "var(--app-positive, #1E6B3A)" }}> · hours say open</span>}
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
      <div className="flex gap-3">
        <BreweryPhoto url={card?.google_photo_url} size={56} family={brewery.beers[0]?.family} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Link href={`/places/${brewery.slug}`} className="font-serif text-[17px] font-semibold tracking-tight hover:underline" style={{ color: "var(--app-ink)" }}>
              {brewery.name}
            </Link>
            <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: open ? "var(--app-positive, #1E6B3A)" : "var(--app-ink-3)" }}>
              {open ? "Hours say open" : prettyTown(brewery.town)}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <GoogleRating card={card} />
            <span>· {prettyTown(brewery.town)}</span>
            {dist != null && <span className="font-mono">· {miles(dist)}</span>}
            {tags.map((t) => (
              <span key={t}>· {t === "dog-friendly" ? "Dog-friendly" : t === "food-trucks" ? "Food" : "Family"}</span>
            ))}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{brewery.focus}</p>
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
            View on Untappd <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

function TopBreweryRow({ rank, brewery, card, open, dist }: { rank: number; brewery: Brewery; card: PlaceCardData; open: boolean; dist?: number }) {
  return (
    <li className="flex items-center gap-3 rounded-[var(--app-radius-md)] border p-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums" style={{ color: "var(--app-ink-3)", width: 18, textAlign: "right" }}>{rank}</span>
      <BreweryPhoto url={card.google_photo_url} size={44} family={brewery.beers[0]?.family} />
      <div className="min-w-0 flex-1">
        <Link href={`/places/${brewery.slug}`} className="block truncate text-[14px] font-semibold hover:underline" style={{ color: "var(--app-ink)" }}>{brewery.name}</Link>
        <p className="flex flex-wrap items-center gap-x-2 truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          <GoogleRating card={card} />
          <span>· {prettyTown(brewery.town)}</span>
          {dist != null && <span className="font-mono">· {miles(dist)}</span>}
          {open && <span style={{ color: "var(--app-positive, #1E6B3A)" }}>· hours say open</span>}
        </p>
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

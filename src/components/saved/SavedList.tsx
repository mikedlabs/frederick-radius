"use client";

import { stampEventProvenance } from "@/lib/provenance";
import { useEffect, useMemo, useState } from "react";
import { useSavedList, useMounted } from "@/hooks/useSaved";
import { useRecentPlaces, useClearRecentPlaces } from "@/hooks/useRecentPlaces";
// A2.8: SavedList no longer static-imports clientPlaceBySlug, so
// /saved's client bundle no longer ships places-client.json (~2MB).
// Place data is hydrated via /api/places/by-slugs on mount.
import type { PlaceCardData } from "@/lib/loaders/places";
import { EVENT_BY_SLUG } from "@/data/events";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import Link from "next/link";
import { Bookmark, MapPin, Sparkles, Calendar, Building2 } from "lucide-react";
import IconStamp from "@/components/ui/IconStamp";
import Skeleton from "@/components/ui/Skeleton";
import SortDropdown, { type SortOption } from "@/components/ui/SortDropdown";
import { isOpenNow } from "@/lib/hours";
import { haversineMeters } from "@/lib/geo";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";

type SavedSortKey = "town" | "category" | "recent" | "az" | "distance" | "open";

const SORT_OPTIONS: ReadonlyArray<SortOption<SavedSortKey>> = [
  { key: "town", label: "By town", hint: "Your field guide, grouped by place" },
  { key: "open", label: "Open now", hint: "What you can go to right now" },
  { key: "category", label: "By category", hint: "Group by what kind of place" },
  { key: "recent", label: "Recent", hint: "Most recently saved first" },
  { key: "az", label: "A→Z", hint: "Alphabetical by name" },
  { key: "distance", label: "Distance", hint: "From your home town" },
];

const SAVED_SORT_STORAGE_KEY = "fr.saved-sort";

// Deterministic per-town accent so each town reads as its own colored
// "chapter" of the field guide (matches the town grid on /places).
const TOWN_ACCENTS = ["#A03A22", "#2F5470", "#1E6B3A", "#7E2C6F", "#B07A1E", "#3F5E8F"];
function townAccent(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return TOWN_ACCENTS[Math.abs(h) % TOWN_ACCENTS.length];
}

type DecoratedEvent = ReturnType<typeof decorateEvent>;

function decorateEvent(e: NonNullable<(typeof EVENT_BY_SLUG)[string]>) {
  return {
    ...e,
    ...stampEventProvenance(e, e.last_verified_at),
    distance_m: undefined,
    geo_confidence: eventGeoConfidence(e),
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
  };
}

/** Curated seeds for the empty state — six Frederick favorites that
 *  most visitors should know about. Picked by category breadth so the
 *  list shows the *shape* of the directory, not just food. Slugs match
 *  the canonical -town suffix form in places-client.json. */
const EMPTY_SEEDS: Array<{ slug: string; reason: string }> = [
  { slug: "monocacy-national-battlefield-frederick", reason: "The battle that saved Washington in 1864." },
  { slug: "carroll-creek-linear-park-frederick", reason: "Downtown's water + art park." },
  { slug: "olde-mother-brewing-frederick", reason: "Hometown brewery, year-round taproom." },
  { slug: "schifferstadt-architectural-museum-frederick", reason: "The county's oldest house, still standing." },
  { slug: "national-museum-civil-war-medicine-frederick", reason: "Small museum, big story." },
  { slug: "sky-stage", reason: "Outdoor stage built inside a ruin." },
];

export default function SavedList() {
  const mounted = useMounted();
  const items = useSavedList();
  // Soft signal — slugs the user has opened (PlaceSheet) but maybe
  // never bookmarked. Filtered to slugs still in the client place
  // index and to ones not already in the explicit Saved set so the
  // section never duplicates a card the user has already bookmarked.
  const recentSlugs = useRecentPlaces();
  const clearRecent = useClearRecentPlaces();

  // Union of every slug this component might need: saved bookmarks,
  // recently viewed, and the empty-state seeds. We hand the whole set
  // to /api/places/by-slugs in a single request and hydrate from the
  // returned map. slugsKey is a primitive string so React's effect
  // identity check is reference-stable across renders.
  const { slugsToFetch, slugsKey } = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.type === "place") set.add(i.id);
    for (const s of recentSlugs) set.add(s);
    for (const s of EMPTY_SEEDS) set.add(s.slug);
    const slugsToFetch = Array.from(set);
    return { slugsToFetch, slugsKey: slugsToFetch.join(",") };
  }, [items, recentSlugs]);

  // null = not yet fetched (or pre-mount); empty Map = fetched with no
  // matches. Distinguishing the two lets the render gate show a
  // skeleton ONLY while the request is in flight, not when the user
  // genuinely has nothing saved.
  const [placesBySlug, setPlacesBySlug] = useState<Map<string, PlaceCardData> | null>(null);

  useEffect(() => {
    if (!mounted) return;
    if (slugsToFetch.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: when nothing is saved, render the "empty Map = fetched, no matches" branch so the skeleton stops spinning
      setPlacesBySlug(new Map());
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slugsKey)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { places: PlaceCardData[] }) => {
        const m = new Map<string, PlaceCardData>();
        for (const p of data.places) m.set(p.slug, p);
        setPlacesBySlug(m);
      })
      .catch((err) => {
        // AbortError = navigated/unmounted; ignore. Anything else,
        // collapse to an empty map so the UI keeps rendering rather
        // than spinning forever.
        if (err && err.name !== "AbortError") {
          setPlacesBySlug(new Map());
        }
      });
    return () => ctrl.abort();
  }, [mounted, slugsKey, slugsToFetch.length]);

  // Persisted sort preference (defaults to "category" — the original
  // grouping behavior). Read on mount so SSR + first paint stay
  // consistent (mounted gate above already prevents server/client mismatch).
  const [sort, setSort] = useState<SavedSortKey>("town");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SAVED_SORT_STORAGE_KEY);
      if (saved === "town" || saved === "category" || saved === "recent" || saved === "az" || saved === "distance") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount hydration of a localStorage preference; SSR can't read localStorage
        setSort(saved);
      }
    } catch {
      /* localStorage unavailable; keep default */
    }
  }, []);
  function setSortAndStore(next: SavedSortKey) {
    setSort(next);
    try {
      window.localStorage.setItem(SAVED_SORT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // The "distance" sort needs an origin. Read the user's home muni
  // from localStorage (the same key PreferencesPanel writes); fall
  // back to no-origin (places-without-geom safely sort last via the
  // Infinity sentinel below).
  const [homeOrigin, setHomeOrigin] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    try {
      const slug = window.localStorage.getItem("fr_home_muni");
      if (slug) {
        const m = MUNICIPALITY_BY_SLUG[slug];
        // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount hydration of a localStorage preference; SSR can't read localStorage
        if (m) setHomeOrigin(m.centroid);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const { places, events, byCategory, byTown, townTally } = useMemo(() => {
    if (!placesBySlug) {
      return {
        places: [] as PlaceCardData[],
        events: [] as ReturnType<typeof decorateEvent>[],
        byCategory: new Map<string, PlaceCardData[]>(),
        byTown: new Map<string, PlaceCardData[]>(),
        townTally: new Map<string, number>(),
      };
    }
    // Build (ref, place) tuples so we can sort by saved_at when the
    // user picks "Recent". Other sorts only need the place itself.
    const placeRefs = items
      .filter((i) => i.type === "place")
      .map((i) => ({ ref: i, place: placesBySlug.get(i.id) }))
      .filter((x): x is { ref: typeof x.ref; place: PlaceCardData } => Boolean(x.place));

    // Apply the user's sort. "category" keeps the original recent-first
    // order before bucketing (so within each category, the freshest
    // saves still come first).
    let sorted: typeof placeRefs;
    switch (sort) {
      case "az":
        sorted = [...placeRefs].sort((a, b) =>
          a.place.name.localeCompare(b.place.name, undefined, { sensitivity: "base" }),
        );
        break;
      case "open":
        // Open places first, the one closing soonest leading — the
        // saved list as a "right now" tool, not a museum. Closed and
        // unverified places keep their recency order below the fold.
        sorted = [...placeRefs].sort((a, b) => {
          const oa = isOpenNow(a.place.open_status);
          const ob = isOpenNow(b.place.open_status);
          if (oa !== ob) return oa ? -1 : 1;
          if (oa && ob) {
            const ca = a.place.open_status.state === "open" || a.place.open_status.state === "closing-soon" ? a.place.open_status.closesAt : "99:99";
            const cb = b.place.open_status.state === "open" || b.place.open_status.state === "closing-soon" ? b.place.open_status.closesAt : "99:99";
            return ca.localeCompare(cb);
          }
          return +new Date(b.ref.saved_at) - +new Date(a.ref.saved_at);
        });
        break;
      case "distance":
        sorted = [...placeRefs].sort((a, b) => {
          const da = homeOrigin && a.place.geom ? haversineMeters(homeOrigin, a.place.geom) : Infinity;
          const db = homeOrigin && b.place.geom ? haversineMeters(homeOrigin, b.place.geom) : Infinity;
          return da - db;
        });
        break;
      case "category":
      case "recent":
      default:
        sorted = [...placeRefs].sort(
          (a, b) => +new Date(b.ref.saved_at) - +new Date(a.ref.saved_at),
        );
        break;
    }
    const places = sorted.map((x) => x.place);

    const events = items
      .filter((i) => i.type === "event")
      .map((i) => EVENT_BY_SLUG[i.id])
      .filter(Boolean)
      .map(decorateEvent);

    // Bucket places by their top-level category — gives the page a
    // "shape" so the user can scan what kind of Frederick they're
    // collecting (mostly food, mostly outdoors, a mix). Only used
    // when sort === "category"; other sorts render a flat list.
    const byCategory = new Map<string, PlaceCardData[]>();
    for (const p of places) {
      const top = CATEGORY_BY_SLUG[p.category]?.parent ?? p.category;
      const arr = byCategory.get(top) ?? [];
      arr.push(p);
      byCategory.set(top, arr);
    }

    // Town tally — if a town dominates, the page can surface a "make a
    // route" suggestion. Only counts places (events have venues but
    // their town signal is noisier).
    const townTally = new Map<string, number>();
    for (const p of places) {
      townTally.set(p.municipality, (townTally.get(p.municipality) ?? 0) + 1);
    }

    // Bucket places by town — the field-guide view ("what I'm keeping in
    // Frederick, in Brunswick…"). Used when sort === "town" (default).
    const byTown = new Map<string, PlaceCardData[]>();
    for (const p of places) {
      const arr = byTown.get(p.municipality) ?? [];
      arr.push(p);
      byTown.set(p.municipality, arr);
    }

    return { places, events, byCategory, byTown, townTally };
  }, [items, placesBySlug, sort, homeOrigin]);

  // Resolve recent slugs to PlaceCardData, drop ones now-saved (the
  // "Saved" sections already surface them) and ones not in the place
  // index. Capped to 6 so the row stays scannable.
  const savedSlugs = useMemo(
    () => new Set(items.filter((i) => i.type === "place").map((i) => i.id)),
    [items],
  );
  const recentPlaces = useMemo<PlaceCardData[]>(() => {
    if (!placesBySlug || !recentSlugs.length) return [];
    const out: PlaceCardData[] = [];
    for (const slug of recentSlugs) {
      if (savedSlugs.has(slug)) continue;
      const p = placesBySlug.get(slug);
      if (p) out.push(p);
      if (out.length >= 6) break;
    }
    return out;
  }, [recentSlugs, savedSlugs, placesBySlug]);

  // Show the skeleton in two cases: before the device-local items
  // resolve (mounted=false) AND while the /api/places/by-slugs round
  // trip is in flight. Both windows are short; the matched layout
  // avoids any jump when content arrives.
  if (!mounted || placesBySlug === null) {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton.Block height={88} round="var(--app-radius-lg)" />
        <Skeleton.Block height={56} round="var(--app-radius-md)" />
        <Skeleton.Row />
        <Skeleton.Row />
        <Skeleton.Row />
      </div>
    );
  }

  if (items.length === 0) return <EmptyState placesBySlug={placesBySlug} />;

  // Cluster signal: if ≥3 places are in one town, suggest a route.
  const dominantTown = [...townTally.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])[0];
  const dominantMuni = dominantTown
    ? MUNICIPALITY_BY_SLUG[dominantTown[0]]
    : null;

  return (
    <div className="space-y-5">
      {/* Personal hero — the "your Frederick" briefing. Stitches the
          tallies into one editorial sentence; the bar of stat pills
          underneath gives the at-a-glance read without a heavy 4-cell
          dark stat block. */}
      <section
        aria-label="Saved"
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 110% at 100% 0%, color-mix(in srgb, var(--app-brand) 14%, transparent), transparent 60%)",
          }}
        />
        <div className="relative space-y-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 16%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <Bookmark className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </span>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              At a glance
            </p>
          </div>
          <p
            className="font-serif text-[20px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {summarySentence(places.length, events.length, townTally.size)}
          </p>
          {/* Stat scoreboard — a quick, visual read of the collection. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)", color: "var(--app-brand)" }}
            >
              <Bookmark className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {places.length} {places.length === 1 ? "place" : "places"}
            </span>
            {townTally.size > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "color-mix(in srgb, var(--app-cool) 12%, transparent)", color: "var(--app-cool)" }}
              >
                <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                {townTally.size} {townTally.size === 1 ? "town" : "towns"}
              </span>
            )}
            {events.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "color-mix(in srgb, var(--app-positive) 12%, transparent)", color: "var(--app-positive)" }}
              >
                <Calendar className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                {events.length} {events.length === 1 ? "event" : "events"}
              </span>
            )}
          </div>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            On this device · sign-in to sync across devices coming soon
          </p>
        </div>
      </section>

      {/* Smart suggestion strip — only when there's a real cluster. */}
      {dominantMuni && (
        <Link
          href={`/plan?from=my-radius`}
          className="group flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition active:scale-[0.99]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
              color: "var(--app-cool)",
            }}
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block text-[13px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {dominantTown![1]} of your Radius is in {dominantMuni.name}
            </span>
            <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              Build a route from these → Planner
            </span>
          </span>
          <span
            aria-hidden
            className="text-[11px] font-bold transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--app-ink-3)" }}
          >
            →
          </span>
        </Link>
      )}

      {/* Places — grouped by top-level category when sort is "category"
          (default), or rendered as a flat sorted list otherwise. The
          sort dropdown sits next to the section label so a returning
          user sees their current preference in one glance. */}
      {places.length > 0 && (
        <section aria-label="Saved places" className="space-y-3">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <span
                aria-hidden
                className="block h-[3px] w-7 rounded-full"
                style={{ background: "var(--app-cool)" }}
              />
              <h2
                className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-cool)" }}
              >
                Places
              </h2>
              <span
                className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                style={{
                  background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
                  color: "var(--app-cool)",
                }}
              >
                {places.length}
              </span>
            </div>
            <SortDropdown
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSortAndStore}
            />
          </header>
          {sort === "town" || sort === "category" ? (
            <div className="space-y-4">
              {(sort === "town"
                ? [...byTown.entries()]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([slug, group]) => {
                      const m = MUNICIPALITY_BY_SLUG[slug];
                      return {
                        key: slug,
                        label: m?.name ?? slug,
                        color: townAccent(slug),
                        // The town's identity line — its one-liner fact,
                        // else population — turns a header into a chapter.
                        subtitle: m?.fact ?? (m ? `pop. ${m.population.toLocaleString()}` : null),
                        group,
                      };
                    })
                : [...byCategory.entries()]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([catSlug, group]) => ({
                      key: catSlug,
                      label: CATEGORY_BY_SLUG[catSlug]?.name ?? catSlug,
                      color: CATEGORY_BY_SLUG[catSlug]?.color ?? "var(--app-cool)",
                      subtitle: null as string | null,
                      group,
                    }))
              ).map(({ key, label, color, subtitle, group }) => (
                <section key={key} className="space-y-2">
                  {/* Chapter header — an accent-tinted band in the town's
                      own color, with a serif name + count + identity line,
                      so each section reads as its own page of the guide. */}
                  <header
                    className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2"
                    style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
                  >
                    <span
                      aria-hidden
                      className="block h-7 w-1.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h3
                          className="truncate font-serif text-[15px] font-semibold tracking-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {label}
                        </h3>
                        <span
                          className="shrink-0 rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
                        >
                          {group.length}
                        </span>
                      </div>
                      {subtitle && (
                        <p
                          className="truncate text-[11px] leading-tight"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {subtitle}
                        </p>
                      )}
                    </div>
                  </header>
                  <ul className="space-y-2">
                    {group.map((p) => (
                      <li key={p.slug}>
                        <PlaceCard place={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {places.map((p) => (
                <li key={p.slug}>
                  <PlaceCard place={p} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Recently viewed — soft signal. Surfaces places the user has
          opened (via PlaceSheet) but hasn't explicitly bookmarked, so
          returning users can pick a thread back up without having to
          remember the exact name. Quieter visual weight than the
          deliberate Saved sections above. Only renders when there's
          something to show that isn't already in Saved. */}
      {recentPlaces.length > 0 && (
        <section aria-label="Recently viewed" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-ink-3)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Recently viewed
            </h2>
            <span
              className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
              style={{
                background: "color-mix(in srgb, var(--app-ink-3) 14%, transparent)",
                color: "var(--app-ink-3)",
              }}
            >
              {recentPlaces.length}
            </span>
            <button
              type="button"
              onClick={clearRecent}
              className="ml-auto text-[11px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-ink-3)" }}
            >
              Clear
            </button>
          </header>
          <ul className="space-y-2">
            {recentPlaces.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section aria-label="Events in your Radius" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-brand)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-brand)" }}
            >
              Events
            </h2>
            <span
              className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              {events.length}
            </span>
          </header>
          <ul className="space-y-2">
            {events.map((e: DecoratedEvent) => (
              <li key={e.slug}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function summarySentence(placeN: number, eventN: number, townN: number): string {
  if (placeN === 0 && eventN === 0) return "Start building your Radius.";
  const parts: string[] = [];
  if (placeN > 0) parts.push(`${placeN} place${placeN === 1 ? "" : "s"}`);
  if (eventN > 0) parts.push(`${eventN} event${eventN === 1 ? "" : "s"}`);
  let body = parts.join(" and ");
  if (placeN > 0 && townN > 1) body += ` across ${townN} town${townN === 1 ? "" : "s"}`;
  return `${body} in your field guide.`;
}

/**
 * EmptyState — the first impression when nothing's saved. We don't
 * leave the page bare; we treat it as a soft pitch for *what saving
 * is for* and prime the pump with six curated seeds the visitor can
 * tap to learn about. Each seed has a one-sentence "why" so the
 * empty page reads as editorial, not as a debug placeholder.
 */
function EmptyState({ placesBySlug }: { placesBySlug: Map<string, PlaceCardData> }) {
  const seeds = EMPTY_SEEDS
    .map((s) => ({ ...s, place: placesBySlug.get(s.slug) }))
    .filter((s): s is typeof s & { place: PlaceCardData } => Boolean(s.place));

  // Four confident doorways — the same lane language as /places, pointing
  // at the surfaces that fill this page. A guided launchpad, not a paragraph.
  const LANES: { href: string; label: string; Icon: typeof Bookmark; color: string }[] = [
    { href: "/guide", label: "Ask", Icon: Sparkles, color: "var(--app-brand)" },
    { href: "/map", label: "Map", Icon: MapPin, color: "var(--app-cool)" },
    { href: "/events", label: "Events", Icon: Calendar, color: "#C99632" },
    { href: "/towns", label: "Towns", Icon: Building2, color: "#7E2C6F" },
  ];

  return (
    <div className="space-y-4">
      {/* Tight inline hero — stamp + title + line on one row, not a stacked
          block. Dense, content opens immediately. */}
      <div className="flex items-center gap-3">
        <IconStamp accent="var(--app-brand)" size="md">
          <Bookmark aria-hidden />
        </IconStamp>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            Nothing saved yet
          </h2>
          <p className="text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Tap the bookmark on any place or event.
          </p>
        </div>
      </div>

      {/* Guided doorways — four across in a row, Apple-Wallet style: compact
          frosted, translucent quick-action cards (icon over a one-word label)
          over the page bloom. */}
      <ul className="grid grid-cols-4 gap-2">
        {LANES.map(({ href, label, Icon, color }) => (
          <li key={href}>
            <Link
              href={href}
              className="tactile tactile-interactive flex flex-col items-center gap-1.5 rounded-[var(--app-radius-md)] px-1 py-2.5 backdrop-blur-md"
              style={{
                background: "color-mix(in srgb, var(--app-bg-elevated) 66%, transparent)",
                boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)",
              }}
            >
              <IconStamp accent={color} size="sm">
                <Icon aria-hidden />
              </IconStamp>
              <span className="text-[11px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                {label}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {seeds.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Worth starting with
          </h2>
          {/* Two-up compact cells so more fit on screen — visual photo
              tiles rather than stacked full-width rows. */}
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {seeds.map((s) => (
              <li key={s.slug}>
                <PlaceCard place={s.place} variant="grid" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

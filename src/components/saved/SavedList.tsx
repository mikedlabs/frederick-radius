"use client";

import { stampEventProvenance } from "@/lib/provenance";
import { townAccent } from "@/lib/townAccent";
import { useEffect, useMemo, useState } from "react";
import { useSavedList, useMounted, type SavedRef } from "@/hooks/useSaved";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { useRecentPlaces, useClearRecentPlaces } from "@/hooks/useRecentPlaces";
import { useAllNotes, type PlaceNote } from "@/hooks/useNotes";
import { useAllSavedTags } from "@/hooks/useSavedTags";
import { useBeenList } from "@/hooks/useBeenHere";
// A2.8: SavedList no longer static-imports clientPlaceBySlug, so
// /saved's client bundle no longer ships places-client.json (~2MB).
// Place data is hydrated via /api/places/by-slugs on mount.
import type { PlaceCardData } from "@/lib/loaders/places";
import { EVENT_BY_SLUG } from "@/data/events";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import AppMapClient from "@/components/map/AppMapClient";
import ShareButton from "@/components/place/ShareButton";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import Link from "next/link";
import { Bookmark, MapPin, Sparkles, Calendar, Building2, Route , ArrowRight } from "lucide-react";
import IconStamp from "@/components/ui/IconStamp";
import Skeleton from "@/components/ui/Skeleton";
import SortDropdown, { type SortOption } from "@/components/ui/SortDropdown";
import FilterChip from "@/components/ui/FilterChip";
import { isOpenNow } from "@/lib/hours";
import { haversineMeters } from "@/lib/geo";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";
import { isEventToday } from "@/lib/eventWhenLabel";

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
const SAVED_VIEW_STORAGE_KEY = "fr.saved-view";

// Deterministic per-town accent so each town reads as its own colored
// "chapter" of the field guide (matches the town grid on /places).

/**
 * Build a /plan share token from a set of saved place slugs — the same
 * PlanSpec the planner's shared-plan path decodes (`{ v:1, i, s:[{p}] }`,
 * URL-safe base64 of JSON). Mirrored here ON PURPOSE: importing
 * planner.ts would drag the ~2MB client place index into the Saved bundle
 * (see the by-slugs note at the top of this file). Keep in sync with
 * encodeSpec/PlanSpec in src/lib/integrations/planner.ts. `reconstructPlan`
 * preserves stop ORDER, so the slugs go in the order we want them walked.
 */
function planTokenFromSaved(slugs: string[]): string {
  const spec = {
    v: 1,
    i: { audience: "friends", vibe: "easy", duration_hours: 4 },
    s: slugs.map((p) => ({ p })),
  };
  const json = JSON.stringify(spec);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** "21:00" → "9 PM" for the open-until label. Returns null on a bad value so
 *  the caller can fall back to a plain "Open now". */
function fmtClock(hhmm?: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const mer = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${mer}` : `${h12}:${String(m).padStart(2, "0")} ${mer}`;
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

export default function SavedList() {
  const mounted = useMounted();
  const items = useSavedList();
  // ── Split-store fix (experience review, save-loop finding #1). Signed-in
  // saves are written to the DB (useToggleFollow) while `items` is
  // localStorage-only, so this page silently omitted DB follows: save on the
  // place page, open Saved, gone (and a second device showed nothing). Every
  // OTHER consumer (AppMap, FromYourSaved, PlanBuilder) already reads the
  // auth-aware truth via useFollowedSlugs — merge it here too. When signed in
  // and hydrated, DB membership WINS (an unfollow on another device removes
  // the card here); saved_at keeps the local ref's stamp when we have it,
  // else epoch (sorts oldest under "Recent": honest, we don't know when).
  // While hydrating, and for anonymous users, local refs pass through
  // untouched. Events and radii stay device-local by contract.
  const { slugs: followedSlugs, loading: followsLoading, authed: followsAuthed } = useFollowedSlugs();
  const placeRefsAll = useMemo<SavedRef[]>(() => {
    const local = items.filter((i) => i.type === "place");
    if (!followsAuthed || followsLoading) return local;
    const bySlug = new Map(local.map((i) => [i.id, i]));
    return [...followedSlugs].map(
      (slug) => bySlug.get(slug) ?? { type: "place" as const, id: slug, saved_at: "1970-01-01T00:00:00.000Z" },
    );
  }, [items, followedSlugs, followsAuthed, followsLoading]);
  // Soft signal — slugs the user has opened (PlaceSheet) but maybe
  // never bookmarked. Filtered to slugs still in the client place
  // index and to ones not already in the explicit Saved set so the
  // section never duplicates a card the user has already bookmarked.
  const recentSlugs = useRecentPlaces();
  const clearRecent = useClearRecentPlaces();
  // The user's own margin notes ("great patio, ask for Maria") keyed by slug.
  const notes = useAllNotes();
  // Places the user tapped "Been here" on (the visited list). Same per-device
  // localStorage + useSyncExternalStore store as notes/saved, so toggling on a
  // place page updates the Visited section here live.
  const beenSlugs = useBeenList();
  // The user's personal lists ("date night", "takeout") keyed by slug, plus the
  // currently selected list filter (null = show all).
  const savedTags = useAllSavedTags();
  const [activeList, setActiveList] = useState<string | null>(null);

  // Union of every slug this component might need: saved bookmarks,
  // recently viewed, and the empty-state seeds. We hand the whole set
  // to /api/places/by-slugs in a single request and hydrate from the
  // returned map. slugsKey is a primitive string so React's effect
  // identity check is reference-stable across renders.
  const { slugsToFetch, slugsKey } = useMemo(() => {
    const set = new Set<string>();
    for (const i of placeRefsAll) set.add(i.id);
    for (const s of recentSlugs) set.add(s);
    // Noted places too — a note can exist on a place the user never bookmarked,
    // and its card must still resolve for the Notes section.
    for (const s of Object.keys(notes)) set.add(s);
    // Visited places too — "been here" can be set on a place that was never
    // saved or noted, and its card must still resolve for the Visited section.
    for (const s of beenSlugs) set.add(s);
    const slugsToFetch = Array.from(set);
    return { slugsToFetch, slugsKey: slugsToFetch.join(",") };
  }, [placeRefsAll, recentSlugs, notes, beenSlugs]);

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

  // List vs map view of the Places section. Persisted like the sort so a user
  // who prefers the map lands on it next time. The Mapbox canvas only mounts in
  // map view (AppMapClient dynamic-imports AppMap), so list-view visitors never
  // pay the map JS.
  const [view, setView] = useState<"list" | "map">("list");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SAVED_VIEW_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage hydration of a view preference; SSR can't read it
      if (v === "map") setView("map");
    } catch {
      /* ignore */
    }
  }, []);
  function setViewAndStore(next: "list" | "map") {
    setView(next);
    try {
      window.localStorage.setItem(SAVED_VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // Past saved events are kept (you saved them) but tucked behind a toggle so a
  // months-old show never clutters the upcoming list.
  const [showPast, setShowPast] = useState(false);

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

  // Places the user has written a margin note on, freshest note first. Resolves
  // each note's slug against the hydrated place map; a note whose place didn't
  // resolve is simply skipped (never a broken card).
  const notedPlaces = useMemo<Array<{ place: PlaceCardData; note: PlaceNote }>>(() => {
    if (!placesBySlug) return [];
    return Object.entries(notes)
      .map(([slug, note]) => ({ place: placesBySlug.get(slug), note }))
      .filter((x): x is { place: PlaceCardData; note: PlaceNote } => Boolean(x.place))
      .sort((a, b) => (b.note.updated_at || "").localeCompare(a.note.updated_at || ""));
  }, [notes, placesBySlug]);

  // Places the user has marked "been here." Resolves each visited slug against
  // the hydrated map; un-deduped from Saved/Notes on purpose — "I saved it",
  // "I noted it", and "I've been" are distinct, so a place can honestly appear
  // in more than one section.
  const visitedPlaces = useMemo<PlaceCardData[]>(() => {
    if (!placesBySlug) return [];
    return beenSlugs
      .map((slug) => placesBySlug.get(slug))
      .filter((p): p is PlaceCardData => Boolean(p));
  }, [beenSlugs, placesBySlug]);

  // One render-stable "now" for the actionable lead (open-now + today's events).
  // A single value per mount is plenty — Saved isn't a live ticker.
  const now = useMemo(() => new Date(), []);

  // ── ON NOW IN YOUR RADIUS — the actionable lead. Saved places OPEN right now
  // (closing-soonest first, so the page reads as a "go" tool, not an archive),
  // computed from open_status the by-slugs API already hydrates. Independent of
  // the sort/list filter below — this is always "what of mine is live now".
  const liveNowPlaces = useMemo<PlaceCardData[]>(() => {
    if (!placesBySlug) return [];
    const open = placeRefsAll
      .map((i) => placesBySlug.get(i.id))
      .filter((p): p is PlaceCardData => p !== undefined && isOpenNow(p.open_status));
    return open.sort((a, b) => {
      const ca = a.open_status.state === "open" || a.open_status.state === "closing-soon" ? a.open_status.closesAt ?? "99:99" : "99:99";
      const cb = b.open_status.state === "open" || b.open_status.state === "closing-soon" ? b.open_status.closesAt ?? "99:99" : "99:99";
      return ca.localeCompare(cb);
    });
  }, [placeRefsAll, placesBySlug]);

  // Distinct personal lists across SAVED places, with counts, for the filter row.
  const availableLists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of placeRefsAll) {
      for (const t of savedTags[i.id] ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [placeRefsAll, savedTags]);

  // Derive the EFFECTIVE filter during render (not via a state-resetting effect):
  // if the selected label no longer exists (its last place was unlabeled or
  // unsaved), it resolves to null so the list can't get stuck showing nothing.
  const effectiveList =
    activeList && availableLists.some(([l]) => l === activeList) ? activeList : null;

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
    const placeRefs = placeRefsAll
      .map((i) => ({ ref: i, place: placesBySlug.get(i.id) }))
      .filter((x): x is { ref: typeof x.ref; place: PlaceCardData } => Boolean(x.place));

    // Personal-list filter: when a list is selected, keep only saved places
    // the user has labelled with it. Applied BEFORE sort + bucketing so every
    // view (town/category/flat) honours the filter.
    const visibleRefs = effectiveList
      ? placeRefs.filter((x) => (savedTags[x.place.slug] ?? []).includes(effectiveList))
      : placeRefs;

    // Apply the user's sort. "category" keeps the original recent-first
    // order before bucketing (so within each category, the freshest
    // saves still come first).
    let sorted: typeof placeRefs;
    switch (sort) {
      case "az":
        sorted = [...visibleRefs].sort((a, b) =>
          a.place.name.localeCompare(b.place.name, undefined, { sensitivity: "base" }),
        );
        break;
      case "open":
        // Open places first, the one closing soonest leading — the
        // saved list as a "right now" tool, not a museum. Closed and
        // unverified places keep their recency order below the fold.
        sorted = [...visibleRefs].sort((a, b) => {
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
        sorted = [...visibleRefs].sort((a, b) => {
          const da = homeOrigin && a.place.geom ? haversineMeters(homeOrigin, a.place.geom) : Infinity;
          const db = homeOrigin && b.place.geom ? haversineMeters(homeOrigin, b.place.geom) : Infinity;
          return da - db;
        });
        break;
      case "category":
      case "recent":
      default:
        sorted = [...visibleRefs].sort(
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
  }, [items, placeRefsAll, placesBySlug, sort, homeOrigin, savedTags, effectiveList]);

  // Saved events happening TODAY — the other half of the actionable lead. The
  // full Events section below keeps the whole saved set; this is just "tonight".
  const eventsToday = useMemo(
    () => events.filter((e) => isEventToday(e.starts_at, now)),
    [events, now],
  );

  // Saved-event hygiene: upcoming (soonest first) vs past (most-recent first).
  // A saved event whose end is behind us is "past" — kept, not deleted, but
  // demoted so it stops cluttering the active list.
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const up: DecoratedEvent[] = [];
    const pa: DecoratedEvent[] = [];
    for (const e of events) {
      const endMs = Date.parse(e.ends_at || e.starts_at);
      if (!Number.isNaN(endMs) && endMs < now.getTime()) pa.push(e);
      else up.push(e);
    }
    up.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    pa.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
    return { upcomingEvents: up, pastEvents: pa };
  }, [events, now]);

  // Shareable read-only "radius": the ordered saved PLACE slugs, encoded into a
  // /radius/shared link. Places only (events are time-bound; a shared list is a
  // "here's my Frederick" recommendation, which is about places).
  // SCOPED to the active personal list: sharing your "date night" list used to
  // ship your ENTIRE radius — the URL ignored the filter the screen showed.
  const scopedSlugs = useMemo(
    () =>
      placeRefsAll
        .map((i) => i.id)
        .filter((slug) => !effectiveList || (savedTags[slug] ?? []).includes(effectiveList)),
    [placeRefsAll, effectiveList, savedTags],
  );
  const shareUrl = useMemo(
    () => (scopedSlugs.length > 0 ? `/radius/shared?p=${scopedSlugs.map(encodeURIComponent).join(",")}` : null),
    [scopedSlugs],
  );
  // The missing bridge from "saved 20 places" to "planned my Saturday": when a
  // personal list is active, one tap builds an itinerary from THAT list.
  const listPlanHref = useMemo(
    () =>
      effectiveList && scopedSlugs.length >= 2
        ? `/plan?p=${planTokenFromSaved(scopedSlugs.slice(0, 6))}`
        : null,
    [effectiveList, scopedSlugs],
  );

  // Resolve recent slugs to PlaceCardData, drop ones now-saved (the
  // "Saved" sections already surface them) and ones not in the place
  // index. Capped to 6 so the row stays scannable.
  const savedSlugs = useMemo(
    () => new Set(placeRefsAll.map((i) => i.id)),
    [placeRefsAll],
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

  // Notes OR visited places alone are enough to skip the blank-journal empty
  // state — a user can annotate or mark "been here" without bookmarking.
  // (placesBySlug is resolved by here, so both lists are final — no flash.)
  if (items.length === 0 && placeRefsAll.length === 0 && notedPlaces.length === 0 && visitedPlaces.length === 0) return <EmptyState />;

  // Cluster signal: if ≥3 places are in one town, suggest a route.
  const dominantTown = [...townTally.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])[0];
  const dominantMuni = dominantTown
    ? MUNICIPALITY_BY_SLUG[dominantTown[0]]
    : null;

  // Plan a day from the cluster: the dominant town's saved places (cap 6 — a
  // day out, not a march), encoded into the planner's shared-plan token so
  // /plan rebuilds them into a real itinerary. Order = current Places order.
  const planClusterSlugs = dominantTown
    ? (byTown.get(dominantTown[0]) ?? []).slice(0, 6).map((p) => p.slug)
    : [];
  const planHref =
    planClusterSlugs.length >= 2 ? `/plan?p=${planTokenFromSaved(planClusterSlugs)}` : "/plan";

  return (
    <div className="space-y-4">
      {/* ── ON NOW IN YOUR RADIUS — the actionable lead. Turns the archive into
          a "what can I do with my saves right now" tool: saved places open this
          minute (closing-soonest first, deal hook if they have one) and saved
          events happening today. Self-hides when nothing of yours is live, so a
          quiet day opens on the At-a-glance briefing as before. */}
      {(liveNowPlaces.length > 0 || eventsToday.length > 0) && (
        <section
          aria-label="On now in your radius"
          className="space-y-2.5 rounded-[var(--app-radius-lg)] border p-3.5"
          style={{
            borderColor: "color-mix(in srgb, var(--app-brand) 30%, var(--app-border))",
            background: "color-mix(in srgb, var(--app-brand) 5%, var(--app-bg-elevated))",
            boxShadow: "var(--app-elev-1), var(--app-hi)",
          }}
        >
          <header className="flex items-center gap-2 px-0.5">
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-2)" }}>
              On now in your radius
            </h2>
            <span className="ml-auto font-mono text-[10.5px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {[liveNowPlaces.length > 0 ? `${liveNowPlaces.length} open` : null, eventsToday.length > 0 ? `${eventsToday.length} today` : null].filter(Boolean).join(" · ")}
            </span>
          </header>

          {liveNowPlaces.length > 0 && (
            <ul className="space-y-1.5">
              {liveNowPlaces.slice(0, 4).map((p) => {
                const closing = p.open_status.state === "closing-soon";
                const till = p.open_status.state === "open" || p.open_status.state === "closing-soon" ? fmtClock(p.open_status.closesAt) : null;
                const townName = MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? null;
                return (
                  <li key={p.slug}>
                    <Link
                      href={`/places/${p.slug}`}
                      className="tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2"
                      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                          {p.name}
                        </span>
                        <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.04em]" style={{ color: closing ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>
                          {closing ? "Closing soon" : till ? `Open till ${till}` : "Open now"}
                          {townName ? ` · ${townName}` : ""}
                        </span>
                      </span>
                      {p.deal_hook && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.04em]"
                          style={{ background: "color-mix(in srgb, var(--app-accent) 18%, transparent)", color: "var(--app-accent-press)" }}
                        >
                          {p.deal_hook}
                        </span>
                      )}
                      <span aria-hidden className="shrink-0 text-[12px] font-bold" style={{ color: "var(--app-ink-3)" }}>→</span>
                    </Link>
                  </li>
                );
              })}
              {liveNowPlaces.length > 4 && (
                <li className="px-0.5 pt-0.5 font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
                  +{liveNowPlaces.length - 4} more open, in Places below
                </li>
              )}
            </ul>
          )}

          {eventsToday.length > 0 && (
            <ul className="space-y-1.5">
              {eventsToday.slice(0, 3).map((e) => (
                <li key={`${e.slug}-${e.starts_at}`}>
                  <Link
                    href={`/events/${e.slug}`}
                    className="tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2"
                    style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}
                  >
                    <Calendar className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                        {e.title}
                      </span>
                      <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.04em]" style={{ color: "var(--app-brand-press)" }}>
                        Today{e.venue_name ? ` · ${e.venue_name}` : ""}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-[12px] font-bold" style={{ color: "var(--app-ink-3)" }}>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
            {/* The eyebrow + serif summary below are the masthead; the brand
                icon-pill that used to lead here fought the quiet 3px-rule
                eyebrows on every section below it. Radial bloom kept. */}
            <p
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              At a glance
            </p>
            {/* Share your radius — turns a private list into a "here's my
                Frederick" recommendation a friend can open. Places only. */}
            {shareUrl && (
              <ShareButton
                title="My Frederick radius"
                text="Places I'm keeping an eye on in Frederick County"
                url={shareUrl}
                className="tap-44 ml-auto inline-flex items-center gap-1 text-[12px] font-semibold transition active:scale-95"
              />
            )}
          </div>
          <p
            className="font-serif text-[20px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {summarySentence(places.length, events.length, townTally.size)}
          </p>
          {/* Stat-pill scoreboard removed: the serif summary sentence above
              already states places/towns/events in prose, and the section +
              chapter headers carry per-group counts. Pills repeated the same
              numbers up to five times and read as a SaaS dashboard widget. */}
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Saved on this device
          </p>
        </div>
      </section>

      {/* Personal lists filter — the user's own labels ("date night",
          "takeout") become one-tap collections. Only shows once at least one
          saved place has been labelled (on the place page). */}
      {availableLists.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip label="All" active={effectiveList === null} onClick={() => setActiveList(null)} />
          {availableLists.map(([label, n]) => (
            <FilterChip
              key={label}
              label={label}
              count={n}
              active={effectiveList === label}
              onClick={() => setActiveList(effectiveList === label ? null : label)}
            />
          ))}
          {listPlanHref && (
            <Link
              href={listPlanHref}
              className="tap-44-y ml-auto inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              Plan this list
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          )}
        </div>
      )}

      {/* Smart suggestion strip — only when there's a real cluster. */}
      {dominantMuni && (
        <Link
          href={planHref}
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
              Plan a day in {dominantMuni.name}
            </span>
            <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {dominantTown![1]} of your saves are here. Turn them into a route →
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
            </div>
            <div className="flex items-center gap-2">
              {/* List ↔ map view of your saved places. */}
              <div
                role="tablist"
                aria-label="View saved places as a list or map"
                className="inline-flex rounded-full border p-0.5"
                style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
              >
                {(["list", "map"] as const).map((v) => {
                  const active = view === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setViewAndStore(v)}
                      className="tap-44-y flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
                      style={{
                        background: active ? "var(--app-bg-elevated)" : "transparent",
                        color: active ? "var(--app-ink)" : "var(--app-ink-3)",
                        boxShadow: active ? "var(--app-edge), var(--app-hi)" : "none",
                      }}
                    >
                      {v === "map" && <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
                      {v === "list" ? "List" : "Map"}
                    </button>
                  );
                })}
              </div>
              {view === "list" && (
                <SortDropdown
                  options={SORT_OPTIONS}
                  value={sort}
                  onChange={setSortAndStore}
                />
              )}
            </div>
          </header>
          {view === "map" ? (
            (() => {
              const mapPlaces = places.filter((p) => p.geom);
              return mapPlaces.length > 0 ? (
                <div
                  className="relative h-[60vh] min-h-[360px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <AppMapClient places={mapPlaces} fullBleed />
                </div>
              ) : (
                <p
                  className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[13px]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
                >
                  None of your saved places have a location to map yet.
                </p>
              );
            })()
          ) : sort === "town" || sort === "category" ? (
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

      {/* Your notes — the user's own margin notes on places. A naturalist's
          jottings ("great patio, ask for Maria"), shown under each place as an
          accent-ruled note. Distinct from the verified Field Notes moat. */}
      {notedPlaces.length > 0 && (
        <section aria-label="Your notes" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-accent)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-accent-press)" }}
            >
              Your notes
            </h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {notedPlaces.length}
            </span>
          </header>
          <ul className="space-y-2.5">
            {notedPlaces.map(({ place, note }) => (
              <li key={place.slug} className="space-y-1">
                <PlaceCard place={place} />
                <p
                  className="ml-3 border-l-2 pl-2.5 font-serif text-[13px] italic leading-snug"
                  style={{ borderColor: "var(--app-accent)", color: "var(--app-ink-2)" }}
                >
                  {note.text}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Visited — places the user tapped "Been here" on, from the place page.
          Same calm slate accent as the toggle; a plain noun header to sit
          alongside Places / Your notes / Events. */}
      {visitedPlaces.length > 0 && (
        <section aria-label="Visited" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-cool)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-cool)" }}
            >
              Visited
            </h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {visitedPlaces.length}
            </span>
          </header>
          <ul className="space-y-2.5">
            {visitedPlaces.map((place) => (
              <li key={place.slug}>
                <PlaceCard place={place} />
              </li>
            ))}
          </ul>
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
            {pastEvents.length > 0 && (
              <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {upcomingEvents.length} upcoming
              </span>
            )}
          </header>
          {upcomingEvents.length > 0 ? (
            <ul className="space-y-2">
              {upcomingEvents.map((e: DecoratedEvent) => (
                <li key={`${e.slug}-${e.starts_at}`}>
                  <EventCard event={e} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-0.5 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              Nothing upcoming. Your saved shows have all passed.
            </p>
          )}

          {/* Past saved events — kept, but tucked behind a toggle. */}
          {pastEvents.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="tap-44 text-[11px] font-semibold underline-offset-2 hover:underline"
                style={{ color: "var(--app-ink-3)" }}
                aria-expanded={showPast}
              >
                {showPast ? "Hide" : "Show"} {pastEvents.length} past event{pastEvents.length === 1 ? "" : "s"}
              </button>
              {showPast && (
                <ul className="space-y-2 opacity-70">
                  {pastEvents.map((e: DecoratedEvent) => (
                    <li key={`${e.slug}-${e.starts_at}`}>
                      <EventCard event={e} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function summarySentence(placeN: number, eventN: number, townN: number): string {
  if (placeN === 0 && eventN === 0) return "Nothing saved yet, but you've started your field guide.";
  const parts: string[] = [];
  if (placeN > 0) parts.push(`${placeN} place${placeN === 1 ? "" : "s"}`);
  if (eventN > 0) parts.push(`${eventN} event${eventN === 1 ? "" : "s"}`);
  let body = parts.join(" and ");
  if (placeN > 0 && townN > 1) body += ` across ${townN} town${townN === 1 ? "" : "s"}`;
  return `${body} in your field guide.`;
}

/**
 * EmptyState — a field-guide "blank journal page," not a bare list. It reads
 * as the FIRST page of a guide you're about to fill: a contour-plate hero with
 * the journal metaphor, the three things this page collects for you (places /
 * events / routes — what saving is FOR, taught with engraved-glyph stamps),
 * and four confident doorways to the surfaces that fill it. The old curated
 * "Worth starting with" seed grid is gone (owner call) — the value is taught,
 * not pre-stuffed, so the page sets itself apart from a generic favorites bin.
 */
function EmptyState() {
  // What this page keeps for you — the value, in the field-guide's own terms.
  const KEEPS: { Icon: typeof Bookmark; color: string; title: string; desc: string }[] = [
    { Icon: MapPin, color: "var(--app-brand)", title: "Places", desc: "The taproom, trail, or table you mean to get to." },
    { Icon: Calendar, color: "var(--app-accent)", title: "Events", desc: "Shows and happenings worth the trip." },
    { Icon: Route, color: "var(--app-cool)", title: "Routes", desc: "String saved stops into one good day out." },
  ];
  // Four confident doorways — the lane language from /places, pointing at the
  // surfaces that fill this page. A guided launchpad, not a paragraph.
  const LANES: { href: string; label: string; Icon: typeof Bookmark; color: string }[] = [
    { href: "/today", label: "Find", Icon: Sparkles, color: "var(--app-brand)" },
    { href: "/map", label: "Map", Icon: MapPin, color: "var(--app-cool)" },
    { href: "/events", label: "Events", Icon: Calendar, color: "var(--app-accent)" },
    { href: "/towns", label: "Towns", Icon: Building2, color: "var(--app-civic)" },
  ];

  return (
    <div className="space-y-5">
      {/* Blank-journal hero — a field-guide page waiting to be filled. The
          contour plate bleeds off the corner (the same specimen-plate mark the
          page header uses); a stamp + serif line set the journal metaphor. */}
      <section
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5"
        style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
      >
        <div className="relative max-w-[19rem] space-y-2.5">
          <IconStamp accent="var(--app-brand)" size="md">
            <Bookmark aria-hidden />
          </IconStamp>
          <h2 className="font-serif text-[22px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            Your Frederick field guide, blank for now
          </h2>
          <p className="text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            Tap the bookmark on any place or event and it lives here, grouped by town and ready to turn into a plan.
          </p>
        </div>
      </section>

      {/* What you'll keep here — the value, three engraved-glyph rows. */}
      <ul className="space-y-2">
        {KEEPS.map(({ Icon, color, title, desc }) => (
          <li
            key={title}
            className="flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5"
            style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}
          >
            <IconStamp accent={color} size="sm">
              <Icon aria-hidden />
            </IconStamp>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{title}</p>
              <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{desc}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Start here — four doorways to the surfaces that fill this page. */}
      <section className="space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
          Start here
        </p>
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
      </section>
    </div>
  );
}

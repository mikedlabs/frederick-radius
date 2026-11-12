"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Coffee,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Martini,
  Grape,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Music,
  FerrisWheel,
  Wine,
  BedDouble,
  Sparkles,
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
  Flag,
  Tractor,
  Film,
  Waves,
  Scissors,
  ArrowLeft,
  Navigation,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import FilterChip from "@/components/ui/FilterChip";
import { commitLocationScope } from "@/components/nav/locationScopeNavigation";
import { navigateAfterHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import styles from "./RightNow.module.css";
import { nearbyParksRows } from "@/lib/nearby-parks-layout";
import {
  CRAVINGS,
  CRAVING_BY_KEY,
  matchesCraving,
  matchesCravingFacet,
} from "@/data/cravings";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { cuisinesOf, cuisineLabel } from "@/lib/cuisine";
import { mealForKey, matchMeal } from "@/lib/meal";
import { useGeolocation } from "@/hooks/useGeolocation";
import { formatDistance, haversineMeters, isInFrederickCountyArea } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { mayAssertNoneOpen } from "@/lib/hours-availability";
import {
  keepListedRows,
  nearbyCountSentence,
  OPEN_NOW_NEARBY_RADIUS_M,
  OPEN_NOW_THIN_COUNT,
  openNowThinNote,
} from "@/lib/nearby-summary";
import { haptic } from "@/lib/haptics";
import { scopeLabel, subscribeScopeChange, scopeTownSlug, type DecisionOriginSource, type Scope } from "@/lib/scope";
import {
  canUseOriginForRanking,
  compareRightNowCandidates,
  resolveRightNowAvailabilityMode,
  rightNowHasOpenTier,
  rightNowOrderSentence,
  type RightNowAvailabilityMode,
} from "@/lib/right-now-ranking";
import { useSavedList } from "@/hooks/useSaved";
import { useBeenList } from "@/hooks/useBeenHere";
import {
  changeNearbyQuery,
  hasNearbyCategoryBackStep,
  NEARBY_CATEGORY_HISTORY_KEY,
  nearbyHistoryState,
  nearbyQueryHref,
  nearbySupportsHours,
  NEARBY_FOOD_FACET_EXCLUDE,
  readNearbyQuery,
  type NearbyQueryState,
} from "@/lib/nearby-query";

const subscribeReady = () => () => {};

function writeNearbyQuery(next: NearbyQueryState, mode: "push" | "replace" = "replace") {
  const href = nearbyQueryHref(window.location.href, next);
  if (!href || href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  const state = nearbyHistoryState(window.history.state);
  if (mode === "push") window.history.pushState({ ...state, [NEARBY_CATEGORY_HISTORY_KEY]: true }, "", href);
  else window.history.replaceState(state, "", href);
}

/**
 * RightNow — the one-tap craving answer.
 *
 * The whole interaction: a person standing on the sidewalk taps what they
 * want ("Ice cream"), and we answer with the NEAREST OPEN one from where
 * they're standing — no town picker, no filters, no map to pan. Say the
 * noun, get the closest open answer, go.
 *
 * Distance is honest: we only print "min walk / distance" when we actually
 * have the user's location. Without a valid town, device, or in-county IP
 * origin, results stay county-wide rather than silently ranking from Downtown.
 *
 * The area is the header's. This page has no chooser of its own: its empty
 * state's "Search the whole county" and its precise-location request both
 * write through `commitLocationScope`, the one area writer.
 */

// Keyed by the `icon` strings in src/data/cravings.ts. Every craving icon must
// have an entry here or the tile crashes ("Element type is invalid ... got
// undefined"); the `?? Utensils` fallback at the lookup sites is the safety net
// for any future craving whose icon lands here unmapped.
const ICONS: Record<string, LucideIcon> = {
  Coffee,
  Martini,
  Grape,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Music,
  FerrisWheel,
  Wine,
  BedDouble,
  Sparkles,
  // Newer craving icons (golf / farms / movies / pools / salons) — without these
  // the /nearby picker tile would fall back to the fork glyph.
  Flag,
  Tractor,
  Film,
  Waves,
  Scissors,
  // Meal-occasion glyphs (the time-aware lead from the /today I-want strip).
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
};

// ~80 m/min walking — same constant the reason chips use.
const WALK_M_PER_MIN = 80;

// Show up to this many matches. The old cap of 6 hid closed or farther-out
// downtown spots behind the open-first sort, so "where's all the ice cream /
// coffee?" looked incomplete. 16 surfaces effectively every in-town option
// while staying bounded; still sorted open-first then nearest.
const RESULT_LIMIT = 16;

// Keep the first screen useful instead of presenting all 20 intents at once.
// The complete vocabulary remains one tap away, but the most common decisions
// lead: eat, drink, get outside, hear music, shop, or find something for kids.
const PRIMARY_CRAVING_KEYS = new Set([
  "food",
  "coffee",
  "drinks",
  "ice-cream",
  "outside",
  "music",
  "shops",
  "family",
]);

function walkLabel(distance_m: number): string {
  const mins = Math.max(1, Math.round(distance_m / WALK_M_PER_MIN));
  if (mins <= 25) return `${mins} min walk`;
  const mi = distance_m / 1609;
  return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
}

export default function RightNow({
  places,
  initialScope = null,
  initialOriginSource = "none",
  approxOrigin = null,
  approxCity = null,
  approxStatus = "missing",
}: {
  places: PlaceCardData[];
  /** Shared browsing lens. County is a deliberate no-origin mode; near-me
   * may use device/IP; a town remains a hard municipality filter. */
  initialScope?: Scope | null;
  /** Source of the server-provided ranking seed. Saved home is deliberate;
   *  edge IP is coarse and must never trigger strict nearest-first. */
  initialOriginSource?: DecisionOriginSource;
  /** Coarse edge-IP origin used to rank BEFORE a precise device fix (never to
   *  print a distance). Null when out of area → Downtown default. */
  approxOrigin?: { lng: number; lat: number } | null;
  /** City label for the coarse location ("near Thurmont"). */
  approxCity?: string | null;
  /** Why edge-IP geo could not seed ranking, for honest fallback copy. */
  approxStatus?: "available" | "missing" | "outside-county";
}) {
  const { state, request } = useGeolocation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [storedScope, setStoredScope] = useState<Scope | null>(initialScope);
  // The address bar owns every meaningful selection. A same-URL sheet Back
  // therefore leaves the answer intact; a full-page return/reload reads it anew.
  const queryKey = searchParams.toString();
  const preferences = useMemo(
    () => readNearbyQuery(new URLSearchParams(queryKey), storedScope),
    [queryKey, storedScope],
  );
  const { cravingKey, facetKey, openOnly, closingSoonOnly, sort, scope } = preferences;
  const townKey = scopeTownSlug(scope);
  const [showAllCravings, setShowAllCravings] = useState(false);
  const interactionReady = useSyncExternalStore(subscribeReady, () => true, () => false);
  const filterId = useId();
  const filterHistoryId = `nearby-filters:${filterId}`;
  const filterOpenerRef = useRef<HTMLButtonElement | null>(null);
  const answerHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const applyPendingRef = useRef(false);
  const [filterDraft, setFilterDraft] = useState<NearbyQueryState | null>(null);
  const [applyingFilters, setApplyingFilters] = useState(false);
  const [filterFocusReturnHref, setFilterFocusReturnHref] = useState<string | undefined>();

  function openFilters() {
    setFilterFocusReturnHref(undefined);
    applyPendingRef.current = false;
    setApplyingFilters(false);
    setFilterDraft(readNearbyQuery(new URLSearchParams(window.location.search), storedScope));
  }

  function applyFilters(dismiss: () => void) {
    if (!filterDraft || applyPendingRef.current) return;
    const draft = filterDraft;
    // Open now lives outside the sheet, so applying the sheet never
    // overrides a chip change made while it was open.
    const patch = {
      facetKey: draft.facetKey,
      closingSoonOnly: draft.closingSoonOnly,
      sort: draft.sort,
    };
    const beforeClose = readNearbyQuery(new URLSearchParams(window.location.search), storedScope);
    // Focus belongs to the applied selection, not the old sheet URL. Freeze
    // the exact destination before traversal; later scope/category changes do
    // not inherit permission to receive this deferred focus return.
    setFilterFocusReturnHref(beforeClose.cravingKey === draft.cravingKey
      ? nearbyQueryHref(window.location.href, changeNearbyQuery(beforeClose, patch)) ?? undefined
      : undefined);
    applyPendingRef.current = true;
    setApplyingFilters(true);
    // The temporary sheet entry must leave first. Replacing its query would
    // make Back uncover the old filters underneath it and lose the selection.
    navigateAfterHistoryLayer(filterHistoryId, () => {
      const current = readNearbyQuery(new URLSearchParams(window.location.search), storedScope);
      if (current.cravingKey === draft.cravingKey) {
        writeNearbyQuery(changeNearbyQuery(current, patch));
      }
      applyPendingRef.current = false;
      dismiss();
    });
  }

  function updateQuery(patch: Partial<NearbyQueryState>, mode: "push" | "replace" = "replace") {
    const current = readNearbyQuery(new URLSearchParams(window.location.search), storedScope);
    writeNearbyQuery(changeNearbyQuery(current, patch), mode);
  }

  function clearLegacyHours() {
    updateQuery({ openOnly: false, closingSoonOnly: false });
    const trigger = filterOpenerRef.current;
    (trigger && trigger.getClientRects().length ? trigger : answerHeadingRef.current)?.focus({ preventScroll: true });
  }

  useEffect(() => {
    // Freeze a cookie-derived scope into the URL and normalize legacy town or
    // invalid filters before a detail sheet captures its exact return address.
    writeNearbyQuery(readNearbyQuery(new URLSearchParams(window.location.search), initialScope));
    return subscribeScopeChange((nextScope) => {
      setStoredScope(nextScope);
      const current = readNearbyQuery(new URLSearchParams(window.location.search), nextScope);
      writeNearbyQuery(changeNearbyQuery(current, { scope: nextScope }));
    });
  }, [initialScope]);

  // The header owns the area. These two escapes (an empty town, a missing
  // precise fix) use the same writer, which stores the area and then brings
  // this page's own ?in= in line.
  function searchWholeCounty() {
    commitLocationScope("county", router);
  }

  function activateMyLocation() {
    if (scope !== "nearme") commitLocationScope("nearme", router);
    request();
  }
  const saved = useSavedList();
  const been = useBeenList();
  const savedPlaceSlugs = useMemo(
    () => new Set(saved.filter((item) => item.type === "place").map((item) => item.id)),
    [saved],
  );
  const visitedSlugs = useMemo(() => new Set(been), [been]);

  // A town-scoped distance is distance from the town centroid, not the user.
  // Never print it as if it came from the device.
  const hasFix = state.status === "granted" && !townKey && scope !== "county";
  const deviceOutsideCounty = state.status === "granted" && !isInFrederickCountyArea(
    state.position.lng,
    state.position.lat,
  );
  // A selected town is a deliberate lens and therefore outranks a device
  // fix. Sorting Thurmont results from a Frederick phone location made the
  // town scope technically filtered but locally wrong.
  // A server seed belongs to its original lens. In particular, switching
  // from a town to Near me must not reuse that town's centroid as a device/IP
  // approximation. A real IP seed remains useful across non-town scopes.
  const seedMatchesScope = initialOriginSource === "ip" || scope === initialScope;
  const usableApproxOrigin = seedMatchesScope ? approxOrigin : null;
  const usableApproxCity = seedMatchesScope && scope !== "county" ? approxCity : null;
  const origin = useMemo(() => {
    if (townKey) return MUNICIPALITY_BY_SLUG[townKey]?.centroid ?? null;
    if (scope === "county") return null;
    return state.status === "granted"
      ? { lng: state.position.lng, lat: state.position.lat }
      : usableApproxOrigin;
  }, [state, usableApproxOrigin, townKey, scope]);
  // A device fix or a town the visitor deliberately chose can support a
  // literal nearest-first sort. The coarse network/IP centroid is useful for
  // regional framing only; treating it as precise recreated the old
  // south-Frederick chain-first bug for people standing downtown.
  const rankingOriginSource: DecisionOriginSource = townKey
    ? "town"
    : scope === "county"
      ? "county"
      : state.status === "granted"
        ? "device"
        : usableApproxOrigin
          ? initialOriginSource
          : "none";
  const hasRankingOrigin = Boolean(origin) && canUseOriginForRanking(rankingOriginSource);

  // The selection is either a noun craving or a time-aware meal occasion
  // (breakfast/lunch/dinner/brunch/late, arrived at via the /today meal tile).
  // Both expose {key,label,color,icon}; the meal carries an honest framing
  // phrase and matches by category gate rather than a craving predicate.
  const meal = cravingKey ? mealForKey(cravingKey) : null;
  const craving = cravingKey && !meal ? CRAVING_BY_KEY[cravingKey] : null;
  const active = meal ?? craving;
  const parksExplorer = cravingKey === "outside";
  const supportsHours = nearbySupportsHours(cravingKey);
  const legacyHoursFilter = !supportsHours && (openOnly || closingSoonOnly);

  // Every place matching the craving/meal with NO facet yet — the basis for
  // the facet chips (which cuisines are actually nearby) and the open count.
  const cravingMatchedAll = useMemo(() => {
    const m = cravingKey ? mealForKey(cravingKey) : null;
    const c = cravingKey && !m ? CRAVING_BY_KEY[cravingKey] : null;
    const matchFn = m
      ? (p: PlaceCardData) => matchMeal(m, p)
      : c
        ? (p: PlaceCardData) => matchesCraving(c, p)
        : null;
    return matchFn ? places.filter(matchFn) : [];
  }, [cravingKey, places]);

  // The sub-filter chips. For a cuisine craving (Food) they're DERIVED from the
  // cuisines actually present in the matched set — top by count, county-wide —
  // so you can narrow to Mexican / Asian / BBQ / Seafood / etc. Otherwise the
  // craving's fixed facets (Drinks → Breweries/Bars, …). Meals get none.
  const facetDefs = useMemo<{ key: string; label: string }[]>(() => {
    if (craving?.cuisineFacets) {
      const counts = new Map<string, number>();
      for (const p of cravingMatchedAll) for (const slug of cuisinesOf(p)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
      const choices = [...counts.entries()]
        // Skip cuisines that have their OWN I-want tab (Coffee, Drinks, Sweets)
        // so the Food chips stay food-focused, and one-offs so they're meaningful.
        .filter(([slug, n]) => n >= 2 && !NEARBY_FOOD_FACET_EXCLUDE.has(slug))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([slug]) => ({ key: slug, label: cuisineLabel(slug) }));
      // A valid shared/return facet stays visible even if it is no longer one
      // of the eight most common cuisines in the current catalog snapshot.
      if (facetKey && !choices.some((choice) => choice.key === facetKey)) {
        choices.push({ key: facetKey, label: cuisineLabel(facetKey) });
      }
      return choices;
    }
    return (craving?.facets ?? []).map((f) => ({ key: f.key, label: f.label }));
  }, [craving, cravingMatchedAll, facetKey]);

  // The narrowest active noun for copy: the chosen facet ("pizza") if set, else
  // the craving/meal label ("food").
  const activeNoun = (facetDefs.find((f) => f.key === facetKey)?.label ?? active?.label ?? "").toLowerCase();
  const clearHoursNoun = parksExplorer && !facetKey ? "outdoor places" : activeNoun;

  // The requested policy comes from the craving vocabulary. Existing intents
  // without an explicit policy retain their established required-hours
  // behavior whenever the result set has enough current-hours coverage.
  const requestedAvailability: RightNowAvailabilityMode = craving?.alwaysOpen
    ? "not-applicable"
    : craving?.availability ?? "required";

  // The craving set narrowed by the active facet and town, before ranking.
  // Hours coverage must be measured on this exact set before deciding whether
  // open-first is an honest ordering.
  const matchedUnsorted = useMemo(() => {
    const passFacet = (p: PlaceCardData): boolean => {
      if (!facetKey) return true;
      if (craving?.cuisineFacets) return cuisinesOf(p).includes(facetKey);
      const f = craving?.facets?.find((x) => x.key === facetKey);
      return f ? matchesCravingFacet(f, p) : true;
    };
    return cravingMatchedAll
      .filter(passFacet)
      .filter((p) => !townKey || p.municipality === townKey)
      .map((p) => {
        const dist = origin ? haversineMeters(origin, p.geom) : Infinity;
        // Always-available cravings (lodging) count as open regardless of
        // verified hours — a hotel you can book any night must never be hidden
        // by the open-now gate just because its front-desk hours aren't posted.
        const open = Boolean(craving?.alwaysOpen) || isOpenNow(p.open_status);
        return { p, dist, open };
      });
  }, [
    cravingMatchedAll,
    craving,
    facetKey,
    townKey,
    origin,
  ]);

  // A zero count only means "closed" when enough of this set can state an
  // open or closed hour at all. Below that bar, hours become a soft signal;
  // unknown listings remain eligible and nearby relevance can lead.
  const mayReportNoneOpen = useMemo(
    () => mayAssertNoneOpen(matchedUnsorted.map((m) => m.p.open_status)),
    [matchedUnsorted],
  );
  const rankingAvailability = resolveRightNowAvailabilityMode(
    requestedAvailability,
    mayReportNoneOpen,
  );

  const matched = useMemo(
    () =>
      [...matchedUnsorted].sort((a, b) =>
        compareRightNowCandidates(a, b, sort, hasRankingOrigin, {
          savedSlugs: savedPlaceSlugs,
          visitedSlugs,
        }, rankingAvailability),
      ),
    [
      matchedUnsorted,
      sort,
      hasRankingOrigin,
      savedPlaceSlugs,
      visitedSlugs,
      rankingAvailability,
    ],
  );

  // A town with no verified in-town match should not become a blank page.
  // Keep the scope honest, then offer the three closest verified alternatives
  // measured from that town's centroid. This is deliberately separate from
  // `matched`: the header and count still say there are zero IN the town.
  const nearbyTownFallback = useMemo(() => {
    if (!townKey || matched.length > 0 || !origin) return [];
    const passFacet = (p: PlaceCardData): boolean => {
      if (!facetKey) return true;
      if (craving?.cuisineFacets) return cuisinesOf(p).includes(facetKey);
      const facet = craving?.facets?.find((candidate) => candidate.key === facetKey);
      return facet ? matchesCravingFacet(facet, p) : true;
    };
    return cravingMatchedAll
      .filter(passFacet)
      .filter((place) => place.municipality !== townKey)
      .map((place) => ({
        place,
        distance: haversineMeters(origin, place.geom),
        open: Boolean(craving?.alwaysOpen) || isOpenNow(place.open_status),
      }))
      .sort((a, b) =>
        compareRightNowCandidates(
          { p: a.place, dist: a.distance, open: a.open },
          { p: b.place, dist: b.distance, open: b.open },
          "nearest",
          true,
          {},
          rankingAvailability,
        ),
      )
      .slice(0, 3)
      .map(({ place, distance }) => ({ place, distance }));
  }, [
    cravingMatchedAll,
    craving,
    facetKey,
    townKey,
    matched.length,
    origin,
    rankingAvailability,
  ]);

  const openCount = useMemo(() => matched.filter((m) => m.open).length, [matched]);
  // Open, but closing within the hour (getOpenStatus → "closing-soon"). Drives
  // the urgency chip + filter; closing-soon places are a subset of "open".
  const closingSoonCount = useMemo(
    () => matched.filter((m) => m.p.open_status.state === "closing-soon").length,
    [matched],
  );

  const draftClosingSoonCount = filterDraft
    ? cravingMatchedAll.filter((place) => {
        if (townKey && place.municipality !== townKey) return false;
        if (place.open_status.state !== "closing-soon") return false;
        if (!filterDraft.facetKey) return true;
        if (craving?.cuisineFacets) return cuisinesOf(place).includes(filterDraft.facetKey);
        const facet = craving?.facets?.find((candidate) => candidate.key === filterDraft.facetKey);
        return !facet || matchesCravingFacet(facet, place);
      }).length
    : closingSoonCount;

  // Open now must not leave one far result with nothing after it (the audit's
  // 6.2 mile dinner). "Nearby" is about three miles of a device fix, the whole
  // town for a town lens, and the whole set without an origin. When fewer than
  // OPEN_NOW_THIN_COUNT places there are confirmed open, the nearest places
  // stay listed under one plain line, and confirmed-open rows are marked.
  const openNearbyCount = useMemo(
    () => matched.filter((m) => m.open && (!hasFix || m.dist <= OPEN_NOW_NEARBY_RADIUS_M)).length,
    [matched, hasFix],
  );
  const openThin = openOnly && supportsHours && !closingSoonOnly &&
    openNearbyCount < OPEN_NOW_THIN_COUNT && matched.length > openNearbyCount;
  const closestOpenBeyond = useMemo(() => {
    if (!openThin || openNearbyCount > 0 || !hasFix) return null;
    const nearest = matched
      .filter((m) => m.open && Number.isFinite(m.dist))
      .sort((a, b) => a.dist - b.dist)[0];
    if (!nearest) return null;
    return {
      distance_m: nearest.dist,
      town: MUNICIPALITY_BY_SLUG[nearest.p.municipality ?? ""]?.name ?? nearest.p.city ?? null,
    };
  }, [openThin, openNearbyCount, hasFix, matched]);

  const results = useMemo(() => {
    const list = closingSoonOnly
      ? matched.filter((m) => m.p.open_status.state === "closing-soon")
      : openOnly && !openThin
        ? matched.filter((m) => m.open)
        : matched;
    // In the thin state the note counts the confirmed-open places nearby and
    // says they are marked in the list, so any the limit would cut are kept
    // (at most OPEN_NOW_THIN_COUNT - 1 extra rows), in list order.
    const shown = openThin
      ? keepListedRows(list, RESULT_LIMIT, (m) => m.open && (!hasFix || m.dist <= OPEN_NOW_NEARBY_RADIUS_M))
      : list.slice(0, RESULT_LIMIT);
    return (
      shown
        // Attach distance for the card ONLY when we have a real fix — never
        // print a distance measured from a place the user isn't standing at.
        .map(({ p, dist }) => ({ ...p, distance_m: hasFix ? dist : undefined }))
    );
  }, [matched, openOnly, openThin, closingSoonOnly, hasFix]);

  const parksRows = useMemo(() => parksExplorer ? nearbyParksRows(results) : [], [parksExplorer, results]);

  function pick(key: string) {
    haptic("light");
    // Category choices are Back destinations; refinements replace that entry.
    updateQuery({ cravingKey: key }, "push");
  }

  // ── Craving picker (the front door) ──
  if (!active) {
    const visibleCravings = showAllCravings
      ? CRAVINGS
      : CRAVINGS.filter((candidate) => PRIMARY_CRAVING_KEYS.has(candidate.key));

    return (
      <div className="space-y-5" data-nearby-interaction-ready={interactionReady ? "true" : "false"}>
        <header className="space-y-1.5" aria-describedby="nearby-intro">
          <h1
            className="font-sans text-[26px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Find something nearby
          </h1>
          <p id="nearby-intro" className="text-[14px]" style={{ color: "var(--app-ink-3)" }}>
            Choose what you need to find.
          </p>
        </header>

        <ul
          className="grid grid-cols-2 overflow-hidden border-y"
          style={{ borderColor: "var(--app-border)" }}
        >
          {visibleCravings.map((c) => {
            const Icon = ICONS[c.icon] ?? Utensils;
            return (
              <li
                key={c.key}
                className="border-b odd:border-r"
                style={{ borderColor: "var(--app-border)" }}
              >
                <button
                  type="button"
                  onClick={() => pick(c.key)}
                  className="tactile-interactive flex min-h-[60px] w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-[var(--app-bg-sunken)]"
                >
                  <span
                    aria-hidden
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]"
                    style={{
                      background: `color-mix(in srgb, ${c.color} 14%, var(--app-bg-elevated-solid))`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.color} 20%, transparent)`,
                    }}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} style={{ color: c.color }} />
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {c.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {!showAllCravings && (
          <button
            type="button"
            onClick={() => setShowAllCravings(true)}
            className="tactile-interactive flex min-h-[44px] w-full items-center justify-center border-b text-[13px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
          >
            Show all {CRAVINGS.length} options
          </button>
        )}
      </div>
    );
  }

  // ── The answer (nearest open of the chosen craving / meal occasion) ──
  const townName = townKey ? (MUNICIPALITY_BY_SLUG[townKey]?.name ?? null) : null;
  // The heading reflects what you actually picked: the active facet ("Thrift &
  // vintage") when one is set, otherwise the craving/meal ("Shops"). Without
  // this, arriving from a Today sub like Shop → Thrift still read "Shops".
  const headingNoun = facetDefs.find((f) => f.key === facetKey)?.label ?? active.label;
  // The thin Open now state lists the full matched set, so the open-first
  // tier applies to it exactly as it does with Open now off.
  const openFirst = (!openOnly || openThin) && !craving?.alwaysOpen &&
    rightNowHasOpenTier(rankingAvailability, hasRankingOrigin);
  const orderSentence = rightNowOrderSentence(sort, hasRankingOrigin, {
    openFirst,
    closedLast: !openFirst && results.some((place) => place.open_status.state === "closed"),
  });
  const countSentence = nearbyCountSentence({
    mode: legacyHoursFilter
      ? "legacy-filter"
      : !supportsHours
        ? "no-hours"
        : closingSoonOnly
          ? "closing-soon"
          : openOnly && !openThin
            ? "open-only"
            : "hours",
    total: matched.length,
    openCount: closingSoonOnly ? closingSoonCount : openCount,
    mayReportNoneOpen,
    phrase: meal?.phrase,
  });
  const summary = matched.length === 0
    ? `No places ${townName ? `in ${townName}` : "in the county"} match.`
    : `${orderSentence} ${countSentence}`;
  const thinArea = townName ? `in ${townName}` : hasFix ? "nearby" : "in the county";
  // Open now sits outside the sheet, so the sheet's badge counts only what
  // the sheet itself holds.
  const activeFilterCount = Number(Boolean(facetKey)) + Number(closingSoonOnly) + Number(sort !== "smart");
  const areaLabel = scope === "county"
    ? "across Frederick County"
    : townName
      ? `in ${townName}`
    : hasFix
      ? deviceOutsideCounty
        ? "in Frederick County, nearest to you"
        : "near you"
      : usableApproxOrigin
        ? usableApproxCity
          ? `approximately near ${usableApproxCity}`
          : "approximately within Frederick County"
        : "across Frederick County";
  return (
    <div className={`space-y-4 ${parksExplorer ? styles.parksExplorer : ""}`}
      data-nearby-interaction-ready={interactionReady ? "true" : "false"}>
      <header className={styles.answerHeader}>
        {/* The cravings live on /today now (the "I want…" grid), so the
            answer's back affordance returns there rather than swapping to a
            duplicate on-page picker. */}
        <button
          type="button"
          onClick={() => {
            let sameOriginReferrer = false;
            try {
              sameOriginReferrer = Boolean(document.referrer) &&
                new URL(document.referrer).origin === window.location.origin;
            } catch {
              sameOriginReferrer = false;
            }
            if (hasNearbyCategoryBackStep(window.history.state) || (sameOriginReferrer && window.history.length > 1)) {
              window.history.back();
            } else {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/today");
            }
          }}
          className={styles.back}
          data-press-target="secondary"
        >
          <span data-press-face>
            <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
            <span className="sr-only">Back</span>
          </span>
        </button>
        <div className={styles.answerHeading}>
          <h1
            ref={answerHeadingRef}
            tabIndex={-1}
            className={styles.answerTitle}
            style={{ color: "var(--app-ink)" }}
          >
            {headingNoun} {areaLabel}
          </h1>
          {/* The order the list really shows, then the counts as supporting
              detail. Meals frame the count on the clock fact ("open for
              dinner"), never a service claim. */}
          <p className={styles.answerSummary} data-nearby-summary>
            {summary}
          </p>
        </div>
      </header>

      {legacyHoursFilter && <aside className={styles.legacyHours} data-nearby-legacy-hours-filter role="status">
        <p>This link filters for confirmed hours. {parksExplorer
          ? "Visiting hours are not listed for every outdoor place."
          : "Hours are not listed for every place."}</p>
        <button type="button" onClick={clearLegacyHours}>
          Show all matching {clearHoursNoun}
        </button>
      </aside>}

      <div className={styles.filterDock} data-nearby-filter-dock>
        <div className={styles.quickFilters}>
          {supportsHours && (
            <FilterChip label="Open now" active={openOnly} onClick={() => updateQuery({ openOnly: !openOnly })} />
          )}
          <p className={styles.filterSummary}>
            {[
              facetDefs.find((facet) => facet.key === facetKey)?.label ?? (facetDefs.length > 0 ? "All types" : "All places"),
              closingSoonOnly ? "Closing soon" : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          ref={filterOpenerRef}
          type="button"
          onClick={openFilters}
          aria-label="Filters & sort"
          aria-haspopup="dialog"
          aria-expanded={filterDraft !== null}
          className={styles.filterTrigger}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
          <span>Filters &amp; sort</span>
          {activeFilterCount > 0 && (
            <span className={styles.filterCount} aria-hidden>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className={styles.desktopFilters}>
        <NearbyRefinementControls
          value={preferences}
          facets={craving ? facetDefs : []}
          supportsHours={supportsHours}
          closingSoonCount={closingSoonCount}
          hasRankingOrigin={hasRankingOrigin}
          onChange={updateQuery}
        />
      </div>

      {filterDraft && (
        <BottomSheet
          present
          ariaLabel="Filters & sort"
          historyLayerId={filterHistoryId}
          returnFocusRef={filterOpenerRef}
          focusReturnHref={filterFocusReturnHref}
          canDismiss={() => !applyPendingRef.current}
          maxHeight="90dvh"
          onClose={() => {
            setFilterDraft(null);
            applyPendingRef.current = false;
            setApplyingFilters(false);
          }}
        >
          {(dismiss) => (
            <>
              <SheetHandle onClose={dismiss} closeLabel="Close filters & sort" />
              <header className={styles.sheetHeader}>
                <h2>Filters &amp; sort</h2>
                <p>{active.label} · {scopeLabel(scope)}</p>
              </header>
              <div className={styles.sheetBody}>
                <NearbyRefinementControls
                  value={filterDraft}
                  facets={craving ? facetDefs : []}
                  supportsHours={supportsHours}
                  closingSoonCount={draftClosingSoonCount}
                  hasRankingOrigin={hasRankingOrigin}
                  onChange={(patch) => setFilterDraft((draft) => draft ? changeNearbyQuery(draft, patch) : draft)}
                />
              </div>
              <footer className={styles.sheetFooter}>
                <button
                  type="button"
                  className={styles.resetFilters}
                  onClick={() => setFilterDraft((draft) => draft ? changeNearbyQuery(draft, {
                    facetKey: null, closingSoonOnly: false, sort: "smart",
                  }) : draft)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className={styles.applyFilters}
                  disabled={applyingFilters}
                  onClick={() => applyFilters(dismiss)}
                >
                  Done
                </button>
              </footer>
            </>
          )}
        </BottomSheet>
      )}

      {/* Location trust: only when we DON'T have a fix AND aren't scoped to a
          town (a town scope makes "nearest to you" moot). With a fix we silently
          show real walk times; without one we say so and offer the button —
          never a distance we can't stand behind. */}
      {/* A refused or unavailable location is always explained, including
          after a header Near me request falls back to Whole county. The
          button only appears where it refines the area already chosen: in
          Whole county the header is the way to switch to Near me. */}
      {!hasFix && !townKey && (
        state.status === "denied" || state.status === "unavailable" ? (
          <div
            role="status"
            className={`flex min-h-[48px] items-center gap-2.5 border-b px-1 py-2.5 ${styles.underDock}`}
            style={{ borderColor: "var(--app-border)" }}
          >
            <Navigation className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <span className="text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              Location is off. Showing {scope === "county" || approxStatus === "outside-county"
                ? "county-wide results"
                : usableApproxCity
                  ? `results approximately near ${usableApproxCity}`
                  : "county-wide results"}.
            </span>
          </div>
        ) : scope === "county" ? null : (
          <button
            type="button"
            onClick={activateMyLocation}
            disabled={state.status === "loading"}
            className={`tactile-interactive flex min-h-[48px] w-full items-center gap-2.5 border-b px-1 py-2.5 text-left disabled:cursor-wait disabled:opacity-70 ${styles.underDock}`}
            style={{ borderColor: "var(--app-border)" }}
          >
            <Navigation className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-link)" }} aria-hidden />
            <span className="min-w-0 flex-1 text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
              {state.status === "loading"
                ? "Getting your location…"
                : state.status === "error"
                  ? "Location timed out. Try precise location again"
                : usableApproxCity
                  ? `You are near ${usableApproxCity}. Use precise location for better results.`
                  : "Use my location for nearest-first results"}
            </span>
          </button>
        )
      )}

      {openThin && (
        <p className={styles.thinNote} data-nearby-open-thin role="status">
          {openNowThinNote({
            nearbyOpen: openNearbyCount,
            area: thinArea,
            phrase: meal?.phrase,
            closestOpen: closestOpenBeyond,
            order: sort === "rated" ? "rated" : hasRankingOrigin ? "nearest" : "best",
          })}
        </p>
      )}

      {results.length === 0 && townName && matched.length === 0 && nearbyTownFallback.length > 0 ? (
        <section aria-labelledby="nearby-town-fallback-heading" className={styles.emptyState}>
          <h2 id="nearby-town-fallback-heading" className={styles.emptyTitle}>
            Nearby options beyond {townName}
          </h2>
          <p className={styles.emptyText}>
            Radius has no matching listing for {activeNoun} in {townName} yet. These are the closest matches outside town, and each row shows what Radius can confirm about its hours.
          </p>
          <div className={styles.emptyActions}>
            <Button variant="secondary" onClick={searchWholeCounty}>Search the whole county</Button>
            <Button variant="quiet" href="/submit/place">Tell us what&rsquo;s missing</Button>
          </div>
          <ul className={styles.rowList} aria-label={`${activeNoun} options outside ${townName}`}>
            {nearbyTownFallback.map(({ place, distance }) => (
              <li key={place.slug}>
                <p className={styles.rowContext}>
                  {MUNICIPALITY_BY_SLUG[place.municipality ?? ""]?.name ?? place.city}, {formatDistance(distance)} from {townName}
                </p>
                {parksExplorer
                  ? <PlaceCard place={place} variant="discovery" discoverySurface="nearby" discoveryIntent="parks" />
                  : <PlaceCard place={place} variant="row" hoursInMeta lazyPhoto />}
              </li>
            ))}
          </ul>
        </section>
      ) : results.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            {townName
              ? matched.length === 0
                ? `Radius has no verified listing for ${activeNoun} in ${townName} yet.`
                : openOnly && !closingSoonOnly
                  ? `No matches for ${activeNoun} in ${townName} are confirmed open right now.`
                  : `Radius found no options for ${activeNoun} in ${townName} right now.`
              : closingSoonOnly
                ? `Radius found no options for ${activeNoun} that are closing soon${hasFix ? " near you" : ""}.`
                : openOnly && matched.length > 0
                  ? `No matches for ${activeNoun} are confirmed open right now.`
                  : meal
                    ? `No matches for ${activeNoun} ${meal.phrase} are confirmed open near you right now.`
                    : `Radius found no options for ${activeNoun} ${hasFix ? "near you" : "in range"} right now.`}
          </p>
          {/* Clear the town lens, the closing-soon filter, or Open now. Never
              dead-end. */}
          {townName ? (
            <div className={styles.emptyActions}>
              <Button variant="secondary" onClick={searchWholeCounty}>Search the whole county</Button>
              {matched.length === 0 ? (
                <Button variant="quiet" href="/submit/place">Tell us what&rsquo;s missing</Button>
              ) : null}
            </div>
          ) : closingSoonOnly ? (
            <div className={styles.emptyActions}>
              <Button variant="secondary" onClick={() => updateQuery({ closingSoonOnly: false })}>Show all open</Button>
            </div>
          ) : (
            openOnly && matched.length > 0 && (
              <div className={styles.emptyActions}>
                <Button variant="secondary" onClick={() => updateQuery({ openOnly: false })}>
                  Show all {matched.length} matches
                </Button>
              </div>
            )
          )}
        </div>
      ) : (
        parksExplorer ? <ul className={styles.parksGrid} data-nearby-parks-grid aria-label="Parks and outdoor places">
          {parksRows.flatMap(row => row.places.map((place, index) => <li key={place.slug}
            className={styles.parkResult} data-nearby-parks-row={row.places.length === 2 ? "pair" : "single"}
            data-parks-pair-start={row.places.length === 2 ? index === 0 : undefined}>
            <PlaceCard place={place} variant="discovery" discoverySurface="nearby" discoveryIntent="parks" />
            {place.distance_m !== undefined && <span className="sr-only">{walkLabel(place.distance_m)}</span>}
          </li>))}
        </ul> : <ul className={styles.rowList} data-nearby-results aria-label={`${headingNoun} ${areaLabel}`}>
          {results.map((p) => (
            <li key={p.slug}>
              {/* Ruled rows: a photo only when a real one exists, the town
                  and any unknown hours in the muted line, and a status line
                  only for hours Radius can state. Directions live in the
                  place sheet, so no row carries a filled action. */}
              <PlaceCard place={p} variant="row" hoursInMeta lazyPhoto />
              {p.distance_m !== undefined && <span className="sr-only">{walkLabel(p.distance_m)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One set of refinements serves the desktop panel and the mobile draft. */
function NearbyRefinementControls({
  value,
  facets,
  supportsHours,
  closingSoonCount,
  hasRankingOrigin,
  onChange,
}: {
  value: NearbyQueryState;
  facets: readonly { key: string; label: string }[];
  supportsHours: boolean;
  closingSoonCount: number;
  hasRankingOrigin: boolean;
  onChange: (patch: Partial<NearbyQueryState>) => void;
}) {
  const sortGroupRef = useRef<HTMLFieldSetElement | null>(null);
  return (
    <div className={styles.controlGroups}>
      {facets.length > 0 && (
        <fieldset className={styles.controlSection}>
          <legend className={styles.controlTitle}>Type</legend>
          <div className={styles.controlChoices}>
            <FilterChip label="All" active={value.facetKey === null} onClick={() => onChange({ facetKey: null })} />
            {facets.map((facet) => (
              <FilterChip key={facet.key} label={facet.label} active={value.facetKey === facet.key} onClick={() => onChange({ facetKey: facet.key })} />
            ))}
          </div>
        </fieldset>
      )}
      {!supportsHours && (value.openOnly || value.closingSoonOnly) && (
        <fieldset className={styles.controlSection}>
          <legend className={styles.controlTitle}>Hours filter from this link</legend>
          <p className={styles.controlHelp}>Only places with confirmed matching hours are shown. You can remove this filter.</p>
          <button type="button" className={styles.clearLegacyHours}
            onClick={() => {
              onChange({ openOnly: false, closingSoonOnly: false });
              sortGroupRef.current?.focus({ preventScroll: true });
            }}>Show all matches</button>
        </fieldset>
      )}
      {supportsHours && (value.closingSoonOnly || closingSoonCount > 0) && (
        <fieldset className={styles.controlSection}>
          <legend className={styles.controlTitle}>Hours</legend>
          <div className={styles.controlChoices}>
            <FilterChip label="Closing soon" active={value.closingSoonOnly} onClick={() => onChange({ closingSoonOnly: !value.closingSoonOnly })} />
          </div>
          <p className={styles.controlHelp}>Places with confirmed hours that close within the hour.</p>
        </fieldset>
      )}
      <fieldset ref={sortGroupRef} tabIndex={-1} className={styles.controlSection}>
        <legend className={styles.controlTitle}>Sort</legend>
        <div className={styles.controlChoices}>
          <FilterChip label="Smart" active={value.sort === "smart"} onClick={() => onChange({ sort: "smart" })} />
          {hasRankingOrigin && (
            <FilterChip label="Nearest" active={value.sort === "nearest"} onClick={() => onChange({ sort: "nearest" })} />
          )}
          <FilterChip label="Top rated" active={value.sort === "rated"} onClick={() => onChange({ sort: "rated" })} />
        </div>
      </fieldset>
    </div>
  );
}

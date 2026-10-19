"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
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
import Link from "next/link";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";
import { navigateAfterHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import styles from "./RightNow.module.css";
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
import { haversineMeters, isInFrederickCountyArea } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import {
  mayAssertNoneOpen,
  openNowCountLabel,
} from "@/lib/hours-availability";
import { haptic } from "@/lib/haptics";
import { setScope, subscribeScopeChange, scopeTownSlug, type DecisionOriginSource, type Scope } from "@/lib/scope";
import {
  canUseOriginForRanking,
  compareRightNowCandidates,
  resolveRightNowAvailabilityMode,
  rightNowSortLabel,
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
  const applyPendingRef = useRef(false);
  const [filterDraft, setFilterDraft] = useState<NearbyQueryState | null>(null);
  const [applyingFilters, setApplyingFilters] = useState(false);

  function openFilters() {
    applyPendingRef.current = false;
    setApplyingFilters(false);
    setFilterDraft(readNearbyQuery(new URLSearchParams(window.location.search), storedScope));
  }

  function applyFilters(dismiss: () => void) {
    if (!filterDraft || applyPendingRef.current) return;
    const draft = filterDraft;
    applyPendingRef.current = true;
    setApplyingFilters(true);
    // The temporary sheet entry must leave first. Replacing its query would
    // make Back uncover the old filters underneath it and lose the selection.
    navigateAfterHistoryLayer(filterHistoryId, () => {
      const current = readNearbyQuery(new URLSearchParams(window.location.search), storedScope);
      if (current.cravingKey === draft.cravingKey) {
        writeNearbyQuery(changeNearbyQuery(current, {
          facetKey: draft.facetKey,
          openOnly: draft.openOnly,
          closingSoonOnly: draft.closingSoonOnly,
          sort: draft.sort,
        }));
      }
      applyPendingRef.current = false;
      dismiss();
    });
  }

  function updateQuery(patch: Partial<NearbyQueryState>, mode: "push" | "replace" = "replace") {
    const current = readNearbyQuery(new URLSearchParams(window.location.search), storedScope);
    writeNearbyQuery(changeNearbyQuery(current, patch), mode);
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

  function chooseTown(nextTown: string | null) {
    const nextScope: Scope = nextTown ? `town:${nextTown}` : "county";
    updateQuery({ scope: nextScope });
    setScope(nextScope);
  }

  function activateMyLocation() {
    updateQuery({ scope: "nearme" });
    setScope("nearme");
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

  const results = useMemo(() => {
    const list = closingSoonOnly
      ? matched.filter((m) => m.p.open_status.state === "closing-soon")
      : openOnly
        ? matched.filter((m) => m.open)
        : matched;
    return (
      list
        .slice(0, RESULT_LIMIT)
        // Attach distance for the card ONLY when we have a real fix — never
        // print a distance measured from a place the user isn't standing at.
        .map(({ p, dist }) => ({ ...p, distance_m: hasFix ? dist : undefined }))
    );
  }, [matched, openOnly, closingSoonOnly, hasFix]);

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
  const availabilityLead = openOnly || craving?.alwaysOpen
    ? null
    : rankingAvailability === "required"
      ? "open" as const
      : "available" as const;
  const sortLabel = rightNowSortLabel(sort, hasRankingOrigin, availabilityLead);
  const activeFilterCount = Number(Boolean(facetKey)) + Number(openOnly) + Number(closingSoonOnly) + Number(sort !== "smart");
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
    <div className="space-y-4" data-nearby-interaction-ready={interactionReady ? "true" : "false"}>
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
            className={styles.answerTitle}
            style={{ color: "var(--app-ink)" }}
          >
            {headingNoun} {areaLabel}
          </h1>
          {/* Meals frame the count on the CLOCK fact ("open for dinner now")
              — never a service claim. Nouns keep the plain "open now". */}
          <p className="text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
            {matched.length === 0
              ? `No matching places ${townName ? `in ${townName}` : "in the county"} · ${sortLabel}`
              : requestedAvailability === "not-applicable"
                ? `${matched.length} ${matched.length === 1 ? "place" : "places"} ${origin ? "nearby" : "in the county"} · ${sortLabel}`
              : meal
              ? openCount > 0
                ? `${openCount} open ${meal.phrase} right now · ${sortLabel}`
                : mayReportNoneOpen
                  ? `No matches are open ${meal.phrase} right now · ${sortLabel}`
                  : `No matches are confirmed open ${meal.phrase} right now · ${sortLabel}`
                : craving?.alwaysOpen
                ? `${matched.length} ${matched.length === 1 ? "place" : "places"} · ${sortLabel}`
                : openOnly
                  ? `${openNowCountLabel(openCount, mayReportNoneOpen)} · ${sortLabel}`
                  : townName
                    ? `${openNowCountLabel(openCount, mayReportNoneOpen)} · ${matched.length} in ${townName} · ${sortLabel}`
                    : `${openNowCountLabel(openCount, mayReportNoneOpen)} · ${matched.length} ${origin ? "nearby" : "in the county"} · ${sortLabel}`}
          </p>
        </div>
      </header>

      <div className={styles.mobileFilters} data-nearby-filter-dock>
        <p className={styles.filterSummary}>
          {[
            facetDefs.find((facet) => facet.key === facetKey)?.label ?? (facetDefs.length > 0 ? "All types" : "All places"),
            closingSoonOnly ? "Closing soon" : openOnly ? "Confirmed open" : null,
          ].filter(Boolean).join(" · ")}
        </p>
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
          supportsHours={!craving?.alwaysOpen}
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
                <p>{active.label} · {townName ?? (scope === "county" ? "Whole county" : "Nearby")}</p>
              </header>
              <div className={styles.sheetBody}>
                <NearbyRefinementControls
                  value={filterDraft}
                  facets={craving ? facetDefs : []}
                  supportsHours={!craving?.alwaysOpen}
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
                    facetKey: null, openOnly: false, closingSoonOnly: false, sort: "smart",
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
      {!hasFix && !townKey && (
        state.status === "denied" || state.status === "unavailable" ? (
          <div
            role="status"
            className="flex min-h-[48px] items-center gap-2.5 border-y px-1 py-2.5"
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
        ) : (
          <button
            type="button"
            onClick={activateMyLocation}
            disabled={state.status === "loading"}
            className="tactile-interactive flex min-h-[48px] w-full items-center gap-2.5 border-y px-1 py-2.5 text-left disabled:cursor-wait disabled:opacity-70"
            style={{ borderColor: "var(--app-border)" }}
          >
            <Navigation className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
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

      {results.length === 0 && townName && matched.length === 0 && nearbyTownFallback.length > 0 ? (
        <section aria-labelledby="nearby-town-fallback-heading" className="space-y-3">
          <div
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
          >
            <h2 id="nearby-town-fallback-heading" className="text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Nearby options beyond town
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Radius has no matching listing for {activeNoun} in {townName} yet. These are the closest matches outside town; each card shows what Radius can confirm about its hours.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => chooseTown(null)}
                className="tactile-interactive inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Search all towns
              </button>
              <Link
                href="/submit/place"
                className="tactile-interactive inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-brand-press)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Tell us what&rsquo;s missing
              </Link>
            </div>
          </div>
          <ul className="space-y-2" aria-label={`${activeNoun} options outside ${townName}`}>
            {nearbyTownFallback.map(({ place, distance }) => (
              <li key={place.slug}>
                <p className="mb-1 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                  {MUNICIPALITY_BY_SLUG[place.municipality ?? ""]?.name ?? place.city}
                  {` · ${(distance / 1609).toFixed(distance < 16090 ? 1 : 0)} mi from ${townName}`}
                </p>
                <PlaceCard place={place} variant="discovery" discoverySurface="nearby" lazyPhoto />
              </li>
            ))}
          </ul>
        </section>
      ) : results.length === 0 ? (
        <div
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--app-ink-3)" }}>
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
          {/* Clear the town scope, the closing-soon filter, or (when Open-now
              hides matches that are closed or have unknown hours) offer the
              complete result set — never dead-end. */}
          {townName ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => chooseTown(null)}
                className="tactile-interactive inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Search all towns
              </button>
              {matched.length === 0 ? (
                <Link
                  href="/submit/place"
                  className="tactile-interactive inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold"
                  style={{ background: "var(--app-bg-elevated)", color: "var(--app-brand-press)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
                >
                  Tell us what&rsquo;s missing
                </Link>
              ) : null}
            </div>
          ) : closingSoonOnly ? (
            <button
              type="button"
              onClick={() => updateQuery({ closingSoonOnly: false })}
              className="tactile-interactive mt-3 inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold"
              style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
            >
              Show all open
            </button>
          ) : (
            openOnly && matched.length > 0 && (
              <button
                type="button"
                onClick={() => updateQuery({ openOnly: false })}
                className="tactile-interactive mt-3 inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Show all {matched.length} matches
              </button>
            )
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((p) => (
            <li key={p.slug}>
              {/* Business decision card — the place's photo leads (category
                  glyph fallback), then name, open status, walk time, one tap
                  to details + directions. */}
              <PlaceCard place={p} variant="discovery" discoverySurface="nearby" lazyPhoto />
              {p.distance_m !== undefined && (
                <span className="sr-only">{walkLabel(p.distance_m)}</span>
              )}
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
  return (
    <div className={styles.controlGroups}>
      {facets.length > 0 && (
        <fieldset className={styles.controlSection}>
          <legend className={styles.controlTitle}>Type</legend>
          <div className={styles.controlChoices}>
            <FacetChip label="All" active={value.facetKey === null} color="var(--app-brand)" onClick={() => onChange({ facetKey: null })} />
            {facets.map((facet) => (
              <FacetChip key={facet.key} label={facet.label} active={value.facetKey === facet.key} color="var(--app-brand)" onClick={() => onChange({ facetKey: facet.key })} />
            ))}
          </div>
        </fieldset>
      )}
      {supportsHours && (
        <fieldset className={styles.controlSection}>
          <legend className={styles.controlTitle}>Hours</legend>
          <div className={styles.controlChoices}>
            <FacetChip label="Open now" active={value.openOnly} color="var(--app-brand)" onClick={() => onChange({ openOnly: !value.openOnly })} />
            {(value.closingSoonOnly || closingSoonCount > 0) && (
              <FacetChip label="Closing soon" active={value.closingSoonOnly} color="var(--app-brand)" onClick={() => onChange({ closingSoonOnly: !value.closingSoonOnly })} />
            )}
          </div>
          <p className={styles.controlHelp}>Open now includes places with confirmed current hours.</p>
        </fieldset>
      )}
      <fieldset className={styles.controlSection}>
        <legend className={styles.controlTitle}>Sort</legend>
        <div className={styles.controlChoices}>
          <FacetChip label="Smart" active={value.sort === "smart"} color="var(--app-brand)" onClick={() => onChange({ sort: "smart" })} />
          {hasRankingOrigin && (
            <FacetChip label="Nearest" active={value.sort === "nearest"} color="var(--app-brand)" onClick={() => onChange({ sort: "nearest" })} />
          )}
          <FacetChip label="Top rated" active={value.sort === "rated"} color="var(--app-brand)" onClick={() => onChange({ sort: "rated" })} />
        </div>
      </fieldset>
    </div>
  );
}

/** A sub-facet pill on the results page. Active = a wash of the craving's own
 *  ink with an ink label; inactive = a quiet outline. Pure + presentational. */
function FacetChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="tap-44-y tactile-interactive min-h-11 min-w-11 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={
        active
          ? {
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color: "var(--app-ink)",
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
            }
          : { background: "var(--app-bg-elevated)", color: "var(--app-ink-3)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
      }
    >
      {label}
    </button>
  );
}

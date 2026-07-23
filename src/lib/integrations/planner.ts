/**
 * Itinerary builder. "Plan my evening" and friends.
 *
 * Rule based and grounded: every stop is a real, operational place or a
 * real event from our canonical data. No hallucinated places. An
 * optional Claude pass adds connective narrative when a key is set.
 *
 * A finished plan is fully described by a small spec: the inputs plus
 * the ordered stop references. That spec round trips through a URL,
 * which is how plans are shared and edited without any backend.
 */

import type { Place } from "@/data/places";
// Client-safe: PlanBuilder ("use client") imports this, so use the
// slim already-decorated set, NOT @/lib/loaders/places (which
// static-imports the ~12MB enrichment into the client bundle).
import { clientPlaces, clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { EVENT_BY_SLUG, type Event } from "@/data/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { haversineMeters, FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import {
  isRecommendable,
  isDestinationCategory,
  isRestrictedMembershipVenue,
} from "@/lib/relevance";
import { fieldNotesFor } from "@/lib/loaders/fieldNotes";
import { isChainName } from "@/lib/category-ranking";
import { getOpenStatus } from "@/lib/hours";
import { MUNICIPALITIES } from "@/data/municipalities";

export type PlanInputs = {
  audience: "solo" | "date" | "family" | "friends" | "visitor";
  vibe: "easy" | "active" | "cultural" | "outdoors" | "food";
  duration_hours: 2 | 3 | 4 | 6;
  /** ISO string so the spec is serializable. Defaults to now. */
  start_at?: string;
  start_near?: LngLat;
  /** A deliberately selected town is a hard boundary, not merely a centroid
   * used to make out-of-town stops look local. */
  municipality?: string;
  /** Optional Ask Radius constraints. Older shared plans omit these and
   *  continue to reconstruct exactly as before. */
  max_distance_m?: number;
  local_only?: boolean;
  budget?: "free" | "value";
  /** Favor stops with verified parking guidance and keep the outing compact. */
  parking_priority?: boolean;
  /** Optional cap for people who want fewer transitions or less walking. */
  max_stops?: number;
  /** A place explicitly named by Ask Radius ("make a plan around this"). */
  anchor_slug?: string;
  /**
   * Require a fresh, verified schedule to cover every stop. Ask Radius sets
   * this for dated, "tonight," and other live-clock plans. An undated idea
   * ("plan a date night") may still use a strong place whose hours need
   * confirmation, but the stop remains visibly "Hours unconfirmed."
   */
  require_verified_hours?: boolean;
  /**
   * Optional integer that nudges candidate ranking deterministically.
   * Same inputs with a different seed yield a *different but valid*
   * plan — the user's "Shuffle" affordance. Omitted = stable ranking.
   */
  seed?: number;
};

export type PlanStop = {
  order: number;
  /** Clock time this stop begins, ISO. */
  at: string;
  duration_min: number;
  why: string;
  /** "open" | "likely" | "unknown" | "closed", for the stop chip. */
  open: "open" | "likely" | "unknown" | "closed";
  /** Estimated transition from the previous stop. The first stop omits this
   * because Radius does not know the user's exact departure point unless they
   * explicitly share it. */
  travel_from_previous_min?: number;
  travel_from_previous_m?: number;
  travel_mode?: "walk" | "drive";
  place?: Place;
  event?: Event;
  /** A real Google place photo when enrichment supplied one. The
   *  card renders an empty stop block when omitted — never a stock
   *  or fabricated image. */
  photo_url?: string;
  /** ONE verified Field Note for this stop — parking intel first (the thing
   *  you need on arrival), else the best insider tip. The moat, attached to
   *  the itinerary: no other app's evening plan tells you where to park at
   *  each stop. Verified-source data only (field-notes.json); omitted when
   *  the place has no dossier (~95% of places), never fabricated. */
  tip?: string;
};

export type Plan = {
  title: string;
  summary: string;
  stops: PlanStop[];
  narrative?: string;
  /** One honest weather line for the plan window ("Rain is likely around
   *  8 PM, plan for cover between stops") — stamped by the server action
   *  from the live NWS hourly forecast when precip probability crosses 50%
   *  during the window. Absent on dry windows: no weather theater. */
  weather_note?: string;
  /** URL safe token that reconstructs this exact plan. */
  share: string;
};

/** The minimum needed to rebuild a plan deterministically. */
export type PlanSpec = {
  v: 1;
  i: PlanInputs;
  /** Ordered stop refs. p = place slug, e = event slug. */
  s: Array<{ p: string } | { e: string }>;
};

// Tags are a bonus only. Most of the long tail (scraped) places have no
// tags, so the planner must not depend on them for recall.
const VIBE_TAGS: Record<PlanInputs["vibe"], string[]> = {
  easy: ["cozy", "indoor", "rainy-day"],
  active: ["outdoor", "kids-6-12", "bike-rack"],
  cultural: ["arts", "first-friday", "live-music"],
  outdoors: ["outdoor", "year-round", "dog-friendly"],
  food: ["sit-down", "groups", "date-night"],
};

const AUDIENCE_BOOST: Record<PlanInputs["audience"], string[]> = {
  solo: ["solo", "wifi", "cozy"],
  date: ["date-night", "cozy", "live-music"],
  family: ["kids-0-5", "kids-6-12", "family"],
  friends: ["groups", "outdoor-seating", "live-music"],
  visitor: ["local-favorite"],
};

type Slot = "morning" | "afternoon" | "evening";
const FOOD = new Set(["restaurant", "bar", "brewery", "coffee", "bakery", "market", "pizza"]);
const CULTURE = new Set(["theater", "museum", "gallery", "music", "arts"]);
const OUTDOOR = new Set(["park", "trail", "playground"]);
const MEALS = new Set(["restaurant", "pizza", "food-truck"]);
const DRINKS = new Set(["bar", "brewery", "winery", "distillery"]);
const TREATS = new Set(["coffee", "bakery", "ice-cream"]);
const SHOPPING = new Set(["shopping", "antiques", "book-store", "market"]);
const DATE_FILLER_CATEGORIES = new Set(["shopping", "market"]);
const DATE_EVENING_CATEGORIES = new Set([
  "restaurant",
  "pizza",
  "bar",
  "brewery",
  "winery",
  "distillery",
  "theater",
  "music",
  "museum",
  "gallery",
  "arts",
  "ice-cream",
]);
const DATE_MIN_GOOGLE_RATING = 4;

const DURATION_MIN: Record<string, number> = {
  coffee: 40, bakery: 30, restaurant: 80, pizza: 60, bar: 60, brewery: 70,
  market: 35, museum: 75, gallery: 45, theater: 120, music: 90, arts: 45,
  park: 50, trail: 60, playground: 40, shopping: 40, wellness: 60,
};
const DEFAULT_DURATION = 45;

function fitsVibe(cat: string, vibe: PlanInputs["vibe"]): boolean {
  if (vibe === "food") return FOOD.has(cat) || DRINKS.has(cat) || TREATS.has(cat);
  if (vibe === "cultural") {
    return CULTURE.has(cat) || ["public-art", "tours", "library", "book-store", "restaurant", "coffee", "bakery"].includes(cat);
  }
  if (vibe === "outdoors") {
    return OUTDOOR.has(cat) || ["golf", "agritourism", "restaurant", "coffee", "bakery", "brewery"].includes(cat);
  }
  if (vibe === "active") {
    return OUTDOOR.has(cat) || ["golf", "wellness", "yoga", "restaurant", "coffee"].includes(cat);
  }
  return FOOD.has(cat) || CULTURE.has(cat) || OUTDOOR.has(cat) || SHOPPING.has(cat) || ["public-art", "tours", "library", "agritourism"].includes(cat);
}

/** Prevent plans from filling their available slots with cosmetically
 * different versions of the same experience. */
function experienceGroup(cat: string): string {
  if (MEALS.has(cat)) return "meal";
  if (DRINKS.has(cat)) return "drinks";
  if (TREATS.has(cat)) return "treat";
  if (CULTURE.has(cat) || ["public-art", "tours", "library"].includes(cat)) return "culture";
  if (OUTDOOR.has(cat) || ["golf", "agritourism"].includes(cat)) return "outdoors";
  if (SHOPPING.has(cat)) return "shopping";
  return cat;
}

function openingStopBonus(cat: string, input: PlanInputs, slot: Slot): number {
  if (input.vibe === "food" && MEALS.has(cat)) return 3;
  if (input.vibe === "outdoors" && OUTDOOR.has(cat)) return 3;
  if (input.vibe === "active" && (OUTDOOR.has(cat) || ["wellness", "yoga"].includes(cat))) return 3;
  if (input.vibe === "cultural" && (CULTURE.has(cat) || ["public-art", "tours", "library"].includes(cat))) return 3;
  if (input.audience === "date" && slot === "evening" && MEALS.has(cat)) return 2;
  return 0;
}

function isPublicPlanCandidate(place: Place): boolean {
  if (isRestrictedMembershipVenue(place.name)) {
    return false;
  }
  if ((FOOD.has(place.category) || DRINKS.has(place.category) || TREATS.has(place.category))) {
    const address = place.address?.trim().toLowerCase();
    const city = place.city?.trim().toLowerCase();
    if (!address || address === city || !/\d/.test(address)) return false;
  }
  return true;
}

function slotFor(d: Date): Slot {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(d),
  );
  if (h >= 17 || h < 4) return "evening";
  if (h >= 12) return "afternoon";
  return "morning";
}

/**
 * Category fit, weighted by the chosen vibe and the time of day. This is
 * the primary signal because, unlike tags, every place has a category.
 */
function categoryScore(cat: string, vibe: PlanInputs["vibe"], slot: Slot): number {
  let s = 0;
  if (vibe === "food" && FOOD.has(cat)) s += 3;
  else if (vibe === "cultural" && CULTURE.has(cat)) s += 3;
  else if (vibe === "outdoors" && OUTDOOR.has(cat)) s += 3;
  else if (vibe === "active" && (OUTDOOR.has(cat) || cat === "wellness")) s += 3;
  else if (vibe === "easy") s += FOOD.has(cat) || CULTURE.has(cat) ? 1.5 : 1; // easy accepts most things

  // Time of day nudges, so an evening plan leans to dinner and culture,
  // a daytime plan to parks, museums, and coffee.
  if (slot === "evening" && (cat === "restaurant" || cat === "bar" || cat === "brewery" || cat === "theater" || cat === "music")) s += 1.2;
  if (slot === "evening" && cat === "coffee") s -= 0.8;
  if (slot !== "evening" && (cat === "park" || cat === "trail" || cat === "museum" || cat === "coffee")) s += 0.8;
  return s;
}

function openWeight(state: PlaceCardData["open_status"]["state"]): number {
  if (state === "open") return 1.6;
  if (state === "closing-soon") return 0.4;
  if (state === "closed") return -4; // never route someone to a closed place
  return 0; // unknown: neutral, we are honest about not knowing
}

function tagBonus(p: Place, vibe: PlanInputs["vibe"], audience: PlanInputs["audience"]): number {
  const tags = p.tags ?? [];
  if (tags.length === 0) return 0;
  const vibeHits = VIBE_TAGS[vibe].filter((t) => tags.includes(t)).length;
  const audHits = AUDIENCE_BOOST[audience].filter((t) => tags.includes(t)).length;
  return vibeHits * 0.5 + audHits * 0.5;
}

function audienceCategoryScore(cat: string, audience: PlanInputs["audience"], slot: Slot): number {
  if (audience === "date" && slot === "evening") {
    if (["restaurant", "bar", "brewery", "theater", "music"].includes(cat)) return 1.4;
    if (["market", "coffee", "bakery"].includes(cat)) return -2.2;
  }
  if (audience === "family" && ["bar", "brewery"].includes(cat)) return -4;
  if (audience === "visitor" && ["museum", "gallery", "park"].includes(cat)) return 0.8;
  return 0;
}

type Scored = { d: PlaceCardData; score: number; distance: number };

/**
 * Deterministic 32-bit hash of a string — used by the seed jitter so
 * the same (slug, seed) pair always nudges the same way (no surprises
 * across re-renders). Tiny xor + multiply, intentionally unsigned.
 */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function scoredCandidates(input: PlanInputs, origin: LngLat, now: Date): Scored[] {
  const slot = slotFor(now);
  const seed = input.seed ?? 0;
  // Candidate gate (2026-06 audit, ranking-trust blocker): a plan stop
  // is a recommendation, so only destination categories qualify. The
  // "easy" vibe scores every category at least +1, which let a church
  // community room with unknown hours clear score > 0 and seat a date
  // night. One exception: the active vibe legitimately wants wellness.
  const allowCategory = (cat: string) =>
    isDestinationCategory(cat) || (input.vibe === "active" && cat === "wellness");
  return clientPlaces()
    .filter((p) => {
      if (input.municipality && p.municipality !== input.municipality) return false;
      if (!isRecommendable(p) || !allowCategory(p.category) || !isPublicPlanCandidate(p)) return false;
      // Audience constraints are gates, not ranking nudges. A generic shop or
      // a place with a weak known rating should never become a date-plan stop
      // simply because it is nearby and the planner still has a slot to fill.
      // An explicit anchor remains the user's choice and is not silently
      // discarded by these recommendation-only safeguards.
      if (input.audience === "date" && input.anchor_slug !== p.slug) {
        if (DATE_FILLER_CATEGORIES.has(p.category)) return false;
        if (slot === "evening" && !DATE_EVENING_CATEGORIES.has(p.category)) return false;
        if (p.google_rating != null && p.google_rating < DATE_MIN_GOOGLE_RATING) return false;
      }
      if (input.local_only && isChainName(p.name)) return false;
      if (input.budget === "free" && !(p.tags ?? []).includes("free")) return false;
      if (input.budget === "value" && p.price_band != null && p.price_band > 2) return false;
      return true;
    })
    .map((p) => {
      // Score hours at the requested PLAN start, not at page-render time.
      // A 7 AM request for "date night" must not promote a cafe because it is
      // open now, then send the user there after it closes.
      const d: PlaceCardData = {
        ...p,
        distance_m: haversineMeters(origin, p.geom),
        open_status: getOpenStatus(p.hours, { verified: p.hours_verified }, now),
      };
      const distance = d.distance_m ?? haversineMeters(origin, p.geom);
      const base = categoryScore(p.category, input.vibe, slot);
      const rating = d.google_rating ? (d.google_rating - 3.5) * 1.2 : 0;
      // Seed-driven jitter (±0.6) when a seed is set, otherwise zero.
      // Bounded so a low-fit place can't elbow out a great one — only
      // changes the ordering among similarly-strong candidates.
      const jitter = seed === 0
        ? 0
        : ((hashStr(`${p.slug}:${seed}`) % 1000) / 1000 - 0.5) * 1.2;
      // A generic restaurant with a high aggregate score is not
      // automatically a date-night pick. Curated date-night evidence should
      // outrank a blank listing that merely has a higher rating.
      const audienceEvidence = input.audience === "date" && (p.tags ?? []).includes("date-night")
        ? 2.5
        : 0;
      const score =
        (base +
          (input.anchor_slug === p.slug ? 100 : 0) +
          d.feature_score * 0.6 +
          rating +
          openWeight(d.open_status.state) +
          tagBonus(p, input.vibe, input.audience) +
          audienceEvidence +
          audienceCategoryScore(p.category, input.audience, slot) +
          (input.parking_priority ? (fieldNotesFor(p.slug)?.parking?.text ? 2.4 : -0.4) : 0) +
          jitter) /
        Math.log(Math.max(2, distance / 250)); // gentle distance dampener
      return { d, score, distance };
    })
    .filter((c) => {
      if (c.distance >= (input.max_distance_m ?? 20_000) || c.score <= 0) return false;
      if (!fitsVibe(c.d.category, input.vibe)) return false;
      if (c.d.open_status.state === "closed") return false;
      // Only a genuinely time-specific plan requires fresh schedule proof.
      // General idea-building can keep a strong place with unknown hours, but
      // schedule() marks it "Hours unconfirmed" instead of implying it is open.
      if (
        input.require_verified_hours &&
        (c.d.open_status.state === "unknown" || c.d.open_status.state === "unverified")
      ) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);
}

function durationFor(cat: string): number {
  return DURATION_MIN[cat] ?? DEFAULT_DURATION;
}

function planCategoryNoun(category: string): string {
  const labels: Record<string, string> = {
    arts: "arts venue",
    music: "music venue",
    shopping: "shop",
    "public-art": "public art stop",
    tours: "tour",
    "ice-cream": "ice cream shop",
    agritourism: "farm",
  };
  return labels[category] ?? category.replace(/-/g, " ");
}

function whyFor(d: PlaceCardData): string {
  const category = planCategoryNoun(d.category);
  if (d.google_rating) {
    return `Google lists this ${category} in ${d.city} with a ${d.google_rating.toFixed(1)} rating.`;
  }
  if (d.open_status.state === "open" || d.open_status.state === "closing-soon") {
    return `This ${category} is in ${d.city}, and its posted hours cover this stop.`;
  }
  return `This ${category} is in ${d.city}.`;
}

function stopCountFor(hours: PlanInputs["duration_hours"]): number {
  if (hours <= 2) return 2;
  if (hours <= 3) return 3;
  if (hours <= 4) return 4;
  return 5;
}

/** Resolve inputs to a concrete origin and start time. */
function resolve(input: PlanInputs): { origin: LngLat; now: Date } {
  const municipality = input.municipality
    ? MUNICIPALITIES.find((town) => town.slug === input.municipality)
    : undefined;
  return {
    origin: input.start_near ?? municipality?.centroid ?? FREDERICK_CENTER,
    now: input.start_at ? new Date(input.start_at) : new Date(),
  };
}

function estimateTravel(from: LngLat, to: LngLat): { minutes: number; meters: number; mode: "walk" | "drive" } {
  const meters = haversineMeters(from, to);
  if (meters <= 1_600) {
    return { minutes: Math.max(3, Math.ceil(meters / 75)), meters, mode: "walk" };
  }
  return { minutes: Math.max(6, Math.ceil(meters / 500) + 3), meters, mode: "drive" };
}

function availableForStop(
  place: Place,
  at: Date,
  durationMin: number,
  requireVerifiedHours: boolean,
): boolean {
  const start = getOpenStatus(place.hours, { verified: place.hours_verified }, at).state;
  const nearEnd = new Date(at.getTime() + Math.max(1, durationMin - 5) * 60_000);
  const end = getOpenStatus(place.hours, { verified: place.hours_verified }, nearEnd).state;
  const confirmedOpen = start === "open" && (end === "open" || end === "closing-soon");
  if (confirmedOpen) return true;
  if (start === "closed" || end === "closed") return false;
  return !requireVerifiedHours;
}

/** Lay stops out on the clock from the start time. Pure. */
function schedule(
  ordered: Array<{ place?: Place; event?: Event; openState: PlanStop["open"]; why: string; photo_url?: string }>,
  start: Date,
): PlanStop[] {
  let cursor = start.getTime();
  let previous: LngLat | null = null;
  const stops: PlanStop[] = [];
  for (const o of ordered) {
    const geom = o.place?.geom ?? o.event?.geom;
    const travel = previous && geom ? estimateTravel(previous, geom) : null;
    if (travel) cursor += travel.minutes * 60_000;
    // An event anchors to its real start time when that is later.
    if (o.event) {
      const evStart = new Date(o.event.starts_at).getTime();
      const evEnd = o.event.ends_at ? new Date(o.event.ends_at).getTime() : null;
      if (evEnd && cursor >= evEnd) continue;
      if (evStart > cursor) cursor = evStart;
    }
    const cat = o.place?.category ?? "event";
    const eventRemaining = o.event?.ends_at
      ? Math.floor((new Date(o.event.ends_at).getTime() - cursor) / 60_000)
      : 90;
    const dur = o.event ? Math.max(15, Math.min(90, eventRemaining)) : durationFor(cat);
    const at = new Date(cursor).toISOString();
    const scheduledState = o.place
      ? getOpenStatus(o.place.hours, { verified: o.place.hours_verified }, new Date(cursor)).state
      : null;
    const endState = o.place
      ? getOpenStatus(
          o.place.hours,
          { verified: o.place.hours_verified },
          new Date(cursor + Math.max(1, dur - 5) * 60_000),
        ).state
      : null;
    const openState: PlanStop["open"] = o.event
      ? o.openState
      : scheduledState === "open" && (endState === "open" || endState === "closing-soon")
        ? "open"
        : scheduledState === "closed" || endState === "closed"
          ? "closed"
          : "unknown";
    // A known-closed place never belongs in a ready-to-use plan. Do not spend
    // the user's time budget on it; the next valid stop keeps the same slot.
    if (openState === "closed") continue;
    cursor += dur * 60_000;
    const notes = o.place ? fieldNotesFor(o.place.slug) : null;
    const tip = notes?.parking?.text ?? notes?.insider?.[0]?.text;
    stops.push({
      order: stops.length + 1,
      at,
      duration_min: dur,
      why: o.place ? whyFor({ ...o.place, open_status: getOpenStatus(o.place.hours, { verified: o.place.hours_verified }, new Date(at)) } as PlaceCardData) : o.why,
      open: openState,
      place: o.place,
      event: o.event,
      photo_url: o.photo_url ?? o.event?.hero_image,
      ...(travel ? {
        travel_from_previous_min: travel.minutes,
        travel_from_previous_m: travel.meters,
        travel_mode: travel.mode,
      } : {}),
      ...(tip ? { tip } : {}),
    });
    if (geom) previous = geom;
  }
  return stops;
}

export function buildPlan(input: PlanInputs): Plan {
  const { origin, now } = resolve(input);
  // Older callers already used start_at as their signal that the itinerary
  // was for a real clock window. Preserve that safe default. Ask Radius can
  // explicitly pass false for an undated draft that still needs clock labels.
  const requireVerifiedHours = input.require_verified_hours ?? Boolean(input.start_at);
  const resolvedInput: PlanInputs = {
    ...input,
    start_at: now.toISOString(),
    require_verified_hours: requireVerifiedHours,
  };
  const candidates = scoredCandidates(resolvedInput, origin, now);
  const slot = slotFor(now);

  const stopCount = Math.min(stopCountFor(input.duration_hours), input.max_stops ?? Infinity);
  const windowEnd = now.getTime() + input.duration_hours * 60 * 60_000;
  const seen = new Set<string>();
  const seenGroups = new Set<string>();
  const picks: Scored[] = [];
  let cursor = now.getTime();
  let previous = origin;

  while (picks.length < stopCount) {
    const choices = candidates
      .filter((candidate) => {
        if (seen.has(candidate.d.slug)) return false;
        if (seenGroups.has(experienceGroup(candidate.d.category))) return false;
        const travel = picks.length > 0 ? estimateTravel(previous, candidate.d.geom) : null;
        const arrival = new Date(cursor + (travel?.minutes ?? 0) * 60_000);
        const duration = durationFor(candidate.d.category);
        if (arrival.getTime() + duration * 60_000 > windowEnd) return false;
        return availableForStop(
          candidate.d as Place,
          arrival,
          duration,
          requireVerifiedHours,
        );
      })
      .sort((a, b) => {
        if (input.anchor_slug) {
          if (a.d.slug === input.anchor_slug) return -1;
          if (b.d.slug === input.anchor_slug) return 1;
        }
        const aTravel = picks.length > 0 ? estimateTravel(previous, a.d.geom).minutes : 0;
        const bTravel = picks.length > 0 ? estimateTravel(previous, b.d.geom).minutes : 0;
        const aOpening = picks.length === 0 ? openingStopBonus(a.d.category, resolvedInput, slot) : 0;
        const bOpening = picks.length === 0 ? openingStopBonus(b.d.category, resolvedInput, slot) : 0;
        return (b.score + bOpening - bTravel * 0.08) - (a.score + aOpening - aTravel * 0.08);
      });
    const choice = choices[0];
    if (!choice) break;
    const travel = picks.length > 0 ? estimateTravel(previous, choice.d.geom) : null;
    cursor += (travel?.minutes ?? 0) * 60_000;
    cursor += durationFor(choice.d.category) * 60_000;
    previous = choice.d.geom;
    seen.add(choice.d.slug);
    seenGroups.add(experienceGroup(choice.d.category));
    picks.push(choice);
  }

  const items = picks.map((c) => ({
    place: c.d as Place,
    photo_url: c.d.google_photo_url,
    openState: c.d.open_status.state === "closing-soon" ? ("open" as const)
      : c.d.open_status.state === "open" ? ("open" as const)
      : c.d.open_status.state === "closed" ? ("closed" as const)
      : ("unknown" as const),
    why: whyFor(c.d),
  }));
  const ordered: Array<{ place?: Place; event?: Event; openState: PlanStop["open"]; why: string; photo_url?: string }> = [...items];
  // Events are intentionally not auto-inserted here. The client-safe seed
  // list cannot prove that an event is public, still active, relevant, and
  // reachable inside this route. Event-aware planning belongs on the server
  // against the unified public feed; a place-only plan is safer until then.
  const stops = schedule(ordered, now);
  const spec: PlanSpec = {
    v: 1,
    i: shareSafeInputs(resolvedInput),
    s: stops.map((st) => (st.place ? { p: st.place.slug } : { e: st.event!.slug })),
  };

  return {
    title: titleFor(resolvedInput, now),
    summary: summaryFor(resolvedInput, stops),
    stops,
    share: encodeSpec(spec),
  };
}

/**
 * Rebuild the exact plan from a spec. Deterministic and grounded:
 * unknown or now closed slugs are dropped rather than invented, so an
 * old shared link degrades honestly instead of lying.
 */
export function reconstructPlan(spec: PlanSpec): Plan | null {
  if (spec?.v !== 1 || !Array.isArray(spec.s)) return null;
  const { origin, now } = resolve(spec.i);
  const resolvedInput: PlanInputs = { ...spec.i, start_at: now.toISOString() };
  const ordered: Array<{ place?: Place; event?: Event; openState: PlanStop["open"]; why: string; photo_url?: string }> = [];
  for (const ref of spec.s) {
    if ("p" in ref) {
      const p = clientPlaceBySlug(ref.p);
      if (!p || !isPublicPlanCandidate(p) || (spec.i.municipality && p.municipality !== spec.i.municipality)) continue;
      const d: PlaceCardData = { ...p, distance_m: haversineMeters(origin, p.geom) };
      ordered.push({
        place: p,
        photo_url: d.google_photo_url,
        openState: d.open_status.state === "closed" ? "closed"
          : d.open_status.state === "open" || d.open_status.state === "closing-soon" ? "open"
          : "unknown",
        why: whyFor(d),
      });
    } else {
      const e = EVENT_BY_SLUG[ref.e];
      if (!e || (spec.i.municipality && e.municipality !== spec.i.municipality)) continue;
      ordered.push({ event: e, openState: "open", why: `Live: ${e.title} at ${e.venue_name}.` });
    }
  }
  if (ordered.length === 0) return null;
  const stops = schedule(ordered, now);
  const safeSpec: PlanSpec = {
    ...spec,
    i: shareSafeInputs(resolvedInput),
    s: stops.map((stop) => stop.place ? { p: stop.place.slug } : { e: stop.event!.slug }),
  };
  return {
    title: titleFor(resolvedInput, now),
    summary: summaryFor(resolvedInput, stops),
    stops,
    share: encodeSpec(safeSpec),
  };
}

// URL safe base64 of the JSON spec. Small (slugs only), so links stay
// short enough to share in a text message.
function shareSafeInputs(input: PlanInputs): PlanInputs {
  // Exact device coordinates do not belong in a reversible share URL. A
  // municipality is public context; the chosen stops preserve the route.
  const safe = { ...input };
  delete safe.start_near;
  return safe;
}

export function encodeSpec(spec: PlanSpec): string {
  const json = JSON.stringify({ ...spec, i: shareSafeInputs(spec.i) });
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSpec(token: string): PlanSpec | null {
  try {
    if (!token || token.length > 8_000) return null;
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(b64, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(b64)));
    const spec = JSON.parse(json) as PlanSpec;
    if (!spec || spec.v !== 1 || !spec.i || typeof spec.i !== "object") return null;
    if (!Array.isArray(spec.s) || spec.s.length > 8) return null;
    if (!["solo", "date", "family", "friends", "visitor"].includes(spec.i.audience)) return null;
    if (!["easy", "active", "cultural", "outdoors", "food"].includes(spec.i.vibe)) return null;
    if (![2, 3, 4, 6].includes(spec.i.duration_hours)) return null;
    if (spec.i.start_at && !Number.isFinite(new Date(spec.i.start_at).getTime())) return null;
    if (spec.i.municipality && !MUNICIPALITIES.some((town) => town.slug === spec.i.municipality)) return null;
    const validRefs = spec.s.every((ref) => {
      if (!ref || typeof ref !== "object") return false;
      if ("p" in ref) return typeof ref.p === "string" && ref.p.length > 0 && ref.p.length < 160;
      if ("e" in ref) return typeof ref.e === "string" && ref.e.length > 0 && ref.e.length < 160;
      return false;
    });
    return validRefs ? spec : null;
  } catch {
    return null;
  }
}

/**
 * Replace the place at `index` with the next best unused alternative,
 * keeping category diversity. Event stops are left alone. Returns a new
 * spec; the caller reconstructs the plan from it. This is what powers
 * "swap this stop" so a plan becomes the user's own.
 */
export function swapStopInSpec(spec: PlanSpec, index: number): PlanSpec {
  const ref = spec.s[index];
  if (!ref || !("p" in ref)) return spec; // out of range or an event stop
  const { origin, now } = resolve(spec.i);
  const inUse = new Set(spec.s.filter((r): r is { p: string } => "p" in r).map((r) => r.p));
  const otherCats = new Set(
    spec.s
      .filter((r): r is { p: string } => "p" in r && r.p !== ref.p)
      .map((r) => clientPlaceBySlug(r.p)?.category)
      .filter(Boolean) as string[],
  );
  const ranked = scoredCandidates(spec.i, origin, now);
  const replacement =
    ranked.find((c) => !inUse.has(c.d.slug) && !otherCats.has(c.d.category)) ??
    ranked.find((c) => !inUse.has(c.d.slug));
  if (!replacement) return spec;
  const next = { ...spec, s: spec.s.map((r, i) => (i === index ? { p: replacement.d.slug } : r)) };
  return next;
}

/* ── User agency: pick, add, pin (the "choose, don't be told" layer) ──
 *
 * swapStopInSpec above is the BLIND swap (next best alternative). The
 * functions below let the user choose instead: see real alternatives
 * for a slot and pick one, drop a specific saved place into the plan,
 * and pin stops so a reshuffle only re-rolls the rest. All are pure
 * spec edits — the caller reconstructs the plan from the returned spec,
 * so the share token stays the source of truth.
 */

/** A pickable alternative for one slot, with enough to show in a list. */
export type PlanAlternative = {
  slug: string;
  name: string;
  category: string;
  categoryName: string;
  why: string;
  photo_url?: string;
};

/**
 * The top real alternatives for the place at `index`. Two modes:
 *  - No `category`: unused and category-diverse against the OTHER stops,
 *    so the default chooser never doubles up a kind the plan already has.
 *  - Explicit `category` (the Swap chooser's category switcher): only that
 *    category, honored even if another stop shares it — the user asked for
 *    "make this a different KIND of stop," so we respect the choice.
 * Always excludes places already in the plan. Powers the Swap chooser.
 * Empty for an event stop or an out-of-range index.
 */
export function slotAlternatives(
  spec: PlanSpec,
  index: number,
  category?: string,
  limit = 5,
): PlanAlternative[] {
  const ref = spec.s[index];
  if (!ref || !("p" in ref)) return [];
  const { origin, now } = resolve(spec.i);
  const inUse = new Set(
    spec.s.filter((r): r is { p: string } => "p" in r).map((r) => r.p),
  );
  const otherCats = new Set(
    spec.s
      .filter((r, i): r is { p: string } => i !== index && "p" in r)
      .map((r) => clientPlaceBySlug(r.p)?.category)
      .filter(Boolean) as string[],
  );
  const ranked = scoredCandidates(spec.i, origin, now);
  const out: PlanAlternative[] = [];
  for (const c of ranked) {
    if (out.length >= limit) break;
    if (inUse.has(c.d.slug)) continue;
    if (category) {
      if (c.d.category !== category) continue;
    } else if (otherCats.has(c.d.category)) {
      continue;
    }
    out.push({
      slug: c.d.slug,
      name: c.d.name,
      category: c.d.category,
      categoryName: CATEGORY_BY_SLUG[c.d.category]?.name ?? c.d.category,
      why: whyFor(c.d),
      photo_url: c.d.google_photo_url,
    });
  }
  return out;
}

/** A category the user could turn a slot into, with how many unused
 *  candidates back it. Powers the Swap chooser's category switcher. */
export type PlanSlotCategory = {
  category: string;
  name: string;
  count: number;
  current: boolean;
};

/**
 * The categories this slot could become — each backed by at least one
 * unused candidate near the start, ordered by candidate strength, with
 * the slot's current category flagged and floated to the front so "this
 * kind" reads as the default. Lets the Swap chooser offer a real "change
 * what kind of stop this is" control. Empty for an event stop or an
 * out-of-range index.
 */
export function slotCategories(spec: PlanSpec, index: number, limit = 8): PlanSlotCategory[] {
  const ref = spec.s[index];
  if (!ref || !("p" in ref)) return [];
  const { origin, now } = resolve(spec.i);
  const inUse = new Set(
    spec.s.filter((r): r is { p: string } => "p" in r).map((r) => r.p),
  );
  const currentCat = clientPlaceBySlug(ref.p)?.category;
  const ranked = scoredCandidates(spec.i, origin, now);
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const c of ranked) {
    if (inUse.has(c.d.slug)) continue;
    if (!counts.has(c.d.category)) order.push(c.d.category); // first-seen = strongest
    counts.set(c.d.category, (counts.get(c.d.category) ?? 0) + 1);
  }
  let cats = order.slice(0, limit);
  if (currentCat) {
    cats = [currentCat, ...cats.filter((c) => c !== currentCat)].slice(0, limit);
  }
  return cats.map((cat) => ({
    category: cat,
    name: CATEGORY_BY_SLUG[cat]?.name ?? cat,
    count: counts.get(cat) ?? 0,
    current: cat === currentCat,
  }));
}

/** Set the place at `index` to a specific slug the user chose. No-op
 *  for an event stop, an unresolved slug, or a slug already in the plan. */
export function setStopInSpec(spec: PlanSpec, index: number, slug: string): PlanSpec {
  const ref = spec.s[index];
  if (!ref || !("p" in ref)) return spec;
  if (!clientPlaceBySlug(slug)) return spec;
  if (spec.s.some((r, i) => i !== index && "p" in r && r.p === slug)) return spec;
  return { ...spec, s: spec.s.map((r, i) => (i === index ? { p: slug } : r)) };
}

/** Append a specific place the user picked (e.g. from Saved). No-op for
 *  an unresolved or already-present slug. schedule() re-times on rebuild. */
export function addStopToSpec(spec: PlanSpec, slug: string): PlanSpec {
  if (!clientPlaceBySlug(slug)) return spec;
  if (spec.s.some((r) => "p" in r && r.p === slug)) return spec;
  return { ...spec, s: [...spec.s, { p: slug }] };
}

/**
 * Re-roll the plan, keeping pinned places (and all events) in their
 * slots and regenerating only the unpinned ones — the "pin what you
 * love, shuffle the rest" move. `seed` varies the candidate ordering so
 * repeated taps give different valid fills.
 */
export function reshuffleSpec(spec: PlanSpec, pinnedSlugs: string[], seed: number): PlanSpec {
  const pinned = new Set(pinnedSlugs);
  const inputs: PlanInputs = { ...spec.i, seed };
  const { origin, now } = resolve(inputs);

  // What we're keeping: pinned places + every event stop.
  const keptSlugs = new Set<string>();
  const keptCats = new Set<string>();
  let need = 0;
  for (const r of spec.s) {
    if ("e" in r) continue;
    if (pinned.has(r.p)) {
      keptSlugs.add(r.p);
      const cat = clientPlaceBySlug(r.p)?.category;
      if (cat) keptCats.add(cat);
    } else {
      need += 1;
    }
  }

  // Fresh fills for the unpinned slots: unused, category-diverse. We
  // group the eligible candidates by category (kept in score order),
  // then for each slot pick from that category's TOP WINDOW using the
  // seed — so repeated Shuffle taps actually rotate the unpinned stops
  // instead of re-picking the same #1 every time. Taking the strict top
  // made Shuffle look broken whenever a category had a dominant winner.
  const ranked = scoredCandidates(inputs, origin, now);
  const WINDOW = 5;
  const byCat = new Map<string, Scored[]>();
  for (const c of ranked) {
    if (keptSlugs.has(c.d.slug)) continue;
    if (keptCats.has(c.d.category)) continue; // pinned categories excluded
    const arr = byCat.get(c.d.category);
    if (arr) arr.push(c);
    else byCat.set(c.d.category, [c]); // first-seen = score order = strength
  }
  const fills: string[] = [];
  for (const [cat, pool] of byCat) {
    if (fills.length >= need) break;
    const win = pool.slice(0, WINDOW);
    const pick = win[hashStr(`${cat}:${seed}`) % win.length];
    keptSlugs.add(pick.d.slug);
    keptCats.add(cat);
    fills.push(pick.d.slug);
  }

  // Rebuild in place: pinned/events stay put, unpinned slots take the
  // next fill (or keep their old ref if fills run dry — rare).
  let fi = 0;
  const s = spec.s.map((r) => {
    if ("e" in r || pinned.has(r.p)) return r;
    const fill = fills[fi++];
    return fill ? { p: fill } : r;
  });
  return { ...spec, i: inputs, s };
}

/** The scheduled stop-minutes total — the SAME number the hero's mono
 *  "N min total" chip sums (PlanBuilder.totalMinutes), so the title and
 *  the chip can never disagree about how long the plan really runs. */
function plannedMinutes(stops: PlanStop[]): number {
  if (stops.length === 0) return 0;
  const first = new Date(stops[0].at).getTime();
  const last = stops[stops.length - 1];
  const end = new Date(last.at).getTime() + last.duration_min * 60_000;
  return Math.max(0, Math.round((end - first) / 60_000));
}

/** 280 → "about 4½ hours"; 60 → "about an hour"; 90 → "about 1½ hours". */
function hoursPhrase(totalMin: number): string {
  const half = Math.round((totalMin / 60) * 2) / 2;
  if (half <= 0.5) return "about half an hour";
  if (half === 1) return "about an hour";
  const whole = Math.floor(half);
  return half === whole ? `about ${whole} hours` : `about ${whole}½ hours`;
}

function titleFor(input: PlanInputs, now: Date): string {
  const seg = slotFor(now);
  if (input.audience === "date") return seg === "evening" ? "Date night" : `A ${seg} date`;
  if (input.audience === "friends") return `A ${seg} with friends`;
  if (input.audience === "family") return `A family ${seg}`;
  if (input.audience === "visitor") return `A ${seg} in Frederick`;
  return `A solo ${seg}`;
}

function summaryFor(input: PlanInputs, stops: PlanStop[]): string {
  if (stops.length === 0) {
    return "Could not find a good match. Try a different vibe, more time, or a wider start.";
  }
  const town = input.municipality
    ? MUNICIPALITIES.find((item) => item.slug === input.municipality)?.name
    : null;
  const area = town ?? "Frederick County";
  const total = hoursPhrase(plannedMinutes(stops));
  return `${stops.length === 1 ? "One stop" : `${stops.length} stops`} in ${area}, with ${total} scheduled.`;
}

// Optional Claude narrative; only runs when ANTHROPIC_API_KEY is set.
// Falls back silently to the structured plan.
export async function narratePlanWithClaude(plan: Plan): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const stopText = plan.stops
      .map((s, i) => `${i + 1}. ${s.place?.name ?? s.event?.title}: ${s.why}`)
      .join("\n");
    const prompt = [
      "You are a local Frederick County, Maryland concierge.",
      `Plan: ${plan.title}.`,
      `Stops:\n${stopText}`,
      "Write two complete sentences that explain how the stops fit together.",
      "Use a warm, direct voice without inventing details or repeating place names.",
      "Do not use fragments, slogans, an automatic three-part list, or promotional filler.",
    ].join("\n\n");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const narrative = data.content?.[0]?.text?.replace(/—/g, ",").replace(/\s+/g, " ").trim();
    return narrative || null;
  } catch {
    return null;
  }
}

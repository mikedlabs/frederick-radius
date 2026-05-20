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
import { upcomingEvents, EVENT_BY_SLUG, type Event } from "@/data/events";
import { haversineMeters, FREDERICK_CENTER, formatDistance, type LngLat } from "@/lib/geo";

export type PlanInputs = {
  audience: "solo" | "date" | "family" | "friends" | "visitor";
  vibe: "easy" | "active" | "cultural" | "outdoors" | "food";
  duration_hours: 2 | 3 | 4 | 6;
  /** ISO string so the spec is serializable. Defaults to now. */
  start_at?: string;
  start_near?: LngLat;
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
  place?: Place;
  event?: Event;
  /** A real Google place photo when enrichment supplied one. The
   *  card renders an empty stop block when omitted — never a stock
   *  or fabricated image. */
  photo_url?: string;
};

export type Plan = {
  title: string;
  summary: string;
  stops: PlanStop[];
  narrative?: string;
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

const DURATION_MIN: Record<string, number> = {
  coffee: 40, bakery: 30, restaurant: 80, pizza: 60, bar: 60, brewery: 70,
  market: 35, museum: 75, gallery: 45, theater: 120, music: 90, arts: 45,
  park: 50, trail: 60, playground: 40, shopping: 40, wellness: 60,
};
const DEFAULT_DURATION = 45;
const TRAVEL_MIN = 12; // rough hop between stops in a compact county seat

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
  return clientPlaces()
    .map((p) => {
      const d: PlaceCardData = { ...p, distance_m: haversineMeters(origin, p.geom) };
      const distance = d.distance_m ?? haversineMeters(origin, p.geom);
      const base = categoryScore(p.category, input.vibe, slot);
      const rating = d.google_rating ? (d.google_rating - 3.5) * 1.2 : 0;
      // Seed-driven jitter (±0.6) when a seed is set, otherwise zero.
      // Bounded so a low-fit place can't elbow out a great one — only
      // changes the ordering among similarly-strong candidates.
      const jitter = seed === 0
        ? 0
        : ((hashStr(`${p.slug}:${seed}`) % 1000) / 1000 - 0.5) * 1.2;
      const score =
        (base +
          d.feature_score * 0.6 +
          rating +
          openWeight(d.open_status.state) +
          tagBonus(p, input.vibe, input.audience) +
          jitter) /
        Math.log(Math.max(2, distance / 250)); // gentle distance dampener
      return { d, score, distance };
    })
    .filter((c) => c.distance < 20_000 && c.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Greedy nearest neighbour ordering so the stops form a sane route. */
function routeOrder(picks: Scored[], origin: LngLat): Scored[] {
  const remaining = [...picks];
  const ordered: Scored[] = [];
  let from = origin;
  while (remaining.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineMeters(from, remaining[i].d.geom);
      if (dist < bestD) { bestD = dist; best = i; }
    }
    const next = remaining.splice(best, 1)[0];
    ordered.push(next);
    from = next.d.geom;
  }
  return ordered;
}

function durationFor(cat: string): number {
  return DURATION_MIN[cat] ?? DEFAULT_DURATION;
}

function whyFor(d: PlaceCardData, input: PlanInputs): string {
  const dist = formatDistance(d.distance_m ?? 0);
  const rating = d.google_rating ? `${d.google_rating.toFixed(1)} on Google, ` : "";
  const openBit =
    d.open_status.state === "open" ? "open now"
    : d.open_status.state === "closing-soon" ? "open but closing soon"
    : d.open_status.state === "closed" ? "check hours, may be closed"
    : "hours not confirmed";
  const fit: Record<PlanInputs["audience"], string> = {
    date: "easy for a date", family: "works with kids", solo: "good solo",
    friends: "fine with a group", visitor: "a local pick",
  };
  return `${rating}${openBit}. ${dist} from your start, ${fit[input.audience]}.`;
}

function stopCountFor(hours: PlanInputs["duration_hours"]): number {
  if (hours <= 2) return 2;
  if (hours <= 3) return 3;
  if (hours <= 4) return 4;
  return 5;
}

/** Resolve inputs to a concrete origin and start time. */
function resolve(input: PlanInputs): { origin: LngLat; now: Date } {
  return {
    origin: input.start_near ?? FREDERICK_CENTER,
    now: input.start_at ? new Date(input.start_at) : new Date(),
  };
}

/** Lay stops out on the clock from the start time. Pure. */
function schedule(
  ordered: Array<{ place?: Place; event?: Event; openState: PlanStop["open"]; why: string; photo_url?: string }>,
  start: Date,
): PlanStop[] {
  let cursor = start.getTime();
  return ordered.map((o, i) => {
    // An event anchors to its real start time when that is later.
    if (o.event) {
      const evStart = new Date(o.event.starts_at).getTime();
      if (evStart > cursor) cursor = evStart;
    }
    const cat = o.place?.category ?? "event";
    const dur = o.event ? 90 : durationFor(cat);
    const at = new Date(cursor).toISOString();
    cursor += (dur + TRAVEL_MIN) * 60_000;
    return {
      order: i + 1,
      at,
      duration_min: dur,
      why: o.why,
      open: o.openState,
      place: o.place,
      event: o.event,
      photo_url: o.photo_url ?? o.event?.hero_image,
    };
  });
}

export function buildPlan(input: PlanInputs): Plan {
  const { origin, now } = resolve(input);
  const candidates = scoredCandidates(input, origin, now);

  const stopCount = stopCountFor(input.duration_hours);
  const seen = new Set<string>();
  const picks: Scored[] = [];
  for (const c of candidates) {
    if (picks.length >= stopCount) break;
    if (seen.has(c.d.slug)) continue;
    // Diversity: no two stops of the same category.
    if (picks.some((x) => x.d.category === c.d.category)) continue;
    seen.add(c.d.slug);
    picks.push(c);
  }

  const routed = routeOrder(picks, origin);

  // A real event inside the window earns a slot.
  const windowEnd = new Date(now.getTime() + input.duration_hours * 3_600_000);
  const event = upcomingEvents(now).find((e) => {
    const s = new Date(e.starts_at);
    return s >= now && s <= windowEnd;
  });

  const items = routed.map((c) => ({
    place: c.d as Place,
    photo_url: c.d.google_photo_url,
    openState: c.d.open_status.state === "closing-soon" ? ("open" as const)
      : c.d.open_status.state === "open" ? ("open" as const)
      : c.d.open_status.state === "closed" ? ("closed" as const)
      : ("unknown" as const),
    why: whyFor(c.d, input),
  }));
  const ordered: Array<{ place?: Place; event?: Event; openState: PlanStop["open"]; why: string; photo_url?: string }> = [...items];
  if (event) {
    ordered.push({
      event,
      openState: "open",
      why: `Live: ${event.title} at ${event.venue_name}.`,
    });
  }

  const stops = schedule(ordered, now);
  const spec: PlanSpec = {
    v: 1,
    i: input,
    s: stops.map((st) => (st.place ? { p: st.place.slug } : { e: st.event!.slug })),
  };

  return {
    title: titleFor(input, now),
    summary: summaryFor(input, stops),
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
  const ordered: Array<{ place?: Place; event?: Event; openState: PlanStop["open"]; why: string; photo_url?: string }> = [];
  for (const ref of spec.s) {
    if ("p" in ref) {
      const p = clientPlaceBySlug(ref.p);
      if (!p) continue;
      const d: PlaceCardData = { ...p, distance_m: haversineMeters(origin, p.geom) };
      ordered.push({
        place: p,
        photo_url: d.google_photo_url,
        openState: d.open_status.state === "closed" ? "closed"
          : d.open_status.state === "open" || d.open_status.state === "closing-soon" ? "open"
          : "unknown",
        why: whyFor(d, spec.i),
      });
    } else {
      const e = EVENT_BY_SLUG[ref.e];
      if (!e) continue;
      ordered.push({ event: e, openState: "open", why: `Live: ${e.title} at ${e.venue_name}.` });
    }
  }
  if (ordered.length === 0) return null;
  const stops = schedule(ordered, now);
  return {
    title: titleFor(spec.i, now),
    summary: summaryFor(spec.i, stops),
    stops,
    share: encodeSpec(spec),
  };
}

// URL safe base64 of the JSON spec. Small (slugs only), so links stay
// short enough to share in a text message.
export function encodeSpec(spec: PlanSpec): string {
  const json = JSON.stringify(spec);
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSpec(token: string): PlanSpec | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(b64, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(b64)));
    const spec = JSON.parse(json) as PlanSpec;
    return spec?.v === 1 ? spec : null;
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

function titleFor(input: PlanInputs, now: Date): string {
  const seg = slotFor(now);
  const vibeWord: Record<PlanInputs["vibe"], string> = {
    easy: "An easy", active: "An active", cultural: "A cultural",
    outdoors: "An outdoor", food: "A food-first",
  };
  return `${vibeWord[input.vibe]} ${input.duration_hours}-hour ${seg}`;
}

function summaryFor(input: PlanInputs, stops: PlanStop[]): string {
  if (stops.length === 0) {
    return "Could not find a good match. Try a different vibe, more time, or a wider start.";
  }
  const audienceFor: Record<PlanInputs["audience"], string> = {
    solo: "going solo", date: "date night", family: "with the kids",
    friends: "with friends", visitor: "if you are visiting",
  };
  return `${stops.length} stops for ${audienceFor[input.audience]}. Real places, nothing invented.`;
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
      "Write 2 sentences that tie the stops together: flow, timing, what to expect.",
      "Do not invent details. Do not restate the names. Read like a thoughtful friend.",
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
    return data.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

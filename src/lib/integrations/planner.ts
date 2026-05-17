/**
 * Itinerary builder — "Plan my evening" / "Plan my afternoon".
 *
 * Always rule-based; if ANTHROPIC_API_KEY is set, we add a Claude-generated
 * narrative weaving the picks together. Either way, every recommendation
 * is grounded in our actual data — no hallucinated places.
 */

import type { Place } from "@/data/places";
import { publicPlaces } from "@/lib/loaders/places";
import { upcomingEvents, type Event } from "@/data/events";
import { haversineMeters, FREDERICK_CENTER, formatDistance } from "@/lib/geo";

export type PlanInputs = {
  audience: "solo" | "date" | "family" | "friends" | "visitor";
  vibe: "easy" | "active" | "cultural" | "outdoors" | "food";
  duration_hours: 2 | 3 | 4 | 6;
  start_at?: Date;
  start_near?: { lng: number; lat: number };
};

export type PlanStop = {
  order: number;
  duration_min: number;
  why: string;
  place?: Place;
  event?: Event;
};

export type Plan = {
  title: string;
  summary: string;
  stops: PlanStop[];
  narrative?: string;
};

// Tag scoring per vibe + audience
const VIBE_TAGS: Record<PlanInputs["vibe"], string[]> = {
  easy: ["cozy", "indoor", "rainy-day"],
  active: ["outdoor", "kids-6-12", "bike-rack"],
  cultural: ["arts", "first-friday", "indoor", "live-music"],
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

function scorePlace(p: Place, vibe: PlanInputs["vibe"], audience: PlanInputs["audience"]): number {
  const tags = p.tags ?? [];
  const vibeHits = VIBE_TAGS[vibe].filter((t) => tags.includes(t)).length;
  const audHits = AUDIENCE_BOOST[audience].filter((t) => tags.includes(t)).length;
  const categoryBoost = matchesCategoryForVibe(p.category, vibe) ? 2 : 0;
  return vibeHits * 1.5 + audHits * 1.2 + categoryBoost + p.feature_score * 0.5;
}

function matchesCategoryForVibe(cat: string, vibe: PlanInputs["vibe"]): boolean {
  if (vibe === "cultural") return ["theater", "museum", "gallery", "music", "arts"].includes(cat);
  if (vibe === "outdoors") return ["park", "trail", "playground"].includes(cat);
  if (vibe === "food") return ["restaurant", "coffee", "bar", "brewery", "bakery", "market"].includes(cat);
  if (vibe === "active") return ["park", "trail", "playground", "yoga", "wellness"].includes(cat);
  return true; // "easy" accepts anything
}

export function buildPlan(input: PlanInputs): Plan {
  const origin = input.start_near ?? FREDERICK_CENTER;
  const now = input.start_at ?? new Date();

  const candidatePool = publicPlaces()
    .filter((p) => p.is_operational === "operational")
    .map((p) => ({
      place: p,
      score: scorePlace(p, input.vibe, input.audience),
      distance: haversineMeters(origin, p.geom),
    }))
    .filter((c) => c.distance < 25_000)
    .sort((a, b) => b.score / Math.log(c_dist(b.distance)) - a.score / Math.log(c_dist(a.distance)));

  // Pick 2-3 stops based on duration
  const stopCount = input.duration_hours <= 2 ? 2 : input.duration_hours <= 4 ? 3 : 4;
  const seen = new Set<string>();
  const picks: typeof candidatePool = [];
  for (const c of candidatePool) {
    if (picks.length >= stopCount) break;
    // Diversity: don't pick two of the same category
    if (picks.some((x) => x.place.category === c.place.category)) continue;
    if (seen.has(c.place.slug)) continue;
    seen.add(c.place.slug);
    picks.push(c);
  }

  // Add an event that overlaps if any
  const events = upcomingEvents(now).filter((e) => {
    const s = new Date(e.starts_at);
    const endOfWindow = new Date(now);
    endOfWindow.setHours(endOfWindow.getHours() + input.duration_hours);
    return s >= now && s <= endOfWindow;
  });
  const relevantEvent = events[0];

  const stops: PlanStop[] = picks.map((c, i) => ({
    order: i + 1,
    duration_min: Math.floor((input.duration_hours * 60) / (stopCount + (relevantEvent ? 1 : 0))),
    why: whyForPlace(c.place, input, c.distance),
    place: c.place,
  }));

  if (relevantEvent) {
    stops.push({
      order: stops.length + 1,
      duration_min: 90,
      why: `Live now: ${relevantEvent.title} at ${relevantEvent.venue_name}.`,
      event: relevantEvent,
    });
  }

  return {
    title: titleFor(input),
    summary: summaryFor(input, stops),
    stops,
  };
}

function c_dist(d: number): number {
  return Math.max(2, d / 200); // log dampener; favors closer but not zero-distance
}

function whyForPlace(p: Place, input: PlanInputs, distance: number): string {
  const dist = formatDistance(distance);
  const audienceFit: Record<PlanInputs["audience"], string> = {
    date: "good for a date",
    family: "works for the kids",
    solo: "great solo",
    friends: "easy with a group",
    visitor: "what locals show off",
  };
  const fit = audienceFit[input.audience];
  if (p.category === "park" || p.category === "trail") return `Stretch the legs. ${dist} away, ${fit}.`;
  if (p.category === "museum" || p.category === "gallery") return `Indoor anchor for the plan. ${dist} away, ${fit}.`;
  if (p.category === "theater") return `If something's on tonight, the program is here. ${dist} away.`;
  if (p.category === "park") return `${dist} away — sun or shade, depending.`;
  return `${dist} from your start, ${fit}.`;
}

function titleFor(input: PlanInputs): string {
  const ofDay = input.start_at
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" }).format(input.start_at)
    : null;
  const seg = !ofDay ? "evening" :
    parseInt(ofDay) >= 17 || parseInt(ofDay) < 4 ? "evening" :
    parseInt(ofDay) >= 12 ? "afternoon" : "morning";
  const vibeWord: Record<PlanInputs["vibe"], string> = {
    easy: "An easy", active: "An active", cultural: "A cultural",
    outdoors: "An outdoor", food: "A food-first",
  };
  return `${vibeWord[input.vibe]} ${input.duration_hours}-hour ${seg}`;
}

function summaryFor(input: PlanInputs, stops: PlanStop[]): string {
  if (stops.length === 0) {
    return "Couldn't find a great match. Try a different vibe or shorter duration.";
  }
  const audienceFor: Record<PlanInputs["audience"], string> = {
    solo: "for going solo",
    date: "for date night",
    family: "with the kids",
    friends: "with friends",
    visitor: "if you're visiting",
  };
  return `${stops.length} stops · ${audienceFor[input.audience]}. Verified places only.`;
}

// Optional Claude-narrative pass; activated only when ANTHROPIC_API_KEY is set.
// We pass the structured plan and ask for a 2–3 sentence connective tissue.
// Falls back silently to the structured plan if anything goes wrong.
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
      "Write 2 sentences that tie the stops together — flow, timing, what to expect.",
      "Don't invent details. Don't restate the names — read like a thoughtful friend.",
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

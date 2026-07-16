import type { PlaceCardData } from "@/lib/loaders/places";
import type { SearchHit } from "@/lib/search";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";

export type AskTasteSignals = {
  savedPlaceSlugs: string[];
  interests: string[];
};

export type AskTasteProfile = {
  categories: ReadonlyMap<string, number>;
  tags: ReadonlyMap<string, number>;
  interests: ReadonlySet<string>;
  signalCount: number;
};

const MAX_SAVED = 30;
const MAX_INTERESTS = 12;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9-]{0,79}$/;

function cleanTokens(value: unknown, limit: number, normalizeSpaces = false): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .map((item) => normalizeSpaces ? item.replace(/\s+/g, "-") : item)
      .filter((item) => SAFE_TOKEN.test(item)),
  )).slice(0, limit);
}

/** Treat personalization as explicit, bounded input. No inferred trait or
 * free-form profile text crosses the client/server boundary. */
export function normalizeTasteSignals(value: unknown): AskTasteSignals {
  const raw = value && typeof value === "object"
    ? value as { savedPlaceSlugs?: unknown; interests?: unknown }
    : {};
  return {
    savedPlaceSlugs: cleanTokens(raw.savedPlaceSlugs, MAX_SAVED),
    interests: cleanTokens(raw.interests, MAX_INTERESTS, true),
  };
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function buildTasteProfile(signals: AskTasteSignals): AskTasteProfile | null {
  const categories = new Map<string, number>();
  const tags = new Map<string, number>();
  let matchedSaves = 0;

  for (const slug of signals.savedPlaceSlugs) {
    const place = clientPlaceBySlug(slug);
    if (!place) continue;
    matchedSaves += 1;
    increment(categories, place.category, 2);
    for (const tag of (place.tags ?? []).slice(0, 8)) increment(tags, tag);
  }

  const interests = new Set(signals.interests);
  if (matchedSaves === 0 && interests.size === 0) return null;
  return {
    categories,
    tags,
    interests,
    signalCount: matchedSaves + interests.size,
  };
}

/** A small, explainable lift. Taste may break a close tie; it may never make a
 * weak semantic match beat a strong literal/location/hours match. */
export function tasteBoost(place: PlaceCardData, profile: AskTasteProfile): number {
  let score = Math.min(1.5, (profile.categories.get(place.category) ?? 0) * 0.3);
  for (const tag of place.tags ?? []) {
    score += Math.min(0.6, (profile.tags.get(tag) ?? 0) * 0.12);
    if (profile.interests.has(tag)) score += 0.35;
  }
  if (profile.interests.has(place.category)) score += 0.75;
  return Math.min(2.5, score);
}

export function rerankWithTaste(hits: SearchHit[], profile: AskTasteProfile | null): SearchHit[] {
  if (!profile) return hits;
  return hits
    .map((hit, index) => ({
      hit,
      index,
      adjusted: hit.score + (hit.type === "place" ? tasteBoost(hit.place, profile) : 0),
    }))
    .sort((a, b) => b.adjusted - a.adjusted || a.index - b.index)
    .map(({ hit, adjusted }) => ({ ...hit, score: adjusted }) as SearchHit);
}

export function tasteSummary(profile: AskTasteProfile | null): string | null {
  if (!profile) return null;
  const top = [...profile.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return `Tuned with your saved ${top.replace(/-/g, " ")} places`;
  return "Tuned with your selected interests";
}

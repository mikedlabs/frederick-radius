import type { AskDietaryConstraint } from "@/lib/ask/intent";

type DietaryPlace = {
  name: string;
  tags?: string[];
  short_blurb?: string | null;
  description?: string | null;
  known_for?: string[] | null;
  primary_type?: string | null;
};

const DIETARY_PATTERNS: Readonly<Record<AskDietaryConstraint, RegExp>> = {
  "gluten-free": /\bgluten[- ]free\b|\bceliac\b/i,
  vegan: /\bvegan\b/i,
  vegetarian: /\bvegetarian\b|\bveggie\b/i,
  "dairy-free": /\bdairy[- ]free\b|\blactose[- ]free\b/i,
  "nut-free": /\bnut[- ]free\b|\bpeanut[- ]free\b/i,
};

export function placeDietaryEvidence(
  place: DietaryPlace,
  requested: readonly AskDietaryConstraint[],
): AskDietaryConstraint[] {
  const text = [
    place.name,
    ...(place.tags ?? []),
    ...(place.known_for ?? []),
    place.short_blurb,
    place.description,
    place.primary_type,
  ].filter(Boolean).join(" ");
  return requested.filter((constraint) => DIETARY_PATTERNS[constraint].test(text));
}

export function placeMatchesDietary(
  place: DietaryPlace,
  requested: readonly AskDietaryConstraint[],
): boolean {
  return requested.length === 0 || placeDietaryEvidence(place, requested).length === requested.length;
}

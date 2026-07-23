import type { FoodTruckScheduleStop } from "./schedule-types";

const LEADING_WORDS = new Set(["a", "an", "and", "of", "the"]);
const VISUAL_TONES = [
  "var(--app-brand-press)",
  "var(--app-cool)",
  "var(--app-positive)",
  "var(--app-ink)",
] as const;

/** A compact, stable mark for the photo fallback. */
export function foodTruckInitials(name: string): string {
  const words = name
    .replace(/[’']/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .filter((word, index) => index > 0 || !LEADING_WORDS.has(word.toLowerCase()));

  if (words.length === 0) return "FT";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words.at(-1)![0]}`.toUpperCase();
}

/** Deterministic color variation without assigning a fake brand color. */
export function foodTruckVisualTone(slug: string): (typeof VISUAL_TONES)[number] {
  const score = Array.from(slug).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return VISUAL_TONES[score % VISUAL_TONES.length];
}

/** Directions use the published address when available and the venue otherwise. */
export function foodTruckStopDirectionsUrl(
  stop: Pick<FoodTruckScheduleStop, "address" | "venueName">,
): string {
  const destination = stop.address?.trim() || stop.venueName.trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

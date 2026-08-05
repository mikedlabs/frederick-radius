// The aerial drone archive behind the "Aerial photos" overlay — manifest,
// season palette, and per-season counts. Extracted from AppMap.tsx (#77) as a
// pure data module; no React, no map instance.

import { ACCENTS } from "@/data/categories";
// Aerial photo manifest — extracted from EXIF GPS by
// scripts/build-aerial-manifest.mjs. 104 georeferenced drone shots
// across the seasons folders. Powers the "Aerial photos" overlay,
// which is unique to Frederick Radius — no other map shows where
// each photo was taken in the county.
import AERIAL_MANIFEST from "@/../public/images/seasons/aerial-manifest.json";

export type AerialPhoto = {
  src: string;
  lat: number;
  lng: number;
  altM: number | null;
  bearing: number | null;
  takenAt: string | null;
  season: "spring" | "summer" | "fall" | "winter";
};
export const AERIAL_PHOTOS = AERIAL_MANIFEST as AerialPhoto[];

// The aerial "time machine": scrub the drone archive by season. Colors
// mirror the season tint on the pins (the decorative season palette) so a
// chip reads as the same season as the dots it controls. DOM chips, so
// var() is fine for the neutral "All".
export type AerialSeason = "all" | "spring" | "summer" | "fall" | "winter";
// One season → hue map for the chips, the GL dot paint, and the selected
// label, so the three can never drift apart. Shared hues come from ACCENTS.
export const SEASON_HEX = {
  spring: "#859076",
  summer: ACCENTS.amber,
  fall: ACCENTS.terracotta,
  winter: ACCENTS.slate,
} as const;
export const AERIAL_SEASONS: { key: AerialSeason; label: string; color: string }[] = [
  { key: "all", label: "All", color: "var(--app-ink-2)" },
  { key: "spring", label: "Spring", color: SEASON_HEX.spring },
  { key: "summer", label: "Summer", color: SEASON_HEX.summer },
  { key: "fall", label: "Fall", color: SEASON_HEX.fall },
  { key: "winter", label: "Winter", color: SEASON_HEX.winter },
];
export const AERIAL_SEASON_COUNTS: Record<string, number> = AERIAL_PHOTOS.reduce(
  (acc, p) => ((acc[p.season] = (acc[p.season] ?? 0) + 1), acc),
  {} as Record<string, number>,
);

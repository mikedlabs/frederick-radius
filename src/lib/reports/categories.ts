/**
 * Community-report taxonomy — the four Phase-1 categories and their subtypes,
 * plus per-category lifetime. Pure + client-safe (no React, no server imports):
 * shared by the submit UI, the /api/reports validator, and the loader.
 *
 * Categories (locked Phase 1): hazard · condition · tip · note.
 *   - hazard    — pothole, sidewalk, flooding, ice, broken light, debris.
 *                 The civic-good core; the future 311 loop hangs off this.
 *   - condition — live status: parking full, trail muddy, splash pad on, long
 *                 line, crowded. Short-lived; feeds Ask Radius.
 *   - tip       — helpful local heads-up. Free text.
 *   - note      — lightweight community color ("funny / local note"). Free text;
 *                 tightest content filter.
 */

export type ReportCategory = "hazard" | "condition" | "tip" | "note";

export type ReportSubtype = {
  key: string;
  label: string;
  glyph: string;
};

export type ReportCategoryDef = {
  key: ReportCategory;
  label: string;
  glyph: string;
  /** How long a report of this category stays live before it ages off the map
   *  (hours). Conditions are minutes-fresh; hazards persist until fixed. */
  ttlHours: number;
  /** A photo is required to submit (raises the bar on the abuse-prone ones). */
  photoRequired: boolean;
  subtypes: ReportSubtype[];
};

export const REPORT_CATEGORIES: ReportCategoryDef[] = [
  {
    key: "hazard",
    label: "Hazard",
    glyph: "\u{26A0}\u{FE0F}",
    ttlHours: 30 * 24, // until fixed / confirmed gone
    photoRequired: true,
    subtypes: [
      { key: "pothole", label: "Pothole", glyph: "\u{1F573}\u{FE0F}" },
      { key: "sidewalk", label: "Bad sidewalk", glyph: "\u{1F6B7}" },
      { key: "flooding", label: "Flooding", glyph: "\u{1F30A}" },
      { key: "ice", label: "Ice", glyph: "\u{1F9CA}" },
      { key: "light", label: "Broken light", glyph: "\u{1F4A1}" },
      { key: "debris", label: "Debris", glyph: "\u{1F6A7}" },
    ],
  },
  {
    key: "condition",
    label: "Conditions",
    glyph: "\u{1F4CD}",
    ttlHours: 6, // live status; goes stale fast
    photoRequired: false,
    subtypes: [
      { key: "parking_full", label: "Parking full", glyph: "\u{1F17F}\u{FE0F}" },
      { key: "trail_muddy", label: "Trail muddy", glyph: "\u{1F45F}" },
      { key: "splash_pad_on", label: "Splash pad on", glyph: "\u{1F4A6}" },
      { key: "long_line", label: "Long line", glyph: "\u{23F3}" },
      { key: "crowded", label: "Crowded", glyph: "\u{1F465}" },
    ],
  },
  {
    key: "tip",
    label: "Tip",
    glyph: "\u{1F4A1}",
    ttlHours: 90 * 24,
    photoRequired: false,
    subtypes: [],
  },
  {
    key: "note",
    label: "Local note",
    glyph: "\u{1F5E8}\u{FE0F}",
    ttlHours: 30 * 24,
    photoRequired: false,
    subtypes: [],
  },
];

export const REPORT_CATEGORY_BY_KEY: Record<string, ReportCategoryDef> = Object.fromEntries(
  REPORT_CATEGORIES.map((c) => [c.key, c]),
);

export function isReportCategory(s: unknown): s is ReportCategory {
  return typeof s === "string" && s in REPORT_CATEGORY_BY_KEY;
}

/** True when `subtype` is a valid member of `category` (empty subtype is always
 *  allowed — tips/notes have none, and a categoryonly hazard is fine). */
export function isValidSubtype(category: ReportCategory, subtype: string | undefined | null): boolean {
  if (!subtype) return true;
  const def = REPORT_CATEGORY_BY_KEY[category];
  return Boolean(def && def.subtypes.some((s) => s.key === subtype));
}

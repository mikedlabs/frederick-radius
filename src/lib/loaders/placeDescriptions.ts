import RAW from "@/data/descriptions.json" with { type: "json" };
import { classifyDescription } from "@/lib/copy-quality";
import { cleanFeedText } from "@/lib/format/text";

export type PlaceDescriptionSourceKind =
  | "business_website"
  | "official_source"
  | "field_note"
  | "radius_editorial";

export type PlaceDescriptionEntry = {
  blurb: string;
  status: "candidate" | "approved" | "rejected";
  source: {
    kind: PlaceDescriptionSourceKind;
    url?: string;
    fetched_at?: string;
  };
  generated_at?: string;
  reviewed_at?: string;
  reviewer_note?: string;
};

const DATA = RAW as Record<string, PlaceDescriptionEntry>;

/**
 * Return only editor-approved, source-backed Radius copy.
 *
 * Candidate text is deliberately invisible to public surfaces. This is the
 * final trust boundary between automated extraction and Radius-authored copy.
 */
export function approvedPlaceDescription(
  slug: string,
  name: string,
): PlaceDescriptionEntry | null {
  const entry = DATA[slug];
  if (!entry || entry.status !== "approved") return null;

  const blurb = cleanFeedText(entry.blurb).trim();
  if (classifyDescription(name, blurb, true) !== "reviewed") return null;
  if (!/[.!?]$/.test(blurb)) return null;
  if (entry.source.kind !== "radius_editorial" && !entry.source.url) return null;
  if (!entry.reviewed_at || !entry.reviewer_note?.trim()) return null;

  return { ...entry, blurb };
}

export function placeDescriptionEntries(): Record<string, PlaceDescriptionEntry> {
  return DATA;
}

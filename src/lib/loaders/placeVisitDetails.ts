import RAW from "@/data/place-visit-details.json" with { type: "json" };
import { cleanFeedText } from "@/lib/format/text";

export const VISIT_UNKNOWN_LABELS = {
  wifi: "Wi-Fi availability",
  noise_level: "Noise level",
  wheelchair_access: "Wheelchair access",
} as const;

export type VisitUnknown = keyof typeof VISIT_UNKNOWN_LABELS;
export type PlaceVisitDetails = {
  reviewed_at: string;
  facts: { text: string; source_url: string }[];
  actions: { label: string; url: string }[];
  unknowns: VisitUnknown[];
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

/** Publish reviewed practical facts only. This is not evidence of current
 * hours, room availability, access conditions or permission to reuse photos. */
export function validatePlaceVisitDetails(
  value: unknown,
  now: Date = new Date(),
): PlaceVisitDetails | null {
  if (!record(value) || value.status !== "approved" ||
      typeof value.reviewed_at !== "string") return null;
  // Dates are UTC calendar dates; timestamps must declare their timezone.
  // Check the written date separately so valid offset timestamps may cross UTC midnight.
  const iso = /^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/;
  if (!iso.test(value.reviewed_at)) return null;
  const writtenDay = value.reviewed_at.slice(0, 10);
  const day = new Date(`${writtenDay}T12:00:00Z`);
  const reviewed = new Date(value.reviewed_at);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== writtenDay ||
      !Number.isFinite(reviewed.getTime()) || !Number.isFinite(now.getTime()) ||
      reviewed.getTime() > now.getTime()) return null;
  if (!Array.isArray(value.facts) || value.facts.length < 1 || value.facts.length > 6 ||
      !Array.isArray(value.actions) || value.actions.length > 3 ||
      !Array.isArray(value.unknowns) || value.unknowns.length > 3) return null;

  const facts: PlaceVisitDetails["facts"] = [];
  for (const fact of value.facts) {
    if (!record(fact) || typeof fact.text !== "string") return null;
    const text = cleanFeedText(fact.text).trim();
    const source_url = sourceUrl(fact.source_url);
    if (!source_url || !text || text.length > 280 || !/[.!?]$/.test(text)) return null;
    facts.push({ text, source_url });
  }
  const actions: PlaceVisitDetails["actions"] = [];
  for (const action of value.actions) {
    if (!record(action) || typeof action.label !== "string") return null;
    const label = cleanFeedText(action.label).trim();
    const url = sourceUrl(action.url);
    if (!url || !label || label.length > 60) return null;
    actions.push({ label, url });
  }
  const unknowns: VisitUnknown[] = [];
  for (const key of value.unknowns) {
    if (typeof key !== "string" || !Object.hasOwn(VISIT_UNKNOWN_LABELS, key) ||
        unknowns.includes(key as VisitUnknown)) return null;
    unknowns.push(key as VisitUnknown);
  }
  return { reviewed_at: value.reviewed_at, facts, actions, unknowns };
}

/** Detail-only file read: no provider requests and no browse payload growth. */
export function placeVisitDetails(slug: string): PlaceVisitDetails | null {
  const entries: Record<string, unknown> = RAW;
  return validatePlaceVisitDetails(entries[slug]);
}

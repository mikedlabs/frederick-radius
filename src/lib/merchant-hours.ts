import type { Hours, Place } from "@/data/places";
import { HOURS_MAX_AGE_DAYS, isHoursFresh } from "@/lib/hours-freshness";
import { isCalendarDate, WEEKDAYS } from "@/lib/official-hours";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import { easternDayKey, easternWallToUtcISO } from "@/lib/tz";

/** Reviewed exact identities. Adding a source requires code and source review. */
export const MERCHANT_HOURS_SOURCES = [
  { slug: "brewers-alley-frederick", name: "Brewer's Alley", ledger_id: "brewers_alley_hours", category: "restaurant", url: "https://brewers-alley.com/", kind: "dated_week" },
  { slug: "gravel-and-grind-frederick", name: "Gravel & Grind", ledger_id: "gravel_grind_hours", category: "coffee", url: "https://www.gravelandgrind.com/", kind: "weekly" },
  { slug: "beans-in-the-belfry-brunswick", name: "Beans in the Belfry", ledger_id: "beans_belfry_hours", category: "coffee", url: "https://beansinthebelfry.com/", kind: "weekly" },
  { slug: "dublin-roasters-frederick", name: "Dublin Roasters Coffee", ledger_id: "dublin_roasters_hours", category: "coffee", url: "https://dublinroasterscoffee.com", kind: "weekly" },
] as const;
export type MerchantHoursSource = typeof MERCHANT_HOURS_SOURCES[number];
export type MerchantHoursRecord = {
  slug: string;
  source_url: string;
  source_name: string;
  source_sha256: string;
  observed_at: string;
  expires_at: string;
  coverage_from: string;
  coverage_through: string;
  kind: "weekly" | "dated_week";
  hours: Hours;
};
export type MerchantHoursArtifact = {
  schema_version: 1;
  places: MerchantHoursRecord[];
  review: {
    slug: string;
    checked_at: string;
    reason: "source_unavailable" | "unparseable_or_conflicted" | "changed_facts" | "pending_acceptance";
    /** Proposed source evidence, never read as an approved/public schedule. */
    candidate?: MerchantHoursRecord;
  }[];
};
const validStamp = (value: string) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const clock = (value: string) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function merchantHoursExpiry(observedAt: string, coverageThrough?: string): string {
  const limit = Date.parse(observedAt) + HOURS_MAX_AGE_DAYS * 86_400_000;
  if (!coverageThrough) return new Date(limit).toISOString();
  const nextDate = new Date(Date.parse(`${coverageThrough}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [year, month, day] = nextDate.split("-").map(Number);
  return new Date(Math.min(limit, Date.parse(easternWallToUtcISO(year, month, day, 0, 0)))).toISOString();
}
export function validateMerchantHoursArtifact(value: unknown): asserts value is MerchantHoursArtifact {
  const artifact = value as MerchantHoursArtifact;
  if (!artifact || artifact.schema_version !== 1 || !Array.isArray(artifact.places) || !Array.isArray(artifact.review) || artifact.places.length > MERCHANT_HOURS_SOURCES.length) throw new Error("Invalid merchant hours artifact.");
  const seen = new Set<string>();
  for (const row of artifact.places) {
    const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === row.slug);
    if (!source || seen.has(row.slug) || row.source_url !== source.url || row.source_name !== source.name || row.kind !== source.kind || !/^[a-f0-9]{64}$/.test(row.source_sha256) || !validStamp(row.observed_at) || !validStamp(row.expires_at) || !isCalendarDate(row.coverage_from) || !isCalendarDate(row.coverage_through) || row.coverage_from > row.coverage_through || !row.hours || Object.keys(row.hours).length !== 7) throw new Error("Mismatched merchant source, week or observation.");
    seen.add(row.slug);
    if (row.kind === "dated_week") {
      if (Date.parse(row.coverage_through) - Date.parse(row.coverage_from) !== 6 * 86_400_000 || row.expires_at !== merchantHoursExpiry(row.observed_at, row.coverage_through)) throw new Error("A dated merchant week cannot renew beyond its actual dates.");
    } else if (row.coverage_from !== easternDayKey(new Date(row.observed_at)) || row.expires_at !== merchantHoursExpiry(row.observed_at) || row.coverage_through !== easternDayKey(new Date(row.expires_at))) throw new Error("Weekly merchant evidence must retain its actual seven-day limit.");
    const observedDay = easternDayKey(new Date(row.observed_at));
    if (observedDay < row.coverage_from || observedDay > row.coverage_through) throw new Error("Merchant observation is outside the published week.");
    for (const day of WEEKDAYS) {
      const slots = row.hours[day];
      if (!Array.isArray(slots) || slots.length > 2 || slots.some((slot) => !clock(slot.open) || !clock(slot.close) || slot.open === slot.close)) throw new Error("Incomplete or invalid merchant schedule.");
    }
    if (!mayPublishVisitabilityHours(row.slug, row.hours, new Date(row.observed_at))) throw new Error("Merchant hours require separate visitability review.");
  }
  const reviewSeen = new Set<string>();
  for (const item of artifact.review) {
    if (!MERCHANT_HOURS_SOURCES.some((source) => source.slug === item.slug) || reviewSeen.has(item.slug) || !validStamp(item.checked_at) || !["source_unavailable", "unparseable_or_conflicted", "changed_facts", "pending_acceptance"].includes(item.reason)) throw new Error("Invalid merchant review queue.");
    if (item.candidate) {
      if (item.candidate.slug !== item.slug) throw new Error("Mismatched pending merchant identity.");
      validateMerchantHoursArtifact({ schema_version: 1, places: [item.candidate], review: [] });
    }
    reviewSeen.add(item.slug);
  }
}
function host(value?: string): string | undefined {
  try { const url = new URL(value ?? ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.hostname.replace(/^www\./, "") : undefined; } catch { return undefined; }
}
/** Enrolled merchants fail closed; no old provider fallback after a source conflict. */
export function merchantHoursForPlace(place: Pick<Place, "slug" | "website" | "category">, value: unknown, now = new Date()): { enrolled: boolean; hours?: Hours; observedAt?: string } {
  const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === place.slug);
  if (!source) return { enrolled: false };
  try { validateMerchantHoursArtifact(value); } catch { return { enrolled: true }; }
  const row = value.places.find((item) => item.slug === source.slug);
  const date = easternDayKey(now);
  if (!row || value.review.some((item) => item.slug === source.slug) || place.category !== source.category || host(place.website) !== host(source.url) || !isHoursFresh(row.observed_at, now) || now.getTime() >= Date.parse(row.expires_at) || date < row.coverage_from || date > row.coverage_through) return { enrolled: true };
  return { enrolled: true, observedAt: row.observed_at, hours: { ...row.hours, _official: { slug: row.slug, kind: "merchant", schedule_kind: row.kind, source_name: row.source_name, source_url: row.source_url, observed_at: row.observed_at, expires_at: row.expires_at, coverage_from: row.coverage_from, coverage_through: row.coverage_through, exceptions: [] } } };
}

/** Manual review operation only. The scheduled collector never calls this.
 * Approval names the exact recorded source proof and cannot redate expired evidence.
 */
export function acceptReviewedMerchantHoursCandidate(value: unknown, slug: string, proof: { source_sha256: string; observed_at: string }, now = new Date()): MerchantHoursArtifact {
  validateMerchantHoursArtifact(value);
  const candidate = value.review.find((item) => item.slug === slug)?.candidate;
  const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === slug);
  if (!candidate || !source || candidate.source_sha256 !== proof.source_sha256 || candidate.observed_at !== proof.observed_at) throw new Error("Approval must name the exact pending source proof.");
  if (!merchantHoursForPlace({ slug, category: source.category, website: source.url }, { schema_version: 1, places: [candidate], review: [] }, now).hours) throw new Error("Pending merchant evidence has expired or cannot publish.");
  const accepted = structuredClone(value);
  accepted.places = accepted.places.filter((item) => item.slug !== slug);
  accepted.places.push(structuredClone(candidate));
  accepted.places.sort((a, b) => MERCHANT_HOURS_SOURCES.findIndex((item) => item.slug === a.slug) - MERCHANT_HOURS_SOURCES.findIndex((item) => item.slug === b.slug));
  accepted.review = accepted.review.filter((item) => item.slug !== slug);
  validateMerchantHoursArtifact(accepted);
  return accepted;
}

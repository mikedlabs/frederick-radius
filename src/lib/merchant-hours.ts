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
  { slug: "pistarros", name: "Pistarro’s", ledger_id: "pistarros_hours", category: "restaurant", url: "https://pistarro.com/", kind: "weekly" },
  { slug: "jojos-restaurant-tap-house", name: "JoJo's Restaurant & Tap House", ledger_id: "jojos_hours", category: "restaurant", url: "https://jojosrestauranttaphouse.com/", kind: "weekly" },
  { slug: "thai-table-frederick", name: "Thai Table", ledger_id: "thai_table_hours", category: "restaurant", url: "https://thaitablecuisine.com/", kind: "weekly" },
  { slug: "thai-meric-eatery-bar-frederick", name: "Thai Meric Eatery & Bar", ledger_id: "thai_meric_hours", category: "restaurant", url: "https://www.thaimeric.com/", kind: "weekly" },
  { slug: "white-rabbit-gastropub", name: "White Rabbit Gastropub", ledger_id: "white_rabbit_hours", category: "restaurant", url: "https://www.whiterabbitgastropub.com/readme", kind: "weekly" },
  { slug: "il-porto-restaurant", name: "Il Porto Restaurant", ledger_id: "il_porto_frederick_hours", category: "restaurant", url: "https://www.ilportorestaurant.com/location-frederick/", kind: "weekly" },
  { slug: "sumittra-thai-cuisine", name: "Sumittra Thai Cuisine", ledger_id: "sumittra_hours", category: "restaurant", url: "https://www.sumittra.com/", kind: "weekly", collection: "manual" },
  { slug: "the-curious-iguana-frederick", name: "Curious Iguana", ledger_id: "curious_iguana_hours", category: "book-store", url: "https://curiousiguana.com/", kind: "weekly", collection: "manual" },
  { slug: "kulfi-ice-creams-frederick", name: "Kulfi Ice Creams", ledger_id: "kulfi_hours", category: "ice-cream", url: "https://kulfi-icecream.com/", kind: "weekly" },
  { slug: "delaplaine-arts-center-frederick", name: "Delaplaine Arts Center", ledger_id: "delaplaine_hours", category: "gallery", url: "https://delaplaine.org/", kind: "weekly" },
  // This exact reviewed Wix page exceeds the ordinary 512000-byte transport cap.
  { slug: "alekos-middletown", name: "Aleko's Village Cafe", ledger_id: "alekos_hours", category: "restaurant", url: "https://www.alekosvillagecafe.com/", kind: "weekly", max_response_bytes: 1_048_576 },
  // One reviewed official page, with independent exact grocery identities.
  { slug: "common-market-frederick", name: "Common Market Co-op (Route 85)", ledger_id: "common_market_hours", category: "market", url: "https://www.commonmarket.coop/", kind: "weekly" },
  { slug: "common-market", name: "Common Market (7th Street)", ledger_id: "common_market_hours", category: "market", url: "https://www.commonmarket.coop/", kind: "weekly" },
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
/** Ordinary Iguana Saturdays cannot describe its longer first Saturday.
 * Keep that date outside the evidence rather than invent an extension in the
 * closure-only exception model. Native sources retain their exact seven days.
 */
export function merchantWeeklyHoursWindow(slug: string, observedAt: string): { expires_at: string; coverage_through: string } {
  const expires = merchantHoursExpiry(observedAt);
  const ordinary = { expires_at: expires, coverage_through: easternDayKey(new Date(expires)) };
  if (slug !== "the-curious-iguana-frederick") return ordinary;
  const from = easternDayKey(new Date(observedAt));
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(Date.parse(`${from}T12:00:00Z`) + offset * 86_400_000);
    if (day.getUTCDay() !== 6 || day.getUTCDate() > 7) continue;
    if (offset === 0) throw new Error("First-Saturday hours require separate dated review.");
    const date = day.toISOString().slice(0, 10);
    const [year, month, dateOfMonth] = date.split("-").map(Number);
    const boundary = easternWallToUtcISO(year, month, dateOfMonth, 0, 0);
    if (Date.parse(boundary) <= Date.parse(expires)) return {
      expires_at: new Date(boundary).toISOString(),
      coverage_through: new Date(day.getTime() - 86_400_000).toISOString().slice(0, 10),
    };
    break;
  }
  return ordinary;
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
    } else {
      const window = merchantWeeklyHoursWindow(source.slug, row.observed_at);
      if (row.coverage_from !== easternDayKey(new Date(row.observed_at)) || row.expires_at !== window.expires_at || row.coverage_through !== window.coverage_through) throw new Error("Weekly merchant evidence must retain its actual source-specific limit.");
    }
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

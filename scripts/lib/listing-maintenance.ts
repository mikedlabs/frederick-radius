import type { Hours } from "@/data/places";
import type { PlaceCardPhotoPlan } from "@/lib/place-card-photo";
import { placeCardPhotoPlan } from "@/lib/place-card-photo";
import { isHoursFresh, HOURS_MAX_AGE_DAYS } from "@/lib/hours-freshness";
import { isScheduleEvidenceCurrent } from "@/lib/hours";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import { officialHoursForPlace, validateOfficialHoursArtifact } from "@/lib/official-hours";
import { merchantHoursForPlace, validateMerchantHoursArtifact } from "@/lib/merchant-hours";
import { publishablePlaceWebsite } from "@/lib/place-website-policy";
import { businessInfoSourceKind } from "./business-info-source-policy";

export const HOURS_STATES = ["current", "stale", "needs_review", "unknown"] as const;
export const PHOTO_STATES = ["owned", "licensed_local", "licensed_remote", "provider_eligible", "missing"] as const;
export type HoursState = typeof HOURS_STATES[number];
export type PhotoState = typeof PHOTO_STATES[number];
export type MaintenancePlace = Parameters<typeof placeCardPhotoPlan>[0] & {
  name: string;
  category: string;
  municipality?: string;
  website?: string;
  phone?: string;
  hours?: Hours;
  hours_verified?: boolean;
  hours_updated_at?: string;
  hours_source?: string;
  source?: string;
};
export type HoursInventory = {
  hasSchedule: boolean;
  observedAt?: string;
  /** A rejected provider identity is review debt, never historical verification. */
  identityAccepted?: boolean;
};
export type HoursMaintenance = {
  state: HoursState;
  reason: string;
  applicability: "applicable" | "not_applicable" | "unknown";
  observed_at: string | null;
  expires_at: string | null;
  source_url: string | null;
  source_kind: string | null;
  expiring_within_48h: boolean;
};
export type PhotoMaintenance = {
  eligibility: PhotoState;
  source_kinds: PhotoState[];
  selected_src: string | null;
  source_url: string | null;
  license: string | null;
  availability: "not_checked";
  issue: "local_asset_missing" | null;
};
export type MaintenanceRow = {
  slug: string;
  name: string;
  municipality: string;
  category: string;
  catalog_source: string | null;
  hours: HoursMaintenance;
  photo: PhotoMaintenance;
  contact: { website: string | null; phone: string | null; missing: ("website" | "phone")[]; verification: "not_checked" };
  source_candidate: { url: string; kind: "business_website" | "official_source"; status: "candidate_only"; approval: "requires_identity_and_fact_review" } | null;
  next_actions: string[];
};
export type MaintenanceCounts = {
  listings: number;
  hours: Record<HoursState, number>;
  photos: Record<PhotoState, number>;
  expiring_hours_48h: number;
  hours_not_applicable_reviewed: number;
  missing_website: number;
  missing_phone: number;
  missing_all_contact: number;
  local_photo_missing_bytes: number;
};
export type MaintenanceReport = {
  schema_version: 1;
  as_of: string;
  git_sha: string;
  data_version: string;
  scope: { inventory: "promoted_public_client"; decoded_photos: "not_checked"; served_deployment: "not_checked"; provider_requests: 0 };
  summary: MaintenanceCounts;
  by_town: Record<string, MaintenanceCounts>;
  by_category: Record<string, MaintenanceCounts>;
  rows: MaintenanceRow[];
  candidate_queue: { slug: string; url: string; kind: "business_website" | "official_source"; hours_state: HoursState; priority: number; status: "candidate_only" }[];
};
export type MaintenanceInput = {
  places: readonly MaintenancePlace[];
  asOf: Date;
  gitSha: string;
  dataVersion: string;
  officialHours?: unknown;
  merchantHours?: unknown;
  hoursInventory?: Readonly<Record<string, HoursInventory>>;
  /** Explicit reviewed exceptions only; never inferred from a place category. */
  hoursNotApplicable?: Readonly<Record<string, { reason: string }>>;
  photoPlanFor?: (place: MaintenancePlace) => PlaceCardPhotoPlan;
  localAssetExists?: (src: string) => boolean;
  candidateLimit?: number;
};
const DAY_MS = 86_400_000;
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const hasSchedule = (hours?: Hours) => Boolean(hours && WEEKDAYS.some((day) => Array.isArray(hours[day])));
const stamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

function hoursMaintenance(place: MaintenancePlace, input: MaintenanceInput): HoursMaintenance {
  const now = input.asOf;
  let observed = place.hours_updated_at;
  let expiry = place.hours?._official?.expires_at;
  let sourceUrl = place.hours?._official?.source_url;
  let sourceKind = place.hours_source;
  const result = (state: HoursState, reason: string, applicability: HoursMaintenance["applicability"] = "applicable"): HoursMaintenance => {
    const expiresAt = stamp(expiry) ?? (stamp(observed) ? new Date(Date.parse(observed!) + HOURS_MAX_AGE_DAYS * DAY_MS).toISOString() : null);
    return { state, reason, applicability, observed_at: stamp(observed), expires_at: expiresAt,
      source_url: sourceUrl ?? null, source_kind: sourceKind ?? null,
      expiring_within_48h: state === "current" && expiresAt !== null && Date.parse(expiresAt) > now.getTime() && Date.parse(expiresAt) - now.getTime() <= 2 * DAY_MS };
  };
  const library = officialHoursForPlace(place, input.officialHours, now);
  const merchant = library.enrolled ? null : merchantHoursForPlace(place, input.merchantHours, now);
  const enrolled = library.enrolled || merchant?.enrolled;
  if (enrolled) {
    sourceKind = "first_party";
    try {
      if (library.enrolled) {
        validateOfficialHoursArtifact(input.officialHours);
        observed = [input.officialHours.weekly.observed_at, input.officialHours.closures.observed_at].sort()[0];
        expiry = input.officialHours.expires_at;
        sourceUrl = input.officialHours.places.find((row) => row.slug === place.slug)?.source_url;
      } else {
        validateMerchantHoursArtifact(input.merchantHours);
        const record = input.merchantHours.places.find((row) => row.slug === place.slug);
        observed = record?.observed_at; expiry = record?.expires_at; sourceUrl = record?.source_url;
        const review = input.merchantHours.review.find((row) => row.slug === place.slug);
        if (review) return result("needs_review", `merchant_${review.reason}`);
      }
    } catch { return result("needs_review", "invalid_or_missing_first_party_artifact"); }
    if (!stamp(observed) || Date.parse(observed!) > now.getTime() + 300_000) return result("needs_review", "invalid_or_future_observation");
    if (!isHoursFresh(observed, now) || (expiry && now.getTime() >= Date.parse(expiry))) return result("stale", "first_party_evidence_expired");
    const approved = library.enrolled ? library.hours : merchant?.hours;
    if (!approved) return result("needs_review", "first_party_identity_or_coverage_hold");
    if (!isScheduleEvidenceCurrent(approved, now)) return result("stale", "outside_first_party_date_coverage");
    // An accepted source candidate is not a shipped discovery schedule.
    if (!place.hours_verified || !hasSchedule(place.hours)) return result("needs_review", "source_current_not_in_promoted_snapshot");
    if (place.hours?._official?.observed_at !== approved._official?.observed_at ||
      place.hours?._official?.source_url !== approved._official?.source_url ||
      WEEKDAYS.some((day) => JSON.stringify(place.hours?.[day] ?? []) !== JSON.stringify(approved[day] ?? []))) return result("needs_review", "first_party_snapshot_evidence_mismatch");
  }
  const inventory = input.hoursInventory?.[place.slug];
  if (!enrolled && inventory?.hasSchedule && inventory.identityAccepted === false) return result("needs_review", "historical_identity_rejected");
  if (hasSchedule(place.hours)) {
    if (!stamp(observed) || Date.parse(observed!) > now.getTime() + 300_000) return result("needs_review", "invalid_or_future_observation");
    if (!isHoursFresh(observed, now)) return result("stale", "schedule_observation_expired");
    if (place.hours?._official && place.hours._official.slug !== place.slug) return result("needs_review", "schedule_identity_mismatch");
    if (!isScheduleEvidenceCurrent(place.hours!, now)) return result("stale", "outside_schedule_date_coverage");
    if (!mayPublishVisitabilityHours(place.slug, place.hours, now)) return result("needs_review", "visitability_requires_review");
    if (place.hours_verified !== true) return result("unknown", "stored_schedule_not_verified");
    return result("current", "current_publishable_schedule");
  }
  if (place.hours_verified) return result("needs_review", "verified_flag_without_schedule");
  if (inventory?.hasSchedule) {
    observed = inventory.observedAt ?? observed;
    if (observed && (!stamp(observed) || Date.parse(observed) > now.getTime() + 300_000)) return result("needs_review", "invalid_or_future_historical_observation");
    return stamp(observed) && !isHoursFresh(observed, now)
      ? result("stale", "historical_schedule_withheld")
      : result("unknown", "stored_schedule_without_current_publication", "unknown");
  }
  const exception = input.hoursNotApplicable?.[place.slug];
  if (exception?.reason.trim()) return result("unknown", "not_applicable_by_explicit_review", "not_applicable");
  return result("unknown", "no_usable_schedule_evidence", "unknown");
}

function photoMaintenance(place: MaintenancePlace, input: MaintenanceInput): PhotoMaintenance {
  const plan = input.photoPlanFor?.(place) ?? placeCardPhotoPlan(place, 360);
  const kind = (source: PlaceCardPhotoPlan["sources"][number]): PhotoState => source.kind === "curated"
    ? source.src.startsWith("/") ? "licensed_local" : "licensed_remote"
    : source.kind === "google" ? "provider_eligible" : "owned";
  const selected = plan.sources[0];
  const isLocal = selected?.src.startsWith("/") && !selected.src.startsWith("/api/");
  const missing = Boolean(selected && isLocal && input.localAssetExists && !input.localAssetExists(selected.src));
  return { eligibility: selected ? kind(selected) : "missing", source_kinds: [...new Set(plan.sources.map(kind))],
    selected_src: selected?.src ?? null,
    source_url: selected?.kind === "curated" ? selected.photo.source_url : selected?.kind === "google" ? selected.attribution.google_maps_uri ?? null : null,
    license: selected?.kind === "curated" ? selected.photo.license : selected?.kind === "google" ? "Google Places API terms; exact attribution required" : selected ? "Owner-permitted photograph" : null,
    availability: "not_checked", issue: missing ? "local_asset_missing" : null };
}
function sourceCandidate(website: string | undefined, name: string): MaintenanceRow["source_candidate"] {
  if (!website) return null;
  const url = new URL(website);
  // This is a review queue, not permission to fetch an arbitrary endpoint.
  if (url.protocol !== "https:" || !url.hostname.includes(".") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || /(?:\.local|\.localhost)$/.test(url.hostname)) return null;
  const kind = businessInfoSourceKind(website, name);
  return kind ? { url: website, kind, status: "candidate_only", approval: "requires_identity_and_fact_review" } : null;
}
function blankCounts(): MaintenanceCounts {
  return { listings: 0, hours: { current: 0, stale: 0, needs_review: 0, unknown: 0 },
    photos: { owned: 0, licensed_local: 0, licensed_remote: 0, provider_eligible: 0, missing: 0 },
    expiring_hours_48h: 0, hours_not_applicable_reviewed: 0,
    missing_website: 0, missing_phone: 0, missing_all_contact: 0, local_photo_missing_bytes: 0 };
}
function add(counts: MaintenanceCounts, row: MaintenanceRow) {
  counts.listings++; counts.hours[row.hours.state]++; counts.photos[row.photo.eligibility]++;
  if (row.hours.expiring_within_48h) counts.expiring_hours_48h++;
  if (row.hours.applicability === "not_applicable") counts.hours_not_applicable_reviewed++;
  if (!row.contact.website) counts.missing_website++;
  if (!row.contact.phone) counts.missing_phone++;
  if (!row.contact.website && !row.contact.phone) counts.missing_all_contact++;
  if (row.photo.issue) counts.local_photo_missing_bytes++;
}
function priority(row: MaintenanceRow): number {
  return row.hours.state === "needs_review" ? 100 : row.hours.state === "stale" ? 80 : 60;
}

/** Offline only: existence/eligibility is never source verification or successful image decoding. */
export function buildListingMaintenanceReport(input: MaintenanceInput): MaintenanceReport {
  if (!Number.isFinite(input.asOf.getTime())) throw new Error("Invalid report clock.");
  if (!/^[a-f0-9]{40}$/.test(input.gitSha)) throw new Error("Expected an exact 40-character git SHA.");
  if (!/^sha256:[a-f0-9]{64}$/.test(input.dataVersion)) throw new Error("Expected the promoted data version.");
  const limit = input.candidateLimit ?? 20;
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error("Candidate limit must be 0–100.");
  const seen = new Set<string>();
  for (const place of input.places) {
    if (!place.slug || seen.has(place.slug)) throw new Error(`Missing or duplicate listing slug: ${place.slug}`);
    seen.add(place.slug);
  }
  const rows = [...input.places].sort((a, b) => a.slug.localeCompare(b.slug)).map((place): MaintenanceRow => {
    const hours = hoursMaintenance(place, input);
    const photo = photoMaintenance(place, input);
    const website = publishablePlaceWebsite(place.website, place.name);
    const phone = place.phone?.trim() || null;
    const candidate = sourceCandidate(website, place.name);
    const next = hours.state === "needs_review" ? ["review_hours_evidence"] : hours.state === "stale" ? ["reverify_hours"] : hours.state === "unknown" && hours.applicability !== "not_applicable" ? [candidate ? "inspect_official_hours_candidate" : "find_official_hours_source"] : [];
    if (photo.eligibility === "missing") next.push("obtain_exact_permitted_photo");
    if (photo.issue) next.push("repair_missing_local_photo_bytes");
    if (!website) next.push("verify_official_website");
    if (!phone) next.push("verify_public_phone");
    return { slug: place.slug, name: place.name, municipality: place.municipality || "unknown", category: place.category || "unknown", catalog_source: place.source ?? null, hours, photo,
      contact: { website: website ?? null, phone, missing: [...(!website ? ["website" as const] : []), ...(!phone ? ["phone" as const] : [])], verification: "not_checked" },
      source_candidate: candidate, next_actions: next };
  });
  const summary = blankCounts();
  const towns = new Map<string, MaintenanceCounts>(); const categories = new Map<string, MaintenanceCounts>();
  for (const row of rows) {
    add(summary, row);
    for (const [map, key] of [[towns, row.municipality], [categories, row.category]] as const) {
      if (!map.has(key)) map.set(key, blankCounts()); add(map.get(key)!, row);
    }
  }
  return { schema_version: 1, as_of: input.asOf.toISOString(), git_sha: input.gitSha, data_version: input.dataVersion,
    scope: { inventory: "promoted_public_client", decoded_photos: "not_checked", served_deployment: "not_checked", provider_requests: 0 }, summary,
    by_town: Object.fromEntries([...towns].sort(([a], [b]) => a.localeCompare(b))),
    by_category: Object.fromEntries([...categories].sort(([a], [b]) => a.localeCompare(b))), rows,
    candidate_queue: rows.filter((row) => row.source_candidate && row.hours.state !== "current" && row.hours.applicability !== "not_applicable")
      .sort((a, b) => priority(b) - priority(a) || a.slug.localeCompare(b.slug)).slice(0, limit)
      .map((row) => ({ slug: row.slug, url: row.source_candidate!.url, kind: row.source_candidate!.kind, hours_state: row.hours.state, priority: priority(row), status: "candidate_only" })) };
}

export function renderListingMaintenanceMarkdown(report: MaintenanceReport): string {
  const s = report.summary;
  const line = (name: string, value: MaintenanceCounts) => `| ${name.replaceAll("|", "\\|")} | ${value.listings} | ${value.hours.current} | ${value.hours.stale} | ${value.hours.needs_review} | ${value.hours.unknown} | ${value.photos.owned + value.photos.licensed_local} | ${value.photos.provider_eligible} | ${value.photos.missing} |`;
  return ["# Listing maintenance", "", `As of ${report.as_of}. Git ${report.git_sha}. Data ${report.data_version}.`, "",
    `All ${s.listings} promoted public listings accounted for once. Hours: ${s.hours.current} current, ${s.hours.stale} stale, ${s.hours.needs_review} need review, ${s.hours.unknown} unknown.`,
    `${s.expiring_hours_48h} current schedules expire within 48 hours. ${s.missing_all_contact} listings have neither a published website nor phone.`,
    "Photo categories are eligible plans, not decoded or recently reverified images. Contact links are stored destinations, not verified live. This report does not prove a deployment is serving these artifacts.", "",
    "| Town | Listings | Current hours | Stale | Review | Unknown | Owned/local licensed | Provider eligible | Missing photo |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(report.by_town).map(([name, value]) => line(name, value)), "", "## Bounded source candidates", "",
    "Candidates pass existing host/source policy only. No page was fetched; identity and facts still require review.", "",
    ...report.candidate_queue.map((row) => `- ${row.slug}: ${row.hours_state}; ${row.url}`), ""].join("\n");
}

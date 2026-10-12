import type { DayOfWeek, Hours, HoursDateException, Place } from "@/data/places";
import { isHoursFresh, HOURS_MAX_AGE_DAYS } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";

export const FCPL_HOURS_URL = "https://www.fcpl.org/branches-hours";
export const FCPL_CLOSURES_URL = "https://www.fcpl.org/holiday-closings";
export const FCPL_BRANCHES = [
  ["brunswick-branch-library-brunswick", "brunswick-branch-library"],
  ["c-burr-artz-public-library-frederick", "c-burr-artz-public-library"],
  ["edward-f-fry-memorial-library-at-point-of-rocks-brunswick", "edward-f-fry-memorial-library-point-rocks"],
  ["emmitsburg-branch-library-emmitsburg", "emmitsburg-branch-library"],
  ["middletown-public-library-middletown", "middletown-branch-library"],
  ["myersville-community-library-myersville", "myersville-community-library"],
  ["thurmont-regional-library-thurmont", "thurmont-regional-library"],
  ["urbana-regional-library-new-market", "urbana-regional-library"],
  ["walkersville-public-library-walkersville", "walkersville-branch-library"],
] as const;
export const WEEKDAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export type OfficialHoursArtifact = {
  schema_version: 1;
  source_id: "fcpl_branch_hours";
  weekly: { url: typeof FCPL_HOURS_URL; observed_at: string; sha256: string };
  closures: { url: typeof FCPL_CLOSURES_URL; observed_at: string; sha256: string; coverage_from: string; coverage_through: string; exceptions: HoursDateException[] };
  expires_at: string;
  places: { slug: string; source_url: string; source_name: string; hours: Hours }[];
};
export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && isCalendarDate(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}
function clock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
/** Structural validation does not refresh a timestamp or grant new source ownership. */
export function validateOfficialHoursArtifact(value: unknown): asserts value is OfficialHoursArtifact {
  const a = value as OfficialHoursArtifact;
  if (!a || a.schema_version !== 1 || a.source_id !== "fcpl_branch_hours" || a.weekly?.url !== FCPL_HOURS_URL || a.closures?.url !== FCPL_CLOSURES_URL || !Array.isArray(a.places) || a.places.length !== FCPL_BRANCHES.length) throw new Error("Incomplete official hours source/identity set.");
  if (![a.weekly.observed_at, a.closures.observed_at, a.expires_at].every(isTimestamp) || ![a.weekly.sha256, a.closures.sha256].every((s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s))) throw new Error("Invalid official hours observations.");
  const earliest = Math.min(Date.parse(a.weekly.observed_at), Date.parse(a.closures.observed_at));
  if (Date.parse(a.expires_at) !== earliest + HOURS_MAX_AGE_DAYS * 86_400_000) throw new Error("Official hours expiry must retain the seven-day evidence limit.");
  if (!isCalendarDate(a.closures.coverage_from) || !isCalendarDate(a.closures.coverage_through) || a.closures.coverage_from > a.closures.coverage_through || !Array.isArray(a.closures.exceptions) || !a.closures.exceptions.length || a.closures.exceptions.length > 80) throw new Error("Missing or invalid closure coverage.");
  const dates = new Set<string>();
  for (const e of a.closures.exceptions) {
    if (!isCalendarDate(e.date) || dates.has(e.date) || !e.reason?.trim() || e.reason.length > 160 || (e.closed === true) === Boolean(e.closes_at) || (e.closes_at !== undefined && !clock(e.closes_at))) throw new Error("Invalid or ambiguous dated closure.");
    dates.add(e.date);
  }
  const slugs = new Set<string>();
  for (const row of a.places) {
    const binding = FCPL_BRANCHES.find(([slug]) => slug === row.slug);
    if (!binding || slugs.has(row.slug) || row.source_url !== `https://www.fcpl.org/branches-hours/${binding[1]}` || !row.source_name?.trim() || !row.hours || Object.keys(row.hours).length !== 7) throw new Error("Mismatched official branch identity or incomplete week.");
    slugs.add(row.slug);
    for (const day of WEEKDAYS) {
      const windows = row.hours[day];
      if (!Array.isArray(windows) || windows.length > 2 || windows.some((w) => !clock(w.open) || !clock(w.close) || w.close <= w.open)) throw new Error("Invalid official branch hours.");
    }
    if (!mayPublishVisitabilityHours(row.slug, row.hours, new Date(earliest))) throw new Error("Official hours require a separate visitability review.");
  }
}

/** An enrolled branch fails closed instead of falling back to provider weekday hours. */
export function officialHoursForPlace(
  place: Pick<Place, "slug" | "website" | "category">,
  artifact: unknown,
  now: Date = new Date(),
): { enrolled: boolean; hours?: Hours; observedAt?: string } {
  const enrolled = FCPL_BRANCHES.some(([slug]) => slug === place.slug);
  if (!enrolled) return { enrolled: false };
  try { validateOfficialHoursArtifact(artifact); } catch { return { enrolled: true }; }
  const row = artifact.places.find((p) => p.slug === place.slug);
  const observedAt = [artifact.weekly.observed_at, artifact.closures.observed_at].sort()[0];
  const website = place.website?.replace(/^http:/, "https:").replace(/\/$/, "");
  if (!row || place.category !== "library" || website !== row.source_url || !isHoursFresh(artifact.weekly.observed_at, now) || !isHoursFresh(artifact.closures.observed_at, now) || now.getTime() > Date.parse(artifact.expires_at)) return { enrolled: true };
  return { enrolled: true, observedAt, hours: { ...row.hours, _official: {
    slug: row.slug, source_url: row.source_url, closures_url: artifact.closures.url,
    observed_at: observedAt, expires_at: artifact.expires_at,
    coverage_from: artifact.closures.coverage_from, coverage_through: artifact.closures.coverage_through,
    exceptions: artifact.closures.exceptions,
  } } };
}

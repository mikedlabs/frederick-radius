export type GooglePlaceEnrichmentMode = "basic" | "experience";

const DEFAULT_BASIC_DAILY_CAP = 10;
const MAX_BASIC_DAILY_CAP = 80;
const DEFAULT_EXPERIENCE_DAILY_CAP = 5;
const MAX_EXPERIENCE_DAILY_CAP = 20;

function boundedDailyCap(
  raw: string | undefined,
  safeDefault: number,
  maximum: number,
): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return safeDefault;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return safeDefault;
  return Math.min(maximum, Math.max(1, parsed));
}

/** Shared resolver used by both the paid runtime route and /admin/costs. */
export function googlePlaceEnrichmentDailyCap(
  mode: GooglePlaceEnrichmentMode,
  raw = mode === "experience"
    ? process.env.GOOGLE_PLACE_EXPERIENCE_DAILY_CAP
    : process.env.GOOGLE_PLACE_ENRICH_DAILY_CAP,
): number {
  return mode === "experience"
    ? boundedDailyCap(
        raw,
        DEFAULT_EXPERIENCE_DAILY_CAP,
        MAX_EXPERIENCE_DAILY_CAP,
      )
    : boundedDailyCap(raw, DEFAULT_BASIC_DAILY_CAP, MAX_BASIC_DAILY_CAP);
}

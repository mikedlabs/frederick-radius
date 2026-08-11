import type { SourceConfidence } from "@/lib/provenance";

type EventDecisionVerificationInput = {
  starts_at: string;
  source_url?: string | null;
  confidence: SourceConfidence;
  last_verified_at?: string | null;
};

export type EventDecisionVerification = {
  sourceUrl?: string;
  verifiedAt?: string;
  verificationExpiresAt?: string;
  sourceVerified: boolean;
};

const TRUSTED_EVENT_CONFIDENCE = new Set<SourceConfidence>([
  "curated",
  "partner",
  "verified",
]);
const HOUR_MS = 60 * 60 * 1_000;
const MAP_EVENT_NEAR_TERM_MS = 48 * HOUR_MS;
const MAP_EVENT_NEAR_TERM_FRESHNESS_MS = 24 * HOUR_MS;
const MAP_EVENT_LATER_FRESHNESS_MS = 7 * 24 * HOUR_MS;
const MAP_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1_000;

function publicSourceUrl(value: string | null | undefined): string | undefined {
  const url = value?.trim();
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function validIso(value: string | null | undefined): string | undefined {
  if (!value || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

/**
 * The freshness contract for any event used to make a decision. A near-term
 * recommendation needs a publisher check from the last day; a later event may
 * use a check from the last week. Pins can still exist outside this contract,
 * but Today and Map Highlights may not promote them as a next move.
 */
export function eventDecisionVerification(
  event: EventDecisionVerificationInput,
  now: Date = new Date(),
): EventDecisionVerification {
  const sourceUrl = publicSourceUrl(event.source_url);
  const verifiedAt = validIso(event.last_verified_at);
  const verifiedAtMs = verifiedAt ? Date.parse(verifiedAt) : Number.NaN;
  const startsAtMs = Date.parse(event.starts_at);
  const nowMs = now.getTime();
  const nearTerm =
    !Number.isFinite(startsAtMs) || startsAtMs - nowMs <= MAP_EVENT_NEAR_TERM_MS;
  const maxAge = nearTerm
    ? MAP_EVENT_NEAR_TERM_FRESHNESS_MS
    : MAP_EVENT_LATER_FRESHNESS_MS;
  const verificationAge = nowMs - verifiedAtMs;
  const acceptedVerifiedAt =
    Number.isFinite(verificationAge) &&
    verificationAge >= -MAP_EVENT_CLOCK_SKEW_MS
      ? verifiedAt
      : undefined;
  const verificationExpiresAt = acceptedVerifiedAt
    ? new Date(verifiedAtMs + maxAge).toISOString()
    : undefined;
  const sourceVerified = Boolean(
    sourceUrl &&
      acceptedVerifiedAt &&
      TRUSTED_EVENT_CONFIDENCE.has(event.confidence) &&
      verificationAge <= maxAge,
  );

  return {
    sourceUrl,
    verifiedAt: acceptedVerifiedAt,
    verificationExpiresAt,
    sourceVerified,
  };
}

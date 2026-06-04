/**
 * Official government social accounts — the "what are they saying right
 * now" sources for Frederick County & the City of Frederick.
 *
 * HONEST ACCESS NOTE: unlike the open GIS/GTFS endpoints, post *content*
 * here is not freely pullable — the X API is paywalled and Meta (IG/FB)
 * requires Graph API access + app review. So these are catalogued for:
 *   1. Verified official-account links (avoid impersonator accounts) —
 *      surface on /pulse, town pages, and "New here?" onboarding.
 *   2. Embeddable timelines (FB Page plugin, X timeline widget) where we
 *      choose to embed rather than ingest.
 *   3. Future ingestion targets IF we obtain API access — each row is
 *      ready to wire a feed to.
 *
 * Confirmed handles 2026-06 (provided by owner). `verified` = we trust
 * this is the official account.
 */

export type SocialPlatform = "x" | "instagram" | "facebook" | "youtube" | "nextdoor";

export type SocialAccount = {
  jurisdiction: "county" | "city";
  org: string;
  platform: SocialPlatform;
  handle: string;
  url: string;
  verified: boolean;
  /** How we'd actually use it today (link/embed) vs ingest. */
  access: "link" | "embed" | "api-required";
};

export const SOCIAL_ACCOUNTS: SocialAccount[] = [
  // ── Frederick County Government ──
  { jurisdiction: "county", org: "Frederick County Government", platform: "x", handle: "@FredCoGovMD", url: "https://x.com/FredCoGovMD", verified: true, access: "api-required" },
  { jurisdiction: "county", org: "Frederick County Government", platform: "instagram", handle: "@fredcogovmd", url: "https://www.instagram.com/fredcogovmd", verified: true, access: "api-required" },
  { jurisdiction: "county", org: "Frederick County Government", platform: "facebook", handle: "FredCoGovMD", url: "https://www.facebook.com/FredCoGovMD", verified: true, access: "embed" },

  // ── City of Frederick ──
  { jurisdiction: "city", org: "City of Frederick", platform: "x", handle: "@FredCityGovt", url: "https://x.com/FredCityGovt", verified: true, access: "api-required" },
  { jurisdiction: "city", org: "City of Frederick", platform: "facebook", handle: "CityofFrederick", url: "https://www.facebook.com/CityofFrederick", verified: true, access: "embed" },
];

export const socialFor = (jurisdiction: "county" | "city") =>
  SOCIAL_ACCOUNTS.filter((a) => a.jurisdiction === jurisdiction);

export const SOCIAL_BY_PLATFORM = (platform: SocialPlatform) =>
  SOCIAL_ACCOUNTS.filter((a) => a.platform === platform);

const FAIR_DAY_HREF = "/moments/great-frederick-fair-2026";
const CAMPAIGN_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/** Preserve only the bounded attribution fields Radius uses for campaign
 * learning. Keeping arbitrary query parameters out makes /fair safe to print,
 * speak, and reuse without turning it into an open redirect surface. */
export function fairCampaignHref(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const campaign = new URLSearchParams();
  for (const key of CAMPAIGN_KEYS) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const clean = value?.trim().slice(0, 80);
    if (clean) campaign.set(key, clean);
  }
  const query = campaign.toString();
  return query ? `${FAIR_DAY_HREF}?${query}` : FAIR_DAY_HREF;
}

import type { AskResult } from "@/lib/ask/contracts";
import {
  FIRSTENERGY_OUTAGE_MAP_URL,
  type FrederickOutagesResult,
} from "@/lib/integrations/firstenergy";

/**
 * Power-loss questions need the utility feed, not catalog search. Keep this
 * boundary narrow so "public power outlet" and EV-charging questions continue
 * through the amenity grounder.
 */
export function wantsPowerOutage(query: string): boolean {
  const q = query.toLowerCase();
  if (/\b(?:power|electric(?:ity)?)\s+outages?\b/.test(q)) return true;
  if (/\b(?:outages?|blackouts?)\b/.test(q) && /\b(?:power|electric(?:ity)?|utility)\b/.test(q)) {
    return true;
  }
  if (/\b(?:power|electricity)\b/.test(q) && /\b(?:out|off|down|lost|without|restore|restored|restoration|back on)\b/.test(q)) {
    return true;
  }
  return /\b(?:lost|no|without)\s+(?:my\s+|our\s+|the\s+)?(?:power|electricity)\b/.test(q);
}

function updatedLabel(asOf: string | undefined): string | undefined {
  if (!asOf) return undefined;
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) return undefined;
  return `Updated ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

export function powerOutageAskResult(
  result: FrederickOutagesResult,
  contextLabel?: string | null,
): AskResult {
  const count = result.data.total_out;
  const countLabel = `${count.toLocaleString()} ${count === 1 ? "customer" : "customers"} without power`;
  const updated = updatedLabel(result.asOf);

  const answer = !result.available
    ? "I couldn’t load Potomac Edison’s live outage report. Check the official outage map. Radius cannot confirm service at a specific address."
    : count > 0
      ? `Potomac Edison reports ${countLabel} in Frederick County. Radius cannot tell whether a specific address is included, so check the official outage map for your location.`
      : "Potomac Edison currently reports no customers without power in Frederick County. That county total does not confirm service at a specific address, so check the official outage map if your power is out.";

  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer,
    context: contextLabel ?? "Frederick County",
    sources: [{
      slug: "potomac-edison-outage-report",
      name: "Potomac Edison outage report",
      category: "civic",
      city: "Frederick County",
      href: FIRSTENERGY_OUTAGE_MAP_URL,
      eyebrow: "Live utility report",
      reason: result.available ? countLabel : "Live feed unavailable",
      status: updated ?? (result.available ? "Current county report" : "Check the official map"),
      confidence: result.available ? "high" : "medium",
    }],
    actions: [
      {
        label: "Open the official outage map",
        kind: "open",
        href: FIRSTENERGY_OUTAGE_MAP_URL,
      },
      {
        label: "See county power details",
        kind: "open",
        href: "/pulse?open=power",
      },
    ],
    intelligence: {
      tools: ["power"],
      confidence: result.available ? "high" : "medium",
      retrieval: "keyword",
    },
  };
}

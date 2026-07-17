const NWS = "https://api.weather.gov";
const UA = "Frederick Radius (hello@frederickradius.app)";

// SAME (FIPS) codes for the alerts we WANT to surface. Filtering by
// `areaDesc` substring matching `/Frederick/i` was the prior bug: a
// Severe Thunderstorm Watch box that covers Montgomery + Howard (MD)
// and extends west into Frederick County, VIRGINIA — a real county
// that exists, ~50 miles south-west of us — would list "Frederick"
// in its area description. The MD `area=MD` query returned the watch
// because Montgomery is in it; the regex matched the VA "Frederick"
// substring; the page rendered an alert for Frederick County MD that
// wasn't actually for Frederick County MD. SAME codes are unambiguous.
//
// SAME format: state FIPS (2 digits) + county FIPS (3 digits), with a
// leading 0. Maryland is 24. Frederick County, MD is county 021.
const FREDERICK_MD_SAME = "024021";
// Statewide Maryland alerts (e.g. heat advisory for the entire state)
// can carry the state-level marker rather than enumerating every
// county. Match either of these so a real statewide alert still
// surfaces. Virginia's "024" prefix is impossible — VA is 51 — so
// these markers can only ever come from MD.
const MD_STATEWIDE_SAME = ["024", "024000"];

export type NwsAlert = {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: "Minor" | "Moderate" | "Severe" | "Extreme" | "Unknown";
  urgency: "Past" | "Future" | "Expected" | "Immediate" | "Unknown";
  certainty: string;
  starts_at: string;
  ends_at: string;
  area: string;
  url: string;
};

type AlertProperties = {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: NwsAlert["severity"];
  urgency: NwsAlert["urgency"];
  certainty: string;
  effective: string;
  expires: string;
  areaDesc: string;
  geocode?: { SAME?: string[]; UGC?: string[] };
  "@id": string;
};

type AlertsResp = {
  features?: Array<{ properties: AlertProperties }>;
};

export type NwsAlertsResult = {
  alerts: NwsAlert[];
  /** False means the official feed failed; an empty successful response is
   *  available=true. Safety copy must be able to tell those states apart. */
  available: boolean;
};

/** NWS can keep several revisions of one still-active product in the active
 * feed. Keep the newest revision per event/area/expiry so Today never shows an
 * alarming "+8 more" count for eight copies of the same air-quality notice. */
function dedupeRevisions(alerts: NwsAlert[]): NwsAlert[] {
  const newest = new Map<string, NwsAlert>();
  for (const alert of alerts) {
    const key = `${alert.event.toLowerCase()}|${alert.area.toLowerCase()}|${alert.ends_at}`;
    const previous = newest.get(key);
    if (!previous || Date.parse(alert.starts_at) > Date.parse(previous.starts_at)) {
      newest.set(key, alert);
    }
  }
  return [...newest.values()].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
}

/**
 * Does this alert actually affect Frederick County, MD?
 *
 * Primary check: the SAME (FIPS) code list. If the alert explicitly
 * names 024021 (Frederick County, MD) or a Maryland-statewide marker
 * (024 / 024000), it's ours.
 *
 * Fallback: areaDesc text. NWS sometimes omits geocode arrays on
 * older/cancelled alerts. Be strict here — require the literal
 * "Frederick" followed by ", MD" or " County, MD" so the VA county
 * never sneaks through. "All of Maryland" preserved for statewide
 * alerts that don't carry the 024 SAME code.
 */
function isForFrederickMD(p: AlertProperties): boolean {
  const same = p.geocode?.SAME ?? [];
  if (same.length > 0) {
    if (same.includes(FREDERICK_MD_SAME)) return true;
    if (same.some((s) => MD_STATEWIDE_SAME.includes(s))) return true;
    // SAME list exists but doesn't include us → definitively not ours.
    // Trust the structured data over the text.
    return false;
  }
  // No SAME codes — fall back to a tight areaDesc check that
  // disambiguates MD vs VA explicitly.
  const desc = p.areaDesc ?? "";
  if (/Frederick(?:\s+County)?,\s*MD\b/i.test(desc)) return true;
  if (/\bAll of Maryland\b/i.test(desc)) return true;
  return false;
}

export async function getNwsAlertsResult(): Promise<NwsAlertsResult> {
  // Hard 8s ceiling: api.weather.gov intermittently hangs on connect
  // (prod runtime errors: connect ETIMEDOUT). The .catch below already
  // fail-softs to [], but without an abort the request can tie up the
  // notify-civic-alerts cron for the platform's full connect timeout. Fail
  // fast instead so a slow NWS degrades to "no alerts this run", not a stall.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(`${NWS}/alerts/active?area=MD`, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
      signal: ctrl.signal,
      next: { revalidate: 600 },
    });
    if (!res.ok) return { alerts: [], available: false };
    const data = (await res.json()) as AlertsResp;
    const features = data.features ?? [];
    const alerts = features
      .filter((f) => isForFrederickMD(f.properties))
      .map((f) => ({
        id: f.properties.id,
        event: f.properties.event,
        headline: f.properties.headline,
        description: f.properties.description,
        severity: f.properties.severity,
        urgency: f.properties.urgency,
        certainty: f.properties.certainty,
        starts_at: f.properties.effective,
        ends_at: f.properties.expires,
        area: f.properties.areaDesc,
        url: f.properties["@id"],
      }));
    return { alerts: dedupeRevisions(alerts), available: true };
  } catch {
    return { alerts: [], available: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function getNwsAlerts(): Promise<NwsAlert[]> {
  return (await getNwsAlertsResult()).alerts;
}

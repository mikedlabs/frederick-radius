import { XMLParser, XMLValidator } from "fast-xml-parser";

/** FAA NAS reports airport-level events. Individual flight schedules come from airlines. */
const ENDPOINT = "https://nasstatus.faa.gov/api/airport-status-information";
// Treat a report older than half an hour as unverified, even after a successful HTTP fetch.
const MAX_REPORT_AGE_MS = 30 * 60_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

const TARGETS = [
  { code: "BWI", name: "BWI Marshall" },
  { code: "IAD", name: "Dulles" },
  { code: "DCA", name: "Reagan National" },
] as const;

export type AirportState = "not_listed" | "delay" | "ground_stop" | "closure";
export const AIRPORT_STATE_LABEL: Record<AirportState, string> = {
  not_listed: "No FAA notice listed",
  delay: "Delay reported",
  ground_stop: "Ground stop",
  closure: "Closure notice",
};

export type AirportStatus = {
  code: typeof TARGETS[number]["code"];
  name: string;
  state: AirportState;
  detail?: string;
};

type AirportReport = { updatedAt: string; airports: AirportStatus[] };

const SEVERITY: Record<AirportState, number> = { not_listed: 0, delay: 1, ground_stop: 2, closure: 3 };
const LISTS = [
  { list: "Arrival_Departure_Delay_List", item: "Delay", state: "delay" },
  { list: "Ground_Delay_List", item: "Ground_Delay", state: "delay" },
  { list: "Ground_Stop_List", item: "Program", state: "ground_stop" },
  { list: "Airport_Closure_List", item: "Airport", state: "closure" },
] as const;
const parser = new XMLParser({
  ignoreDeclaration: true,
  ignoreAttributes: name => name !== "Type",
  parseTagValue: false,
  trimValues: true,
});

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function list(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function delayDetail(item: Record<string, unknown>): string | undefined {
  const periods = list(item.Arrival_Departure);
  const durations = (periods.length ? periods : [item]).filter(record).map(period => {
    const average = text(period.Avg);
    const min = text(period.Min);
    const max = text(period.Max);
    const range = min && max && min !== max ? `${min}–${max}` : max ?? min;
    const duration = average ? `${average} avg` : range;
    if (!duration) return undefined;
    if (period["@_Type"] === "Arrival") return `Arrivals ${duration}`;
    if (period["@_Type"] === "Departure") return `Departures ${duration}`;
    return duration;
  });
  const reason = text(item.Reason)?.replace(/^WX:\s*/i, "");
  return [...new Set(durations), reason].filter(Boolean).join(" · ") || undefined;
}

export function parseAreaAirportReport(xml: string, now = Date.now()): AirportReport | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) return null;
  const document: unknown = parser.parse(xml);
  if (!record(document) || Object.keys(document).length !== 1) return null;
  const root = document.AIRPORT_STATUS_INFORMATION;
  if (!record(root) || Object.keys(root).some(key => !["Update_Time", "Dtd_File", "Delay_type"].includes(key))) return null;
  const published = text(root.Update_Time);
  if (!published || !/(?:GMT|UTC|Z)$/i.test(published)) return null;
  const updated = Date.parse(published);
  if (!Number.isFinite(updated) || now - updated > MAX_REPORT_AGE_MS || updated - now > MAX_CLOCK_SKEW_MS) return null;
  if (root.Delay_type === "") return null;
  const sections = list(root.Delay_type);
  // A recognized FAA envelope distinguishes a genuinely empty report from a partial response.
  if (!sections.length && !/\/Airports?Status\.dtd$/i.test(text(root.Dtd_File) ?? "")) return null;

  const airports: AirportStatus[] = TARGETS.map(target => ({ ...target, state: "not_listed" }));
  for (const section of sections) {
    if (!record(section) || !text(section.Name)) return null;
    const keys = Object.keys(section).filter(key => key !== "Name");
    if (keys.length !== 1) return null;
    const [key] = keys;
    if (key === "Airspace_Flow_List" || key === "CTOP_List") continue; // En-route programs.
    const schema = LISTS.find(entry => entry.list === key);
    if (!schema) return null;
    const group = section[key];
    if (group === "") continue;
    if (!record(group) || Object.keys(group).some(key => key !== schema.item)) return null;
    for (const item of list(group[schema.item])) {
      if (!record(item) || !text(item.ARPT)) return null;
      const airport = airports.find(target => target.code === item.ARPT);
      if (!airport || SEVERITY[schema.state] <= SEVERITY[airport.state]) continue;
      airport.state = schema.state;
      // A closure notice can apply only at certain times or to certain operations.
      // The FAA source carries its full terms. Keep delay figures on their own item.
      airport.detail = schema.state === "closure" ? undefined : delayDetail(item);
    }
  }
  return { airports, updatedAt: new Date(updated).toISOString() };
}

export async function getAreaAirportStatus(): Promise<AirportReport | null> {
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/xml" },
    });
    return res.ok ? parseAreaAirportReport(await res.text()) : null;
  } catch {
    return null;
  }
}

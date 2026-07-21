/**
 * FredScanner #incidents feed — parse + a strict PUBLIC-ONLY allowlist.
 *
 * The IFTTT bot in the FredScanner Slack posts the live Frederick County
 * CAD/dispatch stream, one line per call:
 *
 *   8:23 pm | SERVICE CALL | 100 BLOCK S MARKET ST, CARRIAGE HOUSE APTS | Radio: 9C | Units: E31 | Listen live at FrederickScanner.com
 *   7:23 pm | VEHICLE ACCIDENT - BLS | 12200 BLOCK COPPERMINE RD | Radio: 9B | Units: A179, E172
 *
 * This module turns that raw stream into safe, de-identified, public-safety
 * incidents. The allowlist mirrors the philosophy of pulsepoint.ts: only known
 * public, non-medical, road/fire/hazard call types survive; EVERYTHING else —
 * every medical (BLS/ALS person-down, odor inside a home, welfare check), fire
 * ALARM (false-heavy), service call, mutual aid, standby — is dropped by
 * default. A wrong call here is a privacy harm, so the list is conservative
 * and unit-tested against real lines (see incidentFeed.spec.ts).
 *
 * The feed is already block-level (no house numbers); we never add precision,
 * never surface unit/radio codes, and callers age incidents out fast.
 */

export type PublicIncidentKind =
  | "Crash"
  | "Wires down"
  | "Gas leak"
  | "Structure fire"
  | "Outside fire"
  | "Water rescue";

export type ParsedIncidentLine = {
  /** Clock time as posted, e.g. "8:23 pm". */
  time: string;
  /** Raw CAD call type, e.g. "VEHICLE ACCIDENT - BLS". */
  type: string;
  /** Block-level location / intersection as posted. */
  location: string;
};

export type PublicIncident = {
  time: string;
  kind: PublicIncidentKind;
  /** Block-level location, title-cased for display. */
  location: string;
  /** True when the incident plausibly affects getting around (a road). */
  roadImpact: boolean;
};

/**
 * Split one feed line into its fields. Returns null if it doesn't look like a
 * dispatch line (missing time / type / location). Tolerant of the optional
 * Radio segment and the trailing "Listen live" promo.
 */
export function parseIncidentLine(raw: string): ParsedIncidentLine | null {
  if (!raw) return null;
  // IFTTT prefixes the payload with "Attachment:" in some Slack shapes; drop it.
  const clean = raw.replace(/^attachment:\s*/i, "").replace(/\s+/g, " ").trim();
  const parts = clean.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const time = parts[0];
  if (!/^\d{1,2}:\d{2}\s*(am|pm)$/i.test(time)) return null;

  const type = parts[1];
  if (!type) return null;

  // Location = the segments after the type, up to the first Radio:/Units:/promo.
  const locSegs: string[] = [];
  for (let i = 2; i < parts.length; i++) {
    if (/^(radio|units)\s*:/i.test(parts[i]) || /listen live/i.test(parts[i])) break;
    locSegs.push(parts[i]);
  }
  const location = locSegs.join(", ").trim();
  if (!location) return null;

  return { time, type, location };
}

/** Public, non-medical, non-personal kinds only. First match wins. */
const PUBLIC_KINDS: { re: RegExp; kind: PublicIncidentKind; road: boolean }[] = [
  { re: /vehicle accident|collision|overturn|vehicle fire|\bcrash\b/i, kind: "Crash", road: true },
  { re: /wires? down|arcing|transformer fire|pole fire/i, kind: "Wires down", road: true },
  { re: /gas leak outside|gas main|gas odor outside/i, kind: "Gas leak", road: true },
  { re: /(structure|building|commercial|residential|dwelling|working|house|apartment) fire/i, kind: "Structure fire", road: false },
  { re: /(brush|field|outside|woods|grass|mulch) fire/i, kind: "Outside fire", road: false },
  { re: /water rescue|swift water/i, kind: "Water rescue", road: false },
];

/** Title-case a shouted block-level location for display, keeping BLOCK etc. */
function tidyLocation(loc: string): string {
  return loc
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bBlock\b/g, "block")
    .replace(/\bOf\b/g, "of")
    .replace(/\bAnd\b/g, "and")
    .replace(/\b(Fhh|Bls|Als|Ems|I|Ii|Iii)\b/g, (m) => m.toUpperCase());
}

/**
 * Parse one raw feed line and, if it's a public non-medical call we can
 * honestly show, return the cleaned incident. Returns null for everything
 * else — the safe default.
 */
export function publicIncident(raw: string): PublicIncident | null {
  const p = parseIncidentLine(raw);
  if (!p) return null;

  // Fire ALARMS are overwhelmingly false; never surface them as fires.
  if (/\balarm\b/i.test(p.type)) return null;
  // A bare medical response (BLS/ALS) that is NOT a vehicle crash is a person's
  // medical emergency — drop it. A "VEHICLE ACCIDENT - BLS" keeps (it's a crash).
  if (/\b(bls|als)\b/i.test(p.type) && !/vehicle accident|crash|collision|overturn/i.test(p.type)) {
    return null;
  }

  for (const k of PUBLIC_KINDS) {
    if (k.re.test(p.type)) {
      return { time: p.time, kind: k.kind, location: tidyLocation(p.location), roadImpact: k.road };
    }
  }
  return null;
}

/** Map a batch of raw lines to the public incidents, dropping the rest. */
export function publicIncidents(rawLines: readonly string[]): PublicIncident[] {
  const out: PublicIncident[] = [];
  for (const line of rawLines) {
    const inc = publicIncident(line);
    if (inc) out.push(inc);
  }
  return out;
}

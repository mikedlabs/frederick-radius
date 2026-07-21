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
 * public road/fire/hazard call types survive — crashes, a pedestrian or cyclist
 * struck (a road collision, not private medical), vehicle fires, wires down,
 * gas leaks outside, structure and outside fires, hazmat, water rescue and
 * entrapment. EVERYTHING else — every private medical (BLS/ALS person-down,
 * chest pain, fall, odor inside a home, welfare check), every crime, fire ALARM
 * (false-heavy), service call, mutual aid, standby — is dropped by default. The
 * line is public-road-event vs private-person: a person hit on a public road is
 * the former; a person having a medical emergency is the latter. A wrong call
 * here is a privacy harm, so the list is conservative and unit-tested against
 * real lines (see incidentFeed.spec.ts).
 *
 * The feed is already block-level (no house numbers); we never add precision,
 * never surface unit/radio codes, and callers age incidents out fast.
 */

export type PublicIncidentKind =
  | "Crash"
  | "Pedestrian struck"
  | "Vehicle fire"
  | "Wires down"
  | "Gas leak"
  | "Hazmat"
  | "Structure fire"
  | "Outside fire"
  | "Water rescue"
  | "Rescue"
  | "Medevac"
  | "Flooding";

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

/** Public, non-medical, non-personal kinds only. First match wins, so the more
 *  specific road-collision kinds (pedestrian, vehicle fire) come before Crash. */
const PUBLIC_KINDS: { re: RegExp; kind: PublicIncidentKind; road: boolean }[] = [
  // A person hit on a public road IS a road collision — block-level, no name.
  // The medical unit riding along doesn't make it private (see the guard below).
  { re: /pedestrian struck|ped(?:estrian)? struck|bicyclist struck|cyclist struck|struck by (?:a |an )?(?:vehicle|car|auto|truck|train)/i, kind: "Pedestrian struck", road: true },
  { re: /vehicle fire|car fire|auto fire|truck fire/i, kind: "Vehicle fire", road: true },
  { re: /(?:vehicle|motorcycle|motorcyle) accident|collision|overturn|\bcrash\b/i, kind: "Crash", road: true },
  { re: /wires? down|arcing|transformer fire|pole fire/i, kind: "Wires down", road: true },
  { re: /gas leak outside|gas main|gas odor outside/i, kind: "Gas leak", road: true },
  { re: /hazmat|hazardous materials?|hazardous spill|fuel spill|fuel leak|chemical spill/i, kind: "Hazmat", road: true },
  { re: /flooding|water over (?:the )?road|road(?:way)? flooded|highway flooded|high water/i, kind: "Flooding", road: true },
  { re: /(structure|building|commercial|residential|dwelling|working|house|apartment) fire/i, kind: "Structure fire", road: false },
  { re: /(brush|field|outside|woods|grass|mulch|dumpster|trash|rubbish) fire|machinery on fire|equipment fire/i, kind: "Outside fire", road: false },
  { re: /water rescue|swift water/i, kind: "Water rescue", road: false },
  { re: /entrapment|extrication|building collapse|structure collapse|person trapped|people trapped|trapped (?:in|inside|under)/i, kind: "Rescue", road: false },
  // A scene medevac / landing zone means a serious incident and often a road
  // shut for the helicopter. Routine hospital-helipad standby was dropped above.
  { re: /medevac|medivac|med-?evac|landing zone|helicopter landing/i, kind: "Medevac", road: true },
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
 * The allowlist itself, over already-separated parts (type / location / time).
 * Shared by the pipe-line parser and the RSS reader so BOTH sources apply the
 * exact same public-only rules. Returns null for anything medical/personal/
 * noisy — the safe default.
 */
export function classifyPublicIncident(
  type: string,
  location: string,
  time: string,
): PublicIncident | null {
  const loc = location.trim();
  if (!type || !loc) return null;

  // Fire ALARMS are overwhelmingly false; never surface them as fires.
  if (/\balarm\b/i.test(type)) return null;
  // "Standby" is routine cover / hospital-helipad prep, not a scene incident —
  // this also keeps a hospital "standby for helicopter landing" out while a
  // real scene MEDEVAC / LANDING ZONE below still lands.
  if (/\bstandby\b/i.test(type)) return null;
  // A bare medical response (BLS/ALS) that is NOT a road collision is a person's
  // private medical emergency — drop it. A crash or a pedestrian/cyclist struck
  // keeps: those are public road events that happen to carry a medical unit.
  if (
    /\b(bls|als)\b/i.test(type) &&
    !/vehicle accident|crash|collision|overturn|pedestrian|struck|bicyclist|cyclist|medevac|medivac|landing zone|helicopter/i.test(type)
  ) {
    return null;
  }

  for (const k of PUBLIC_KINDS) {
    if (k.re.test(type)) {
      return { time, kind: k.kind, location: tidyLocation(loc), roadImpact: k.road };
    }
  }
  return null;
}

/**
 * Parse one raw feed line and, if it's a public non-medical call we can
 * honestly show, return the cleaned incident.
 */
export function publicIncident(raw: string): PublicIncident | null {
  const p = parseIncidentLine(raw);
  if (!p) return null;
  return classifyPublicIncident(p.type, p.location, p.time);
}

/**
 * Turn an incident's block-level location into a street string a geocoder can
 * resolve, or null when there's nothing address-shaped. Drops the CAD "BLOCK"
 * token (keeping the house-range number as a hint), the landmark/apt tail after
 * the first comma, and rewrites an "A / B" intersection to "A and B". The
 * caller feeds this to the county-gated Mapbox geocoder, so a bad string just
 * yields no pin — never a wrong one.
 */
export function geocodableAddress(location: string): string | null {
  if (!location) return null;
  let s = location.split(",")[0].trim();          // drop landmark / apt / building tail
  s = s.replace(/\s*\/\s*/g, " and ");             // intersection → "A and B"
  s = s.replace(/\bblock\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!s || !/[a-z]/i.test(s)) return null;        // needs a street-ish token
  return s;
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

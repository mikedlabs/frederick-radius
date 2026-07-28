/**
 * PulsePoint — live fire / rescue / traffic dispatch activity.
 *
 * PulsePoint has no official third-party API. The web client pulls an
 * AES-256-CBC encrypted payload from giba.php; the decryption scheme
 * (OpenSSL EVP_BytesToKey + MD5, passphrase reconstructed below) is the
 * long-standing community-reverse-engineered one. It can change without
 * notice — every failure path returns [] so the UI degrades silently,
 * exactly like the other civic feeds.
 *
 * PRIVACY: PulsePoint's display guidelines (and our research blueprint)
 * require medical incidents to be filtered out before they reach the
 * client. We do that with an ALLOWLIST — only known non-medical
 * public-safety call types are returned; anything unrecognized
 * (including every medical code) is dropped.
 *
 * Config: this restricted, reverse-engineered source has TWO gates.
 * PULSEPOINT_ENABLED must be exactly "1" to record the explicit policy
 * approval, and PULSEPOINT_AGENCY_ID must name the participating agency.
 * Either one missing means no request is made.
 */
import crypto from "node:crypto";

export type PulsePointIncident = {
  id: string;
  type: string;          // friendly label, never medical
  /** Presentation boundary, not an official PulsePoint field. Routine service
   * calls stay available in the Fire & rescue detail without becoming a
   * countywide alert. */
  severity: PulsePointIncidentSeverity;
  address: string;       // PulsePoint already block-level obfuscates
  received_at: string;
  lat?: number;
  lng?: number;
};

export type PulsePointIncidentSeverity = "routine" | "notable" | "severe";

export type PulsePointIncidentsResult = {
  data: PulsePointIncident[];
  /** True only when PulsePoint returned a decryptable, structurally valid feed. */
  available: boolean;
  /** Distinguishes a missing deployment setting from an upstream failure. */
  configured: boolean;
  asOf?: string;
  asOfBasis?: "provider" | "retrieval";
};

// Non-medical public-safety call types only. Unknown/medical codes are
// intentionally excluded so no patient incident can ever leak.
type PulsePointCallProfile = {
  label: string;
  severity: PulsePointIncidentSeverity;
};

/**
 * PulsePoint reports operational call types, not countywide warning severity.
 * A dispatched unit does not automatically mean the public needs an alert.
 * Keep routine calls in the detail feed, use "notable" for real activity that
 * is useful to see there, and reserve "severe" for clear fire/rescue/hazard
 * types that may justify global alert treatment.
 */
const CALL_TYPES: Record<string, PulsePointCallProfile> = {
  AA: { label: "Auto Aid", severity: "routine" },
  MU: { label: "Mutual Aid", severity: "routine" },
  ST: { label: "Structure Fire", severity: "severe" },
  SF: { label: "Structure Fire", severity: "severe" },
  RF: { label: "Residential Fire", severity: "severe" },
  CF: { label: "Commercial Fire", severity: "severe" },
  OF: { label: "Outside Fire", severity: "notable" },
  VEG: { label: "Vegetation Fire", severity: "severe" },
  WF: { label: "Wildland Fire", severity: "severe" },
  VF: { label: "Vehicle Fire", severity: "notable" },
  AF: { label: "Auto Fire", severity: "notable" },
  FIRE: { label: "Fire", severity: "notable" },
  FL: { label: "Fire", severity: "notable" },
  FA: { label: "Fire Alarm", severity: "routine" },
  AFA: { label: "Fire Alarm", severity: "routine" },
  SD: { label: "Smoke Detector", severity: "routine" },
  SMOKE: { label: "Smoke Investigation", severity: "notable" },
  OI: { label: "Odor Investigation", severity: "routine" },
  CO: { label: "Carbon Monoxide", severity: "notable" },
  GAS: { label: "Gas Leak", severity: "severe" },
  HMR: { label: "Hazmat", severity: "severe" },
  HZ: { label: "Hazmat", severity: "severe" },
  EX: { label: "Explosion", severity: "severe" },
  FUEL: { label: "Fuel Spill", severity: "notable" },
  ELF: { label: "Electrical Hazard", severity: "notable" },
  WIRE: { label: "Wires Down", severity: "notable" },
  TC: { label: "Traffic Collision", severity: "notable" },
  TCE: { label: "Traffic Collision", severity: "notable" },
  TCS: { label: "Traffic Collision", severity: "notable" },
  VW: { label: "Vehicle Wreck", severity: "notable" },
  RES: { label: "Rescue", severity: "notable" },
  WR: { label: "Water Rescue", severity: "severe" },
  TR: { label: "Technical Rescue", severity: "severe" },
  CR: { label: "Cliff Rescue", severity: "severe" },
  ER: { label: "Elevator Rescue", severity: "notable" },
  LR: { label: "Ladder Request", severity: "routine" },
  LO: { label: "Lockout", severity: "routine" },
  PA: { label: "Public Assist", severity: "routine" },
  PS: { label: "Public Service", severity: "routine" },
  AC: { label: "Aircraft Emergency", severity: "severe" },
  TD: { label: "Tree Down", severity: "notable" },
  FW: { label: "Fireworks", severity: "routine" },
  ALARM: { label: "Alarm", severity: "routine" },
  INV: { label: "Investigation", severity: "routine" },
};

export function pulsePointCallProfile(code: string): PulsePointCallProfile | null {
  return CALL_TYPES[code.trim().toUpperCase()] ?? null;
}

export function isPulsePointAlert(
  incident: Pick<PulsePointIncident, "severity">,
): boolean {
  return incident.severity === "severe";
}

export function isPulsePointNotable(
  incident: Pick<PulsePointIncident, "severity">,
): boolean {
  return incident.severity !== "routine";
}

function agencyId(): string | null {
  return process.env.PULSEPOINT_AGENCY_ID || null;
}

export function pulsepointPolicyEnabled(): boolean {
  return process.env.PULSEPOINT_ENABLED === "1";
}

export function pulsepointConfigured(): boolean {
  return pulsepointPolicyEnabled() && Boolean(agencyId());
}

/** OpenSSL-compatible MD5 EVP_BytesToKey → 32-byte AES-256 key. */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  const pw = Buffer.from(passphrase, "utf8");
  let data = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (data.length < 32) {
    prev = crypto.createHash("md5").update(Buffer.concat([prev, pw, salt])).digest();
    data = Buffer.concat([data, prev]);
  }
  return data.subarray(0, 32);
}

// Passphrase reconstructed from "CommonIncidents" so the literal string
// isn't sitting in source: -> "tombrady5rings".
function passphrase(): string {
  const e = "CommonIncidents";
  return e[13] + e[1] + e[2] + "brady" + "5" + "r" + e.toLowerCase()[6] + e[5] + "gs";
}

type RawIncident = {
  ID?: string;
  PulsePointIncidentCallType?: string;
  CallType?: string;
  FullDisplayAddress?: string;
  MedicalEmergencyDisplayAddress?: string;
  CallReceivedDateTime?: string;
  Latitude?: string | number;
  Longitude?: string | number;
};

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function responseDate(res: Response): string | undefined {
  const raw = res.headers.get("date");
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

export async function getPulsePointIncidentsResult(): Promise<PulsePointIncidentsResult> {
  // The manifest keeps PulsePoint pending_review. An agency id by itself must
  // never silently activate a source whose privacy/licensing review has not
  // been recorded. This separate switch is the deliberate approval boundary.
  if (!pulsepointPolicyEnabled()) {
    return { data: [], available: false, configured: false };
  }
  const id = agencyId();
  if (!id) return { data: [], available: false, configured: false };
  try {
    const res = await fetch(
      `https://web.pulsepoint.org/DB/giba.php?agency_id=${encodeURIComponent(id)}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 60 } }
    );
    if (!res.ok) return { data: [], available: false, configured: true };
    const env = (await res.json().catch(() => null)) as
      | { ct?: string; iv?: string; s?: string }
      | null;
    if (!env?.ct || !env.iv || !env.s) {
      return { data: [], available: false, configured: true };
    }

    const key = deriveKey(passphrase(), Buffer.from(env.s, "hex"));
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      key,
      Buffer.from(env.iv, "hex")
    );
    let out = decipher.update(Buffer.from(env.ct, "base64"), undefined, "utf8");
    out += decipher.final("utf8");

    // Decrypted payload is a JSON-string-encoded JSON object.
    let parsed: unknown;
    try {
      parsed = JSON.parse(out);
    } catch {
      parsed = JSON.parse(out.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"'));
    }
    const active =
      (parsed as { incidents?: { active?: RawIncident[] } })?.incidents?.active;
    if (!Array.isArray(active)) {
      return { data: [], available: false, configured: true };
    }

    const seen = new Set<string>();
    const items: PulsePointIncident[] = [];
    for (const raw of active) {
      const code = String(raw.PulsePointIncidentCallType ?? raw.CallType ?? "")
        .trim()
        .toUpperCase();
      const profile = pulsePointCallProfile(code);
      if (!profile) continue; // unknown or medical → excluded
      const id = String(raw.ID ?? `${code}-${raw.CallReceivedDateTime}`);
      if (seen.has(id)) continue;
      const received = raw.CallReceivedDateTime
        ? new Date(raw.CallReceivedDateTime)
        : null;
      if (!received || !Number.isFinite(received.getTime())) continue;
      seen.add(id);
      items.push({
        id,
        type: profile.label,
        severity: profile.severity,
        address: String(raw.FullDisplayAddress ?? "").trim() || "Frederick County",
        received_at: received.toISOString(),
        lat: num(raw.Latitude),
        lng: num(raw.Longitude),
      });
    }
    items.sort((a, b) => +new Date(b.received_at) - +new Date(a.received_at));
    const retrievedAt = responseDate(res);
    const providerAsOf = items[0]?.received_at;
    return {
      data: items.slice(0, 20),
      available: true,
      configured: true,
      ...(retrievedAt
        ? { asOf: retrievedAt, asOfBasis: "retrieval" as const }
        : providerAsOf
          ? { asOf: providerAsOf, asOfBasis: "provider" as const }
          : {}),
    };
  } catch {
    return { data: [], available: false, configured: true };
  }
}

/** Compatibility wrapper for alert-only surfaces that hide on an empty set. */
export async function getPulsePointIncidents(): Promise<PulsePointIncident[]> {
  return (await getPulsePointIncidentsResult()).data;
}

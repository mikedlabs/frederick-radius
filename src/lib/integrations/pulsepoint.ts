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
  address: string;       // PulsePoint already block-level obfuscates
  received_at: string;
  lat?: number;
  lng?: number;
};

export type PulsePointIncidentsResult = {
  data: PulsePointIncident[];
  /** True only when PulsePoint returned a decryptable, structurally valid feed. */
  available: boolean;
  /** Distinguishes a missing deployment setting from an upstream failure. */
  configured: boolean;
};

// Non-medical public-safety call types only. Unknown/medical codes are
// intentionally excluded so no patient incident can ever leak.
const CALL_TYPES: Record<string, string> = {
  AA: "Auto Aid", MU: "Mutual Aid", ST: "Structure Fire", SF: "Structure Fire",
  RF: "Residential Fire", CF: "Commercial Fire", OF: "Outside Fire",
  VEG: "Vegetation Fire", WF: "Wildland Fire", VF: "Vehicle Fire",
  AF: "Auto Fire", FIRE: "Fire", FL: "Fire", FA: "Fire Alarm",
  AFA: "Fire Alarm", SD: "Smoke Detector", SMOKE: "Smoke Investigation",
  OI: "Odor Investigation", CO: "Carbon Monoxide", GAS: "Gas Leak",
  HMR: "Hazmat", HZ: "Hazmat", EX: "Explosion", FUEL: "Fuel Spill",
  ELF: "Electrical Hazard", WIRE: "Wires Down", TC: "Traffic Collision",
  TCE: "Traffic Collision", TCS: "Traffic Collision", VW: "Vehicle Wreck",
  RES: "Rescue", WR: "Water Rescue", TR: "Technical Rescue",
  CR: "Cliff Rescue", ER: "Elevator Rescue", LR: "Ladder Request",
  LO: "Lockout", PA: "Public Assist", PS: "Public Service",
  AC: "Aircraft Emergency", TD: "Tree Down", FW: "Fireworks",
  ALARM: "Alarm", INV: "Investigation",
};

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
      const label = CALL_TYPES[code];
      if (!label) continue; // unknown or medical → excluded
      const id = String(raw.ID ?? `${code}-${raw.CallReceivedDateTime}`);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        type: label,
        address: String(raw.FullDisplayAddress ?? "").trim() || "Frederick County",
        received_at: raw.CallReceivedDateTime
          ? new Date(raw.CallReceivedDateTime).toISOString()
          : new Date().toISOString(),
        lat: num(raw.Latitude),
        lng: num(raw.Longitude),
      });
    }
    items.sort((a, b) => +new Date(b.received_at) - +new Date(a.received_at));
    return {
      data: items.slice(0, 20),
      available: true,
      configured: true,
    };
  } catch {
    return { data: [], available: false, configured: true };
  }
}

/** Compatibility wrapper for alert-only surfaces that hide on an empty set. */
export async function getPulsePointIncidents(): Promise<PulsePointIncident[]> {
  return (await getPulsePointIncidentsResult()).data;
}

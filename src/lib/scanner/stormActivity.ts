import type { PublicIncidentKind } from "@/lib/scanner/incidentFeed";

/**
 * Storm-mode scanner counts for Today's WeatherNeeds layer.
 *
 * During an active warning the scanner is the ground truth of what the storm
 * is actually doing to the county. This module reduces the already-filtered
 * public feed to ONE calm sentence of counts per hazard — wires-down calls
 * during a storm, flooding calls during a flood — and stays silent otherwise.
 * Counts only, from the public allowlisted kinds, aggregate by construction;
 * no locations, no new precision, no persistence.
 */

export const STORM_ACTIVITY_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Which public call kinds testify about which hazard. Heat and cold get no
 *  line: the scanner's public kinds carry no signal for them. */
const HAZARD_KINDS: Record<string, PublicIncidentKind[]> = {
  flood: ["Flooding", "Water rescue"],
  storm: ["Wires down", "Flooding"],
  tornado: ["Wires down", "Flooding"],
  severe: ["Wires down", "Flooding"],
  winter: ["Crash", "Wires down"],
};

const KIND_PHRASE: Partial<Record<PublicIncidentKind, [string, string]>> = {
  "Wires down": ["wires-down call", "wires-down calls"],
  Flooding: ["flooding call", "flooding calls"],
  "Water rescue": ["water-rescue call", "water-rescue calls"],
  Crash: ["crash call", "crash calls"],
};

export type StormActivityIncident = { kind: PublicIncidentKind; at: string };

/**
 * One sentence of live counts, or null when the hazard has no scanner signal
 * or the window is quiet. "On the scanner in the last 3 hours: 6 wires-down
 * calls and 2 flooding calls."
 */
export function stormActivityLine(
  incidents: readonly StormActivityIncident[],
  hazard: string,
  now: Date | string | number,
  windowMs: number = STORM_ACTIVITY_WINDOW_MS,
): string | null {
  const kinds = HAZARD_KINDS[hazard];
  if (!kinds) return null;
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return null;

  const counts = new Map<PublicIncidentKind, number>();
  for (const incident of incidents) {
    if (!kinds.includes(incident.kind)) continue;
    const atMs = Date.parse(incident.at);
    if (!Number.isFinite(atMs) || nowMs - atMs < 0 || nowMs - atMs > windowMs) continue;
    counts.set(incident.kind, (counts.get(incident.kind) ?? 0) + 1);
  }

  const parts = kinds
    .map((kind) => {
      const n = counts.get(kind) ?? 0;
      const phrase = KIND_PHRASE[kind];
      if (n === 0 || !phrase) return null;
      return `${n} ${n === 1 ? phrase[0] : phrase[1]}`;
    })
    .filter((part): part is string => part !== null);
  if (parts.length === 0) return null;

  const list = parts.length === 1 ? parts[0] : parts.join(" and ");
  const hours = Math.round(windowMs / 3_600_000);
  return `On the scanner in the last ${hours} hours: ${list}.`;
}

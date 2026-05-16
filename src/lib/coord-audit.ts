/**
 * Pure curated-vs-authoritative coordinate divergence check.
 *
 * The DFP records are geocoded from authoritative addresses; hand-entered
 * curated records sometimes carry guessed coordinates. When the same
 * business exists in both and the coordinates disagree by a lot, the
 * curated one is almost always the error (it renders in the wrong place
 * on the map). No I/O here, so the script and the data-health cron share
 * identical logic.
 */
import { normName } from "@/lib/dedup";
import { haversineMeters } from "@/lib/geo";

export type CoordAuditPlace = {
  name: string;
  address?: string;
  geom?: { lat: number; lng: number };
};

export type CoordAuditFlag = {
  name: string;
  meters: number;
  curated: { address?: string; lat: number; lng: number };
  authoritative: { address?: string; lat: number; lng: number };
};

export function auditCoordDivergence(
  curated: CoordAuditPlace[],
  authoritative: CoordAuditPlace[],
  thresholdM = 200,
): CoordAuditFlag[] {
  const byName = new Map<string, CoordAuditPlace>();
  for (const r of authoritative) {
    const nm = normName(r.name ?? "");
    if (nm && r.geom && !byName.has(nm)) byName.set(nm, r);
  }

  const out: CoordAuditFlag[] = [];
  for (const p of curated) {
    if (!p.geom) continue;
    const d = byName.get(normName(p.name));
    if (!d?.geom) continue;
    const meters = Math.round(haversineMeters(p.geom, d.geom));
    if (meters > thresholdM) {
      out.push({
        name: p.name,
        meters,
        curated: { address: p.address, lat: p.geom.lat, lng: p.geom.lng },
        authoritative: { address: d.address, lat: d.geom.lat, lng: d.geom.lng },
      });
    }
  }
  return out.sort((a, b) => b.meters - a.meters);
}

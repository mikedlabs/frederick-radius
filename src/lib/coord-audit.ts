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

function streetNumber(address?: string): string | undefined {
  return address?.trim().match(/^(\d+[a-z]?)(?:\s|$)/i)?.[1]?.toLowerCase();
}

/**
 * A repeated business name is not enough to identify one storefront. Chains
 * and local businesses can have multiple county locations, so when both rows
 * provide a street number it must agree before coordinates are compared.
 */
function couldBeSameListing(a?: string, b?: string): boolean {
  const aNumber = streetNumber(a);
  const bNumber = streetNumber(b);
  return !aNumber || !bNumber || aNumber === bNumber;
}

export function auditCoordDivergence(
  curated: CoordAuditPlace[],
  authoritative: CoordAuditPlace[],
  thresholdM = 200,
): CoordAuditFlag[] {
  const byName = new Map<string, CoordAuditPlace[]>();
  for (const r of authoritative) {
    const nm = normName(r.name ?? "");
    if (!nm || !r.geom) continue;
    const rows = byName.get(nm) ?? [];
    rows.push(r);
    byName.set(nm, rows);
  }

  const out: CoordAuditFlag[] = [];
  for (const p of curated) {
    if (!p.geom) continue;
    const candidates = (byName.get(normName(p.name)) ?? []).filter(
      (row) => row.geom && couldBeSameListing(p.address, row.address),
    );
    if (candidates.length === 0) continue;
    // If the authoritative source contains duplicate rows for one address,
    // compare the nearest candidate instead of whichever happened to load
    // first. This keeps the audit deterministic and branch-safe.
    const d = candidates.reduce((best, row) => {
      if (!best.geom || !row.geom) return best;
      return haversineMeters(p.geom!, row.geom) < haversineMeters(p.geom!, best.geom)
        ? row
        : best;
    });
    if (!d.geom) continue;
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

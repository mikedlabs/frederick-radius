/**
 * Community reports loader — the read side of the community layer.
 *
 * Returns APPROVED, not-yet-expired reports for the map + Ask Radius. Fail-soft
 * by construction: no DB configured, the table not migrated yet, or any query
 * error all return [] — so this can be wired into the map safely before the
 * `community_reports` table exists on prod.
 */
import { and, eq, gt, isNull, or, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { community_reports } from "@/lib/db/schema";

export type CommunityReport = {
  id: string;
  category: string;
  subtype?: string;
  title?: string;
  note?: string;
  photo?: string;
  municipality?: string;
  lng: number;
  lat: number;
  createdAt?: string;
};

export async function getCommunityReports(now: Date = new Date()): Promise<CommunityReport[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: community_reports.id,
        category: community_reports.category,
        subtype: community_reports.subtype,
        title: community_reports.title,
        note: community_reports.note,
        photo_url: community_reports.photo_url,
        municipality: community_reports.municipality,
        lng: community_reports.lng,
        lat: community_reports.lat,
        created_at: community_reports.created_at,
      })
      .from(community_reports)
      .where(
        and(
          eq(community_reports.status, "approved"),
          // live = no expiry, or expiry still in the future
          or(isNull(community_reports.expires_at), gt(community_reports.expires_at, now)),
        ),
      )
      .orderBy(desc(community_reports.created_at))
      .limit(500);

    const out: CommunityReport[] = [];
    for (const r of rows) {
      if (!Number.isFinite(r.lng) || !Number.isFinite(r.lat)) continue;
      out.push({
        id: `report:${r.id}`,
        category: r.category,
        subtype: r.subtype ?? undefined,
        title: r.title ?? undefined,
        note: r.note ?? undefined,
        photo: r.photo_url ?? undefined,
        municipality: r.municipality ?? undefined,
        lng: r.lng,
        lat: r.lat,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

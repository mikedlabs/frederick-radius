/**
 * fieldNotesDb — owner-authored field notes + deals from the `field_notes`
 * table, edited via /admin/field-notes.
 *
 * These are read ALONGSIDE the committed src/data/field-notes.json (the JSON is
 * the seed/fallback; DB rows add to it — the places-overrides precedence
 * spirit). Server-only, fail-soft: no DATABASE_URL degrades to zero DB notes so
 * every surface still stands on the committed JSON. Cached per request.
 */
import "server-only";
import { cache } from "react";
import { getSql } from "@/lib/db/client";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { fieldNotesFor, verifiedLabel } from "@/lib/loaders/fieldNotes";
import {
  distillOffer,
  extractHours,
  EASTERN_WEEKDAY,
  type TodaysDeal,
} from "@/lib/loaders/todaysDeals";

export type DbFieldNote = {
  id: string;
  place_slug: string;
  kind: string; // 'deal' | 'parking' | 'insider' | 'happy_hour'
  text: string;
  day_of_week: string | null;
  hours: string | null;
  source_url: string | null;
  confidence: string;
  last_verified: string | null; // YYYY-MM-DD
  expires_at: string | null; // YYYY-MM-DD
  updated_at: string;
};

/** Every DB field note, newest first. Cached per request. */
export const getDbFieldNotes = cache(async (): Promise<DbFieldNote[]> => {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = (await sql`
      select id, place_slug, kind, text, day_of_week, hours, source_url, confidence,
             to_char(last_verified, 'YYYY-MM-DD') as last_verified,
             to_char(expires_at, 'YYYY-MM-DD')   as expires_at,
             updated_at
      from field_notes
      order by updated_at desc
    `) as DbFieldNote[];
    return rows;
  } catch {
    return [];
  }
});

/** Today's date in Eastern time, as YYYY-MM-DD (for expiry comparison). */
function easternIso(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

/**
 * DB deals that apply TODAY, shaped as TodaysDeal so they slot into the same
 * deck as the JSON deals. A deal shows when it hasn't expired and either names
 * today's weekday or names no day (every-day standing special).
 */
export async function getDbDealsToday(now: Date, limit = 12): Promise<TodaysDeal[]> {
  const notes = await getDbFieldNotes();
  if (notes.length === 0) return [];
  const todayName = EASTERN_WEEKDAY(now).toLowerCase(); // "tuesday"
  const todayIso = easternIso(now);
  const out: TodaysDeal[] = [];
  for (const n of notes) {
    if (n.kind !== "deal") continue;
    if (n.expires_at && n.expires_at < todayIso) continue;
    if (n.day_of_week && n.day_of_week.toLowerCase() !== todayName) continue;
    const place = clientPlaceBySlug(n.place_slug);
    if (!place) continue; // unknown/removed place — never surface
    const town = place.municipality ? MUNICIPALITY_BY_SLUG[place.municipality]?.name : undefined;
    const fn = fieldNotesFor(n.place_slug);
    const offer = n.text.trim();
    const distilled = distillOffer(offer);
    out.push({
      slug: n.place_slug,
      name: place.name,
      town,
      downtown: place.municipality === "frederick",
      category: place.category,
      photo: place.google_photo_url,
      offer,
      headline: distilled.headline,
      terms: distilled.terms,
      hours: n.hours ?? extractHours(offer),
      park: fn?.parking?.text,
      tip: fn?.insider?.[0]?.text,
      source_url: n.source_url ?? undefined,
      verified: n.last_verified ? verifiedLabel(n.last_verified) : "Owner-added",
      confidence: (n.confidence || "medium").toLowerCase(),
    });
  }
  return out.slice(0, limit);
}

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/**
 * Merge the committed-JSON deals with the DB deals into one deck: dedupe by
 * slug (a DB deal for a place WINS over its JSON deal — that's how the owner
 * corrects/overrides), then re-apply the canonical sort (downtown, then
 * confidence, then name) and clamp to `limit`.
 */
export function mergeTodaysDeals(
  jsonDeals: TodaysDeal[],
  dbDeals: TodaysDeal[],
  limit: number,
): TodaysDeal[] {
  const bySlug = new Map<string, TodaysDeal>();
  for (const d of jsonDeals) bySlug.set(d.slug, d);
  for (const d of dbDeals) bySlug.set(d.slug, d); // DB wins
  return [...bySlug.values()]
    .sort(
      (a, b) =>
        Number(Boolean(b.downtown)) - Number(Boolean(a.downtown)) ||
        (CONF_RANK[b.confidence] ?? 0) - (CONF_RANK[a.confidence] ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

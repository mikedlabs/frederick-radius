/**
 * /api/collect — the write/read endpoint for the /collect field tool.
 *
 *   POST { kind, lng, lat, name?, note?, municipality?, collectedBy?, passcode }
 *        → insert one field-collected amenity (instant-publish,
 *          status='approved'). Gated by the COLLECT_PASSCODE env so only
 *          someone with the shared passcode can write to the live map.
 *   GET  → { count, items: [...] } the approved field points, newest
 *          first (so the collector can see what they've added today).
 *
 * Writes go through the server postgres role (getDb bypasses RLS). When
 * no DB / no passcode is configured the route fails closed (503/500) so
 * a misconfigured deploy can never accept anonymous writes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { field_amenities } from "@/lib/db/schema";
import { isInFrederickCounty } from "@/components/map/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore() {
  return { "Cache-Control": "no-store" };
}

// The fixed set the /collect picker can emit (kept in sync with the
// picker UI + AMENITY_KIND_TO_CAT + the fieldAmenities loader).
const KINDS = new Set([
  "trash", "recycling", "water", "bench",
  "dog_waste", "dog_water", "outlet", "ev_charging", "restroom", "other",
]);

/** Constant-ish-time passcode check. Returns false when no passcode is
 *  configured, so the route is closed by default. */
function passcodeOk(supplied: unknown): boolean {
  const expected = process.env.COLLECT_PASSCODE;
  if (!expected) return false;
  if (typeof supplied !== "string" || supplied.length === 0) return false;
  // Length-independent compare to avoid trivially leaking length via timing.
  const a = supplied;
  const b = expected;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { count: 0, items: [] },
      { headers: noStore() },
    );
  }
  try {
    const rows = await db
      .select({
        id: field_amenities.id,
        kind: field_amenities.kind,
        name: field_amenities.name,
        note: field_amenities.note,
        lng: field_amenities.lng,
        lat: field_amenities.lat,
        created_at: field_amenities.created_at,
      })
      .from(field_amenities)
      .where(eq(field_amenities.status, "approved"))
      .orderBy(desc(field_amenities.created_at))
      .limit(200);
    return NextResponse.json({ count: rows.length, items: rows }, { headers: noStore() });
  } catch {
    return NextResponse.json({ count: 0, items: [] }, { headers: noStore() });
  }
}

export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "database-unavailable" },
      { status: 503, headers: noStore() },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore() });
  }

  if (!passcodeOk(body.passcode)) {
    return NextResponse.json({ error: "bad-passcode" }, { status: 401, headers: noStore() });
  }

  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid-kind" }, { status: 400, headers: noStore() });
  }

  const lng = Number(body.lng);
  const lat = Number(body.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "invalid-coords" }, { status: 400, headers: noStore() });
  }
  // Lock writes to the county — the tool is for walking Frederick, and a
  // wild coordinate (bad GPS, fat-finger) would litter the map far away.
  if (!isInFrederickCounty(lng, lat)) {
    return NextResponse.json({ error: "out-of-bounds" }, { status: 400, headers: noStore() });
  }

  const clip = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  };

  const name = clip(body.name, 80);
  const note = clip(body.note, 280);
  const municipality = clip(body.municipality, 80);
  const collected_by = clip(body.collectedBy, 60);

  try {
    const [row] = await db
      .insert(field_amenities)
      .values({
        kind,
        name: name ?? undefined,
        note: note ?? undefined,
        municipality: municipality ?? undefined,
        collected_by: collected_by ?? undefined,
        lng,
        lat,
      })
      .returning({ id: field_amenities.id });
    return NextResponse.json({ ok: true, id: row?.id }, { headers: noStore() });
  } catch {
    return NextResponse.json({ error: "insert-failed" }, { status: 500, headers: noStore() });
  }
}

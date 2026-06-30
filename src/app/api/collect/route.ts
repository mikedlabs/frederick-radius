/**
 * /api/collect — the write/read endpoint for the /collect field tool.
 *
 *   GET    → { count, items: [...] } approved field points, newest first.
 *   POST   { kind, lng, lat, name?, note?, photo?, municipality?, collectedBy?, passcode }
 *          → insert one field-collected amenity (instant-publish,
 *            status='approved'). `photo` is a data: URL, uploaded to blob
 *            storage and stored as photo_url. Passcode-gated.
 *   PATCH  { id, passcode, kind?, note?, photo? }  → edit a point.
 *   DELETE { id, passcode }                        → remove a point.
 *
 * Writes go through the server postgres role (getDb bypasses RLS). When
 * no DB / no passcode is configured the route fails closed (503/401) so
 * a misconfigured deploy can never accept anonymous writes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db/client";
import { field_amenities } from "@/lib/db/schema";
import { isInFrederickCounty } from "@/components/map/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore() {
  return { "Cache-Control": "no-store" };
}

// Decoded-image size cap (~4 MB) — the client downscales to ~1280px before
// sending, so a normal photo is far under this; the cap just rejects abuse.
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/**
 * Upload a base64 data-URL image to blob storage, return its public URL.
 * Returns null when there's no photo, the data URL is malformed/too big, or
 * blob isn't configured (no BLOB_READ_WRITE_TOKEN) / the upload fails — the
 * caller treats a null as "save the point without a photo" rather than failing
 * the whole save.
 */
async function uploadPhoto(raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || !raw.startsWith("data:image/")) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(raw);
  if (!m) return null;
  const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_PHOTO_BYTES) return null;
  try {
    const { url } = await put(`field-photos/${randomUUID()}.${ext}`, buf, {
      access: "public",
      addRandomSuffix: false,
      contentType: m[1],
    });
    return url;
  } catch {
    return null;
  }
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
        photo_url: field_amenities.photo_url,
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
  // Upload the reference photo (if any) before the insert so its URL lands on
  // the row. A failed/absent photo never blocks the save.
  const photo_url = await uploadPhoto(body.photo);

  try {
    const [row] = await db
      .insert(field_amenities)
      .values({
        kind,
        name: name ?? undefined,
        note: note ?? undefined,
        municipality: municipality ?? undefined,
        collected_by: collected_by ?? undefined,
        photo_url: photo_url ?? undefined,
        lng,
        lat,
      })
      .returning({ id: field_amenities.id });
    return NextResponse.json({ ok: true, id: row?.id, photo_url }, { headers: noStore() });
  } catch {
    return NextResponse.json({ error: "insert-failed" }, { status: 500, headers: noStore() });
  }
}

/** Validate the shared id shape used by PATCH/DELETE. The /collect client
 *  works with the bare DB uuid (GET returns `id`), so accept that. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
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
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "invalid-id" }, { status: 400, headers: noStore() });
  }

  // Build a partial update from whatever was supplied. Empty patch is a no-op.
  const patch: Partial<typeof field_amenities.$inferInsert> = {};
  if (typeof body.kind === "string") {
    if (!KINDS.has(body.kind)) {
      return NextResponse.json({ error: "invalid-kind" }, { status: 400, headers: noStore() });
    }
    patch.kind = body.kind;
  }
  if (typeof body.note === "string") {
    const t = body.note.trim();
    patch.note = t ? t.slice(0, 280) : null;
  }
  if (typeof body.photo === "string" && body.photo.startsWith("data:image/")) {
    const url = await uploadPhoto(body.photo);
    if (url) patch.photo_url = url;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true }, { headers: noStore() });
  }

  try {
    const rows = await db
      .update(field_amenities)
      .set(patch)
      .where(eq(field_amenities.id, id))
      .returning({ id: field_amenities.id });
    if (rows.length === 0) {
      return NextResponse.json({ error: "not-found" }, { status: 404, headers: noStore() });
    }
    return NextResponse.json({ ok: true, id }, { headers: noStore() });
  } catch {
    return NextResponse.json({ error: "update-failed" }, { status: 500, headers: noStore() });
  }
}

export async function DELETE(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
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
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "invalid-id" }, { status: 400, headers: noStore() });
  }
  try {
    const rows = await db
      .delete(field_amenities)
      .where(eq(field_amenities.id, id))
      .returning({ id: field_amenities.id });
    if (rows.length === 0) {
      return NextResponse.json({ error: "not-found" }, { status: 404, headers: noStore() });
    }
    return NextResponse.json({ ok: true, id }, { headers: noStore() });
  } catch {
    return NextResponse.json({ error: "delete-failed" }, { status: 500, headers: noStore() });
  }
}

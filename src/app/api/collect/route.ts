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
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db/client";
import { field_amenities } from "@/lib/db/schema";
import { isInFrederickCounty } from "@/components/map/constants";
import {
  deleteFieldPhoto,
  isManagedFieldPhoto,
  parseFieldPhotoDataUrl,
  type ParsedFieldPhoto,
} from "@/lib/field-photo";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore() {
  return { "Cache-Control": "no-store" };
}

// A 4 MiB image expands to roughly 5.34 MiB as base64. This leaves room for
// its data-URL prefix and the remaining fields while bounding retained JSON.
const MAX_COLLECT_BODY_BYTES = 6 * 1024 * 1024;
// Ride mode tags one point per tap, so a productive collection run can
// beat the old 60/hour. 240/hour still bounds a leaked passcode's blast
// radius while never throttling a real ride.
const COLLECT_RATE_LIMIT = 240;
const COLLECT_RATE_WINDOW_SECONDS = 60 * 60;

type ValidFieldPhoto = Extract<ParsedFieldPhoto, { status: "valid" }>;
type UploadedPhoto =
  | { ok: true; url: string }
  | { ok: false; error: "photo-storage-unavailable" };

/**
 * Upload a previously signature-checked image. If the user supplied a photo,
 * saving must fail explicitly when Blob is unavailable instead of silently
 * publishing a point without the photo they expected to attach.
 */
async function uploadPhoto(photo: ValidFieldPhoto): Promise<UploadedPhoto> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, error: "photo-storage-unavailable" };
  }
  try {
    const { url } = await put(`field-photos/${randomUUID()}.${photo.extension}`, photo.bytes, {
      access: "public",
      addRandomSuffix: false,
      contentType: photo.contentType,
    });
    return { ok: true, url };
  } catch {
    return { ok: false, error: "photo-storage-unavailable" };
  }
}

// The fixed set the /collect picker can emit (kept in sync with the
// picker UI + AMENITY_KIND_TO_CAT + the fieldAmenities loader).
const KINDS = new Set([
  "trash", "recycling", "water", "bench",
  "dog_waste", "dog_water", "outlet", "ev_charging", "restroom", "other",
]);

/** Constant-time digest comparison. A missing passcode keeps writes closed. */
function passcodeOk(supplied: unknown): boolean {
  const expected = process.env.COLLECT_PASSCODE;
  if (!expected) return false;
  if (typeof supplied !== "string" || supplied.length === 0) return false;
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

type MutationBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/** Apply origin, abuse, size, shape, and authentication checks in that order. */
async function readMutationBody(req: NextRequest): Promise<MutationBodyResult> {
  if (!isSameOriginMutationRequest(req)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "forbidden-origin" },
        { status: 403, headers: noStore() },
      ),
    };
  }

  // This runs before reading a multi-megabyte body or touching Blob/Postgres.
  if (
    await isRateLimited(
      req,
      "collect-write",
      COLLECT_RATE_LIMIT,
      COLLECT_RATE_WINDOW_SECONDS,
    )
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate-limited" },
        {
          status: 429,
          headers: {
            ...noStore(),
            "Retry-After": String(COLLECT_RATE_WINDOW_SECONDS),
          },
        },
      ),
    };
  }

  const rawBody = await readJsonBodyWithLimit(req, MAX_COLLECT_BODY_BYTES);
  if (!rawBody.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: rawBody.error },
        {
          status: rawBody.error === "body-too-large" ? 413 : 400,
          headers: noStore(),
        },
      ),
    };
  }
  if (typeof rawBody.value !== "object" || rawBody.value === null || Array.isArray(rawBody.value)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "invalid-body" },
        { status: 400, headers: noStore() },
      ),
    };
  }

  const body = rawBody.value as Record<string, unknown>;
  if (!passcodeOk(body.passcode)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "bad-passcode" },
        { status: 401, headers: noStore() },
      ),
    };
  }
  return { ok: true, body };
}

function invalidPhotoResponse(photo: Extract<ParsedFieldPhoto, { status: "invalid" }>) {
  return NextResponse.json(
    { error: photo.error },
    { status: photo.error === "photo-too-large" ? 413 : 400, headers: noStore() },
  );
}

function storageUnavailableResponse() {
  return NextResponse.json(
    { error: "photo-storage-unavailable" },
    { status: 503, headers: noStore() },
  );
}

function matchingPhotoCondition(photoUrl: string | null) {
  return photoUrl === null
    ? isNull(field_amenities.photo_url)
    : eq(field_amenities.photo_url, photoUrl);
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
  const mutation = await readMutationBody(req);
  if (!mutation.ok) return mutation.response;
  const { body } = mutation;

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

  const parsedPhoto = parseFieldPhotoDataUrl(body.photo);
  if (parsedPhoto.status === "invalid") return invalidPhotoResponse(parsedPhoto);

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "database-unavailable" },
      { status: 503, headers: noStore() },
    );
  }

  let photo_url: string | null = null;
  if (parsedPhoto.status === "valid") {
    const uploaded = await uploadPhoto(parsedPhoto);
    if (!uploaded.ok) return storageUnavailableResponse();
    photo_url = uploaded.url;
  }

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
    // Blob and Postgres cannot share a transaction. If the insert loses the
    // race or fails, compensate immediately so the public upload is not left
    // unreferenced.
    if (photo_url) await deleteFieldPhoto(photo_url);
    return NextResponse.json({ error: "insert-failed" }, { status: 500, headers: noStore() });
  }
}

/** Validate the shared id shape used by PATCH/DELETE. The /collect client
 *  works with the bare DB uuid (GET returns `id`), so accept that. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest) {
  const mutation = await readMutationBody(req);
  if (!mutation.ok) return mutation.response;
  const { body } = mutation;

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

  const parsedPhoto = parseFieldPhotoDataUrl(body.photo);
  if (parsedPhoto.status === "invalid") return invalidPhotoResponse(parsedPhoto);
  if (Object.keys(patch).length === 0 && parsedPhoto.status === "absent") {
    return NextResponse.json({ ok: true, unchanged: true }, { headers: noStore() });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
  }

  let previousPhoto: string | null | undefined;
  let uploadedPhoto: string | null = null;
  if (parsedPhoto.status === "valid") {
    try {
      const [existing] = await db
        .select({ photo_url: field_amenities.photo_url })
        .from(field_amenities)
        .where(eq(field_amenities.id, id))
        .limit(1);
      if (!existing) {
        return NextResponse.json({ error: "not-found" }, { status: 404, headers: noStore() });
      }
      previousPhoto = existing.photo_url;
    } catch {
      return NextResponse.json({ error: "lookup-failed" }, { status: 500, headers: noStore() });
    }

    const uploaded = await uploadPhoto(parsedPhoto);
    if (!uploaded.ok) return storageUnavailableResponse();
    uploadedPhoto = uploaded.url;
    patch.photo_url = uploaded.url;
  }

  try {
    const condition =
      previousPhoto === undefined
        ? eq(field_amenities.id, id)
        : and(eq(field_amenities.id, id), matchingPhotoCondition(previousPhoto));
    const rows = await db
      .update(field_amenities)
      .set(patch)
      .where(condition)
      .returning({ id: field_amenities.id });
    if (rows.length === 0) {
      if (uploadedPhoto) await deleteFieldPhoto(uploadedPhoto);
      return NextResponse.json(
        { error: previousPhoto === undefined ? "not-found" : "conflict-retry" },
        { status: previousPhoto === undefined ? 404 : 409, headers: noStore() },
      );
    }

    let previousPhotoCleanupFailed = false;
    if (uploadedPhoto && previousPhoto !== undefined && previousPhoto !== uploadedPhoto) {
      previousPhotoCleanupFailed = !(await deleteFieldPhoto(previousPhoto));
      if (previousPhotoCleanupFailed) {
        console.warn("[field-photos] replacement saved but previous Blob cleanup failed");
      }
    }
    return NextResponse.json(
      {
        ok: true,
        id,
        ...(uploadedPhoto ? { photo_url: uploadedPhoto } : {}),
        ...(previousPhotoCleanupFailed ? { photo_cleanup_failed: true } : {}),
      },
      { headers: noStore() },
    );
  } catch {
    if (uploadedPhoto) await deleteFieldPhoto(uploadedPhoto);
    return NextResponse.json({ error: "update-failed" }, { status: 500, headers: noStore() });
  }
}

export async function DELETE(req: NextRequest) {
  const mutation = await readMutationBody(req);
  if (!mutation.ok) return mutation.response;
  const { body } = mutation;

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "invalid-id" }, { status: 400, headers: noStore() });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
  }

  let previousPhoto: string | null;
  try {
    const [existing] = await db
      .select({ photo_url: field_amenities.photo_url })
      .from(field_amenities)
      .where(eq(field_amenities.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "not-found" }, { status: 404, headers: noStore() });
    }
    previousPhoto = existing.photo_url;
  } catch {
    return NextResponse.json({ error: "lookup-failed" }, { status: 500, headers: noStore() });
  }

  let deleteCondition = and(
    eq(field_amenities.id, id),
    matchingPhotoCondition(previousPhoto),
  );

  if (isManagedFieldPhoto(previousPhoto)) {
    // Delete the Blob first. If that fails, keep the row and URL so the same
    // DELETE can safely retry instead of creating an untracked public image.
    if (!(await deleteFieldPhoto(previousPhoto))) {
      return NextResponse.json(
        { error: "photo-cleanup-failed" },
        { status: 503, headers: noStore() },
      );
    }

    try {
      const cleared = await db
        .update(field_amenities)
        .set({ photo_url: null })
        .where(deleteCondition)
        .returning({ id: field_amenities.id });
      if (cleared.length === 0) {
        return NextResponse.json(
          { error: "conflict-retry" },
          { status: 409, headers: noStore() },
        );
      }
      // If the final delete fails, the surviving row no longer points at a
      // deleted Blob; a retry can remove the now-photo-less row cleanly.
      deleteCondition = and(
        eq(field_amenities.id, id),
        isNull(field_amenities.photo_url),
      );
    } catch {
      return NextResponse.json(
        { error: "photo-state-cleanup-failed" },
        { status: 500, headers: noStore() },
      );
    }
  }

  try {
    const rows = await db
      .delete(field_amenities)
      .where(deleteCondition)
      .returning({ id: field_amenities.id });
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "conflict-retry" },
        { status: 409, headers: noStore() },
      );
    }
    return NextResponse.json({ ok: true, id }, { headers: noStore() });
  } catch {
    return NextResponse.json({ error: "delete-failed" }, { status: 500, headers: noStore() });
  }
}

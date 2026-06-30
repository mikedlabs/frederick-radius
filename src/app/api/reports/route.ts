/**
 * /api/reports — submit + read the community layer (Phase 1).
 *
 *   GET  → { count, items } approved, not-expired reports (map + board).
 *   POST { category, subtype?, title?, note?, photo?, lng, lat, municipality?,
 *          reportedBy?, passcode? }
 *        → submit a report. A valid COLLECT_PASSCODE (trusted) publishes
 *          immediately (status='approved'); everyone else queues 'pending' for
 *          /admin review. Open to any (beta-gated) visitor — no passcode needed
 *          to submit, only to skip the queue.
 *
 * Spam controls: free text is sanitized + screened (links/shouting/repetition
 * rejected at submit), hazards require a photo, coords are county-locked, and
 * every report carries a category TTL so the map self-cleans. Writes go through
 * the server postgres role (bypasses RLS).
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db/client";
import { community_reports } from "@/lib/db/schema";
import { isInFrederickCounty } from "@/components/map/constants";
import {
  REPORT_CATEGORY_BY_KEY,
  isReportCategory,
  isValidSubtype,
} from "@/lib/reports/categories";
import { statusForSubmission, expiresAtFor, sanitizeText, textSpamConcern } from "@/lib/reports/logic";
import { getCommunityReports } from "@/lib/loaders/communityReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = () => ({ "Cache-Control": "no-store" });
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** A submitter with the shared passcode is "trusted" → instant publish. */
function isTrusted(supplied: unknown): boolean {
  const expected = process.env.COLLECT_PASSCODE;
  if (!expected || typeof supplied !== "string" || supplied.length === 0) return false;
  let diff = supplied.length ^ expected.length;
  for (let i = 0; i < Math.max(supplied.length, expected.length); i++) {
    diff |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

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
    const { url } = await put(`community-reports/${randomUUID()}.${ext}`, buf, {
      access: "public",
      addRandomSuffix: false,
      contentType: m[1],
    });
    return url;
  } catch {
    return null;
  }
}

export async function GET() {
  const items = await getCommunityReports();
  return NextResponse.json({ count: items.length, items }, { headers: noStore() });
}

export async function POST(req: NextRequest) {
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

  const category = typeof body.category === "string" ? body.category : "";
  if (!isReportCategory(category)) {
    return NextResponse.json({ error: "invalid-category" }, { status: 400, headers: noStore() });
  }
  const def = REPORT_CATEGORY_BY_KEY[category];
  const subtype = typeof body.subtype === "string" ? body.subtype : undefined;
  if (!isValidSubtype(category, subtype)) {
    return NextResponse.json({ error: "invalid-subtype" }, { status: 400, headers: noStore() });
  }

  const lng = Number(body.lng);
  const lat = Number(body.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "invalid-coords" }, { status: 400, headers: noStore() });
  }
  if (!isInFrederickCounty(lng, lat)) {
    return NextResponse.json({ error: "out-of-bounds" }, { status: 400, headers: noStore() });
  }

  // Free text — sanitize, then screen for cheap spam vectors.
  const title = sanitizeText(body.title, 80);
  const note = sanitizeText(body.note, 280);
  const concern = textSpamConcern(title) ?? textSpamConcern(note);
  if (concern) {
    return NextResponse.json({ error: `rejected-${concern}` }, { status: 400, headers: noStore() });
  }

  // Tips/notes carry no subtype, so they must say SOMETHING.
  if ((category === "tip" || category === "note") && !title && !note) {
    return NextResponse.json({ error: "need-text" }, { status: 400, headers: noStore() });
  }

  const photo_url = await uploadPhoto(body.photo);
  if (def.photoRequired && !photo_url) {
    return NextResponse.json({ error: "photo-required" }, { status: 400, headers: noStore() });
  }

  const municipality = sanitizeText(body.municipality, 80);
  const reported_by = sanitizeText(body.reportedBy, 60);
  const trusted = isTrusted(body.passcode);
  const status = statusForSubmission(trusted);
  const expires_at = expiresAtFor(category, new Date());

  try {
    const [row] = await db
      .insert(community_reports)
      .values({
        category,
        subtype: subtype ?? undefined,
        title: title ?? undefined,
        note: note ?? undefined,
        photo_url: photo_url ?? undefined,
        municipality: municipality ?? undefined,
        reported_by: reported_by ?? undefined,
        status,
        expires_at,
        lng,
        lat,
      })
      .returning({ id: community_reports.id });
    return NextResponse.json(
      { ok: true, id: row?.id, status, queued: status === "pending" },
      { headers: noStore() },
    );
  } catch {
    return NextResponse.json({ error: "insert-failed" }, { status: 500, headers: noStore() });
  }
}

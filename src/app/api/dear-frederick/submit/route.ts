/**
 * /api/dear-frederick/submit — a member of the public submits a letter scan.
 *
 *   POST { image, signature?, contact?, note? }
 *        → stores the scan in Blob and inserts one PENDING
 *          dear_frederick_submissions row for the owner to review in
 *          /admin/dear-frederick. Nothing is published from here: approval is a
 *          separate owner step, and even an approved letter is transcribed into
 *          the static file by hand, so the public wall stays curated.
 *
 * This endpoint is PUBLIC (anyone may send a letter, no token), so the upload
 * is fully untrusted and the guards run in the same fail-closed order as
 * /api/collect and /api/food-trucks/claim: same-origin only, per-IP rate limit,
 * a hard body-size cap read before any Blob/Postgres work, then strict image
 * validation (declared MIME must match the file signature, canonical base64,
 * a size ceiling, and a best-effort max-dimension guard). It FAILS CLOSED with
 * 503 when the database or Blob storage is not configured, so a misconfigured
 * deploy can never silently accept a submission it cannot store. The anon key
 * can never read these rows back (RLS deny-all): a submission may carry the
 * sender's private contact details.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db/client";
import { dear_frederick_submissions } from "@/lib/db/schema";
import {
  deleteLetterScan,
  parseLetterScanDataUrl,
  type ParsedLetterScan,
} from "@/lib/dear-frederick/letter-scan";
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

// The scan decodes to at most 4 MiB (~5.34 MiB as base64); this leaves room for
// its data-URL prefix and the short text fields while bounding retained JSON.
const MAX_SUBMIT_BODY_BYTES = 8 * 1024 * 1024;
// A public write. A person mailing letters submits rarely; 6/hour per IP bounds
// an abusive uploader's blast radius without ever throttling a real sender.
const SUBMIT_RATE_LIMIT = 6;
const SUBMIT_RATE_WINDOW_SECONDS = 60 * 60;

type ValidLetterScan = Extract<ParsedLetterScan, { status: "valid" }>;
type UploadedScan =
  | { ok: true; url: string }
  | { ok: false; error: "scan-storage-unavailable" };

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Upload a previously signature-checked scan. Fails explicitly when Blob is
 *  unavailable so the route can 503 instead of dropping the sender's letter. */
async function uploadScan(scan: ValidLetterScan): Promise<UploadedScan> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, error: "scan-storage-unavailable" };
  }
  try {
    const { url } = await put(`dear-frederick-scans/${randomUUID()}.${scan.extension}`, scan.bytes, {
      access: "public",
      addRandomSuffix: false,
      contentType: scan.contentType,
    });
    return { ok: true, url };
  } catch {
    return { ok: false, error: "scan-storage-unavailable" };
  }
}

export async function POST(req: NextRequest) {
  // 1. Same-origin: reject a cross-site or header-forged POST outright.
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore() });
  }

  // 2. Rate-limit before reading a multi-megabyte body or touching Blob/Postgres.
  if (await isRateLimited(req, "dear-frederick-submit", SUBMIT_RATE_LIMIT, SUBMIT_RATE_WINDOW_SECONDS)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore(), "Retry-After": String(SUBMIT_RATE_WINDOW_SECONDS) } },
    );
  }

  // 3. Body-size cap: stop reading the moment the ceiling is crossed.
  const rawBody = await readJsonBodyWithLimit(req, MAX_SUBMIT_BODY_BYTES);
  if (!rawBody.ok) {
    return NextResponse.json(
      { error: rawBody.error },
      { status: rawBody.error === "body-too-large" ? 413 : 400, headers: noStore() },
    );
  }
  if (typeof rawBody.value !== "object" || rawBody.value === null || Array.isArray(rawBody.value)) {
    return NextResponse.json({ error: "invalid-body" }, { status: 400, headers: noStore() });
  }
  const body = rawBody.value as Record<string, unknown>;

  // 4. Image validation: the scan is required and must be a genuine image.
  const scan = parseLetterScanDataUrl(body.image);
  if (scan.status === "absent") {
    return NextResponse.json({ error: "scan-required" }, { status: 400, headers: noStore() });
  }
  if (scan.status === "invalid") {
    return NextResponse.json(
      { error: scan.error },
      { status: scan.error === "scan-too-large" ? 413 : 400, headers: noStore() },
    );
  }

  const signature = clip(body.signature, 120);
  const contact = clip(body.contact, 200);
  const note = clip(body.note, 4000);

  // 5. Fail closed: no database means we cannot record the submission.
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
  }

  // 6. Fail closed: no Blob means we cannot store the scan (the whole point).
  const uploaded = await uploadScan(scan);
  if (!uploaded.ok) {
    return NextResponse.json({ error: "scan-storage-unavailable" }, { status: 503, headers: noStore() });
  }

  try {
    await db.insert(dear_frederick_submissions).values({
      image_url: uploaded.url,
      signature: signature ?? undefined,
      contact: contact ?? undefined,
      note: note ?? undefined,
    });
    return NextResponse.json({ ok: true }, { headers: noStore() });
  } catch {
    // Blob and Postgres cannot share a transaction. If the insert fails,
    // compensate so the public upload is not left unreferenced.
    await deleteLetterScan(uploaded.url);
    return NextResponse.json({ error: "insert-failed" }, { status: 500, headers: noStore() });
  }
}

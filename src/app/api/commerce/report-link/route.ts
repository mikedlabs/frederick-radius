/**
 * /api/commerce/report-link — report a broken restaurant commerce link.
 *
 *   POST { placeSlug, placeName?, linkRef?, url?, provider?, linkType?, note? }
 *
 * Unauthenticated + fail-soft, like /api/saved. Writes to commerce_link_reports
 * (a plain queue, NOT community_reports — a broken link is place metadata, not a
 * map pin). If the table isn't migrated or the DB is absent, it degrades to a
 * benign ok:false so the UI can still say "thanks" without a hard error.
 *
 * No live provider calls, no scraping — this only records that a human flagged a
 * link so it can be reviewed and re-verified later.
 */
import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getDb } from "@/lib/db/client";
import { commerce_link_reports } from "@/lib/db/schema";
import { parseCommerceLinkReport } from "@/lib/commerce/report-link";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_REPORT_BYTES = 4 * 1024;

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore });
  }
  if (await isRateLimited(req, "commerce-report-link", 12, 60 * 60)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore, "Retry-After": "3600" } },
    );
  }
  if (req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "unsupported-media-type" }, { status: 415, headers: noStore });
  }
  const raw = await readJsonBodyWithLimit(req, MAX_REPORT_BYTES);
  if (!raw.ok) {
    return NextResponse.json(
      { error: raw.error },
      { status: raw.error === "body-too-large" ? 413 : 400, headers: noStore },
    );
  }
  const values = parseCommerceLinkReport(raw.value);
  if (!values) {
    return NextResponse.json({ error: "invalid-input" }, { status: 400, headers: noStore });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, db: false }, { headers: noStore });
  try {
    await db.insert(commerce_link_reports).values(values);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    // Fail-soft: the report is best-effort (e.g. the table isn't migrated yet).
    // Capture it so flagged links aren't silently lost while the queue is being
    // set up.
    Sentry.captureException(err, { extra: { where: "commerce/report-link", place_slug: values.place_slug } });
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Trim a string field to a bound, returning undefined for empty/absent. */
function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length === 0 ? undefined : s.slice(0, max);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }

  const place_slug = str(body.placeSlug, 160);
  if (!place_slug) {
    return NextResponse.json({ error: "invalid-input" }, { status: 400, headers: noStore });
  }
  const url = str(body.url, 1024);
  const link_ref = str(body.linkRef, 256) ?? url;
  const values = {
    place_slug,
    place_name: str(body.placeName, 200) ?? null,
    link_ref: link_ref ?? null,
    url: url ?? null,
    provider: str(body.provider, 40) ?? null,
    link_type: str(body.linkType, 40) ?? null,
    issue_type: "broken_link",
    note: str(body.note, 280) ?? null,
  };

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, db: false }, { headers: noStore });
  try {
    await db.insert(commerce_link_reports).values(values);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    // Fail-soft: the report is best-effort (e.g. the table isn't migrated yet).
    // Capture it so flagged links aren't silently lost while the queue is being
    // set up.
    Sentry.captureException(err, { extra: { where: "commerce/report-link", place_slug } });
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}

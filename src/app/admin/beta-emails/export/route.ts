/**
 * GET /admin/beta-emails/export — the launch list as a CSV download.
 *
 * Lives under /admin/ ON PURPOSE: the middleware Basic-Auth gate (ADMIN_USER /
 * ADMIN_PASSWORD, fail-closed) covers the whole /admin/* tree, so this export is
 * owner-only without a second auth check here. An /api/... route would NOT be
 * gated (the beta wall exempts /api), so it must stay on this path.
 *
 * Fail-soft: no DB, or the table not migrated, returns an empty CSV (just the
 * header) rather than a 500 — the same posture as the capture endpoint.
 */
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_emails } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC-4180-ish cell: wrap in quotes, double any embedded quotes. */
function cell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET() {
  const header = "email,source,signed_up_at\n";
  const db = getDb();
  let rows: { email: string; source: string | null; created_at: Date | null }[] = [];
  if (db) {
    try {
      rows = await db
        .select({ email: beta_emails.email, source: beta_emails.source, created_at: beta_emails.created_at })
        .from(beta_emails)
        .orderBy(desc(beta_emails.created_at));
    } catch {
      // table not migrated / transient DB error — degrade to header-only
    }
  }
  const body =
    header +
    rows
      .map((r) => [cell(r.email), cell(r.source ?? ""), cell(r.created_at ? r.created_at.toISOString() : "")].join(","))
      .join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="beta-emails.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

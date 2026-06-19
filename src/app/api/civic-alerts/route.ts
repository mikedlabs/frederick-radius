import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { civicAlerts } from "@/lib/db/schema";
import { getServerUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/business-updates";
import { parseCivicAlertBody } from "@/lib/integrations/civicAlerts";

/**
 * POST /api/civic-alerts — the admin-postable civic-advisory channel.
 *
 * An admin (ADMIN_EMAILS allowlist) posts a hyper-local road work / closure /
 * emergency notice the live feeds don't carry; it persists to civic_alerts and
 * renders in Pulse's "Road work & closures" card until its `expiresAt` passes.
 * Unlike business updates there is no per-place claim path: civic alerts speak
 * for the City/County, so authorship is admin-only, full stop.
 *
 * The parser REQUIRES a future expiresAt, so the self-expiry guarantee holds
 * for every row — there is no way to post an open-ended alert.
 */
export const runtime = "nodejs";

function noStore() {
  return { "Cache-Control": "no-store" };
}

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: noStore() });
  }
  if (!isAdminEmail(user.email, process.env.ADMIN_EMAILS)) {
    return NextResponse.json({ error: "not-authorized" }, { status: 403, headers: noStore() });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore() });
  }

  const parsed = parseCivicAlertBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore() });
  }
  const v = parsed.value;

  const inserted = await db
    .insert(civicAlerts)
    .values({
      title: v.title,
      body: v.body,
      severity: v.severity,
      source: v.source,
      link: v.link,
      starts_at: v.starts_at,
      ends_at: v.ends_at,
      is_active: true,
    })
    .returning({ id: civicAlerts.id });

  return NextResponse.json({ ok: true, id: inserted[0]?.id ?? null }, { headers: noStore() });
}

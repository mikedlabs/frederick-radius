/**
 * /api/saved (critic-1) — device-scoped saved-event registry for reminders.
 *
 *   POST   { slug, endpoint }   record that this device (push endpoint) saved an event
 *   DELETE { slug, endpoint }   remove it
 *
 * Device-keyed and UNAUTHENTICATED by design — it mirrors push_subscriptions,
 * which is device-keyed (the app has no per-user save model; saves are
 * localStorage-local). The client only calls this when the device already has a
 * push subscription, so `endpoint` is a real push-service URL; a bogus endpoint
 * is harmless because the reminder cron only sends to endpoints that JOIN a live
 * push_subscriptions row. Fail-soft: any DB issue returns a benign response so a
 * save is never blocked.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { saved_events } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function parse(body: { slug?: unknown; endpoint?: unknown }) {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  // Bounds: slugs are short; push endpoints are URLs (Apple/FCM endpoints can be
  // ~500 chars, so allow generous headroom) and must look like a URL.
  const okSlug = slug.length > 0 && slug.length <= 160;
  const okEndpoint =
    endpoint.length > 0 && endpoint.length <= 1024 && /^https:\/\//.test(endpoint);
  return { slug, endpoint, ok: okSlug && okEndpoint };
}

export async function POST(req: NextRequest) {
  let body: { slug?: unknown; endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }
  const { slug, endpoint, ok } = parse(body);
  if (!ok) return NextResponse.json({ error: "invalid-input" }, { status: 400, headers: noStore });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, db: false }, { headers: noStore });
  try {
    await db
      .insert(saved_events)
      .values({ endpoint, event_slug: slug })
      .onConflictDoNothing({ target: [saved_events.endpoint, saved_events.event_slug] });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    // Fail-soft: the localStorage save already succeeded client-side; the
    // reminder registry is best-effort (e.g. the table isn't migrated yet).
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}

export async function DELETE(req: NextRequest) {
  let body: { slug?: unknown; endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }
  const { slug, endpoint, ok } = parse(body);
  if (!ok) return NextResponse.json({ error: "invalid-input" }, { status: 400, headers: noStore });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, db: false }, { headers: noStore });
  try {
    await db
      .delete(saved_events)
      .where(and(eq(saved_events.endpoint, endpoint), eq(saved_events.event_slug, slug)));
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}

/**
 * Saved-event reminders (critic-1) — the "one hour before something you saved
 * starts" push that the app advertises but never sent.
 *
 * GATED: does nothing unless SAVED_REMINDERS_ENABLED === "1". It ships OFF so
 * the feature is safe to land inert — no reminder can reach a real user until
 * the flag is set in the Vercel env AND verified on prod (the saved_events table
 * must be migrated and populated by /api/saved first).
 *
 * DEVICE-SCOPED, not broadcast: unlike fanoutToTopic (which sends to every
 * subscriber of a topic), this joins saved_events → push_subscriptions and sends
 * to exactly the device that saved the event. push_log gives per-(device,event)
 * dedupe so the reminder fires once even though the ~25-min window overlaps
 * several 10-min cron runs.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { verifyCronAuth } from "../../ingest/_auth";
import { getDb, getSql } from "@/lib/db/client";
import { push_log, push_subscriptions, saved_events } from "@/lib/db/schema";
import { sendPush, configurePush } from "@/lib/push";
import { getEventBySlug } from "@/lib/loaders/events";
import { getLiveCardEventBySlug } from "@/lib/loaders/liveEvents";
import { getIngestedCardBySlug } from "@/lib/loaders/ingestedEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fire ~an hour ahead. The window (25 min) is wider than the 10-min cron
// interval so an event can't slip between two runs; dedupe makes the overlap
// safe (one reminder per device per event).
const LEAD_MIN_MS = 50 * 60_000;
const LEAD_MAX_MS = 75 * 60_000;

type Resolved = { title: string; startsAt: string } | null;

/** Resolve a saved slug to its title + start, in the same order /events/[slug]
 *  uses: curated seed (sync) → cached live feed → cached ingested. Fail-soft. */
async function resolveEvent(slug: string): Promise<Resolved> {
  const seed = getEventBySlug(slug);
  if (seed?.starts_at) return { title: seed.title, startsAt: seed.starts_at };
  try {
    const live = await getLiveCardEventBySlug(slug);
    if (live?.starts_at) return { title: live.title, startsAt: live.starts_at };
  } catch {
    /* fall through */
  }
  try {
    const ing = await getIngestedCardBySlug(slug);
    if (ing?.starts_at) return { title: ing.title, startsAt: ing.starts_at };
  } catch {
    /* fall through */
  }
  return null;
}

/** Bounded per-(event, device) dedupe key for push_log (endpoints are long). */
function dedupeKey(slug: string, endpoint: string): string {
  const h = createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
  return `${slug}:${h}`;
}

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (process.env.SAVED_REMINDERS_ENABLED !== "1") {
    return NextResponse.json({ enabled: false });
  }

  const db = getDb();
  const sql = getSql();
  if (!db || !sql) {
    return NextResponse.json({ enabled: true, error: "no-database" }, { status: 503 });
  }
  if (!configurePush()) {
    return NextResponse.json({ enabled: true, sent: 0, note: "Push notifications are not configured." });
  }

  // Every saved event that belongs to a device with a LIVE push subscription.
  const rows = (await sql`
    SELECT se.event_slug, se.endpoint, ps.p256dh, ps.auth
    FROM saved_events se
    JOIN push_subscriptions ps ON ps.endpoint = se.endpoint
  `) as unknown as Array<{
    event_slug: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;

  const now = Date.now();
  const startCache = new Map<string, Resolved>();
  let sent = 0;
  let gone = 0;
  let inWindow = 0;

  for (const row of rows) {
    let ev = startCache.get(row.event_slug);
    if (ev === undefined) {
      ev = await resolveEvent(row.event_slug);
      startCache.set(row.event_slug, ev);
    }
    if (!ev) continue;
    const lead = new Date(ev.startsAt).getTime() - now;
    if (lead < LEAD_MIN_MS || lead > LEAD_MAX_MS) continue;
    inWindow++;

    // Claim the (device, event) dedupe slot; only send if THIS insert created it.
    let claimed = false;
    try {
      const claim = await db
        .insert(push_log)
        .values({
          topic: "saved-events",
          dedupe_key: dedupeKey(row.event_slug, row.endpoint),
          title: ev.title,
          url: `/events/${row.event_slug}`,
        })
        .onConflictDoNothing({ target: [push_log.topic, push_log.dedupe_key] })
        .returning({ id: push_log.id });
      claimed = claim.length > 0;
    } catch {
      claimed = false;
    }
    if (!claimed) continue;

    try {
      await sendPush(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        {
          title: "Starting soon",
          body: `${ev.title} starts in about an hour.`,
          url: `/events/${row.event_slug}`,
          tag: `saved:${row.event_slug}`,
        },
      );
      sent++;
    } catch (err) {
      if (err instanceof Error && err.message === "subscription_gone") {
        gone++;
        // Dead device: drop its subscription AND its saved-event rows so we
        // never retry it (matches fanoutToTopic's gone-subscription pruning).
        try {
          await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, row.endpoint));
        } catch {
          /* best-effort */
        }
        try {
          await db.delete(saved_events).where(eq(saved_events.endpoint, row.endpoint));
        } catch {
          /* best-effort */
        }
      }
    }
  }

  return NextResponse.json({ enabled: true, candidates: rows.length, inWindow, sent, gone });
}

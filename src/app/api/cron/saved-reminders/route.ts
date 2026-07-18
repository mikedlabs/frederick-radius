/**
 * Saved-event reminders (critic-1) — the "one hour before something you saved
 * starts" push that the app advertises but never sent.
 *
 * Also the plans-changed watcher: when a saved upcoming event flips to
 * cancelled/postponed (feed status or the owner's event-notices override),
 * the devices that saved it get one "Plans changed" push instead of a
 * now-wrong "starting soon" reminder. Decision logic is pure and tested in
 * lib/saved-cancellations.
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
import { noticeForEvent } from "@/lib/events/notices";
import { cancellationPush, effectiveEventStatus } from "@/lib/saved-cancellations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fire ~an hour ahead. The window (25 min) is wider than the 10-min cron
// interval so an event can't slip between two runs; dedupe makes the overlap
// safe (one reminder per device per event).
const LEAD_MIN_MS = 50 * 60_000;
const LEAD_MAX_MS = 75 * 60_000;

type Resolved = { title: string; startsAt: string; status?: string } | null;

/** Resolve a saved slug to its title + start + status, in the same order
 *  /events/[slug] uses: curated seed (sync) → cached live feed → cached
 *  ingested. Fail-soft. Status rides along so the cancellation pass and the
 *  reminder gate read the same claim the event page shows. */
async function resolveEvent(slug: string): Promise<Resolved> {
  const seed = getEventBySlug(slug);
  if (seed?.starts_at) return { title: seed.title, startsAt: seed.starts_at, status: seed.status };
  try {
    const live = await getLiveCardEventBySlug(slug);
    if (live?.starts_at) return { title: live.title, startsAt: live.starts_at, status: live.status };
  } catch {
    /* fall through */
  }
  try {
    const ing = await getIngestedCardBySlug(slug);
    if (ing?.starts_at) return { title: ing.title, startsAt: ing.starts_at, status: ing.status };
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
  const nowDate = new Date(now);
  const startCache = new Map<string, Resolved>();
  let sent = 0;
  let gone = 0;
  let inWindow = 0;
  let cancelSent = 0;

  // Shared dedupe-claim + send. push_log's (topic, dedupe_key) uniqueness is
  // the "exactly once per device per event" guarantee for BOTH message kinds.
  const claimAndSend = async (
    row: (typeof rows)[number],
    topic: string,
    key: string,
    msg: { title: string; body: string; tag: string },
  ): Promise<boolean> => {
    let claimed = false;
    try {
      const claim = await db
        .insert(push_log)
        .values({
          topic,
          dedupe_key: key,
          title: msg.title,
          url: `/events/${row.event_slug}`,
        })
        .onConflictDoNothing({ target: [push_log.topic, push_log.dedupe_key] })
        .returning({ id: push_log.id });
      claimed = claim.length > 0;
    } catch {
      claimed = false;
    }
    if (!claimed) return false;

    try {
      await sendPush(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        { ...msg, url: `/events/${row.event_slug}` },
      );
      return true;
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
      return false;
    }
  };

  for (const row of rows) {
    let ev = startCache.get(row.event_slug);
    if (ev === undefined) {
      ev = await resolveEvent(row.event_slug);
      startCache.set(row.event_slug, ev);
    }
    if (!ev) continue;

    // Plans-changed pass: the event this device saved got cancelled or
    // postponed (feed status, or the owner's event-notices override). The
    // status is part of the dedupe key so postponed → cancelled re-alerts.
    const noticeStatus = noticeForEvent(row.event_slug, nowDate)?.status;
    const change = cancellationPush(ev, noticeStatus, nowDate);
    if (change) {
      const ok = await claimAndSend(
        row,
        "saved-cancelled",
        `${change.status}:${dedupeKey(row.event_slug, row.endpoint)}`,
        { title: change.title, body: change.body, tag: `cancelled:${row.event_slug}` },
      );
      if (ok) cancelSent++;
      // A dead event gets no "starting soon" nudge — the reminder below
      // would contradict the alert we just decided to send.
      continue;
    }
    const status = effectiveEventStatus(ev.status, noticeStatus);
    if (status === "cancelled" || status === "postponed") continue;

    const lead = new Date(ev.startsAt).getTime() - now;
    if (lead < LEAD_MIN_MS || lead > LEAD_MAX_MS) continue;
    inWindow++;

    const ok = await claimAndSend(row, "saved-events", dedupeKey(row.event_slug, row.endpoint), {
      title: "Starting soon",
      body: `${ev.title} starts in about an hour.`,
      tag: `saved:${row.event_slug}`,
    });
    if (ok) sent++;
  }

  return NextResponse.json({ enabled: true, candidates: rows.length, inWindow, sent, cancelSent, gone });
}

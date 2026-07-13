import "server-only";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, getSql } from "@/lib/db/client";
import { push_subscriptions, push_log } from "@/lib/db/schema";
import { sendPush, configurePush } from "@/lib/push";
import { shouldDeliver } from "@/lib/push-delivery";
import type { PushPayload } from "@/lib/push";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { PLACE_BY_SLUG } from "@/data/places";

/**
 * Owner broadcast — the compose-and-send layer behind /admin/notify. It turns
 * the topic-only fan-out into a real product: pick an AUDIENCE (everyone, a
 * topic, a town, or the followers of one place), see the reach, and send one
 * ad-hoc push. Every send still routes through the shared delivery gate
 * (push-delivery), so a broadcast honors each device's quiet hours unless the
 * owner marks it urgent.
 */

export type Segment =
  | { kind: "all" }
  | { kind: "topic"; value: string }
  | { kind: "town"; value: string }
  | { kind: "biz"; value: string };

/** Parse the single form value ("all" | "topic:specials" | "town:frederick" |
 *  "biz:sky-stage") back into a Segment. Returns null if malformed. */
export function parseSegment(raw: string): Segment | null {
  if (raw === "all") return { kind: "all" };
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const kind = raw.slice(0, i);
  const value = raw.slice(i + 1);
  if (!value) return null;
  if (kind === "topic" || kind === "town" || kind === "biz") return { kind, value };
  return null;
}

/** A human label for a segment, for confirmations + the history log. */
export function segmentLabel(seg: Segment): string {
  switch (seg.kind) {
    case "all":
      return "Everyone";
    case "topic":
      return `Topic: ${seg.value}`;
    case "town":
      return `Town: ${MUNICIPALITY_BY_SLUG[seg.value]?.name ?? seg.value}`;
    case "biz":
      return `Followers of ${PLACE_BY_SLUG[seg.value]?.name ?? seg.value}`;
  }
}

function whereFor(seg: Segment) {
  switch (seg.kind) {
    case "all":
      return sql`true`;
    case "topic":
      return sql`${push_subscriptions.topics} ? ${seg.value}`;
    case "town":
      return sql`${push_subscriptions.home_town} = ${seg.value}`;
    case "biz":
      return sql`${push_subscriptions.topics} ? ${`biz:${seg.value}`}`;
  }
}

export async function countAudience(seg: Segment): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(push_subscriptions)
    .where(whereFor(seg));
  return rows[0]?.n ?? 0;
}

export type AudienceOption = { value: string; label: string; count: number };

/**
 * The viable segments to offer the owner, each with its live reach. Only
 * segments with at least one subscriber are listed (besides Everyone), so the
 * picker never shows a dead audience. Sequential queries (Supavisor max:1).
 */
export async function audienceOptions(): Promise<AudienceOption[]> {
  const db = getDb();
  if (!db) return [];
  const opts: AudienceOption[] = [];

  const total = (await db.select({ n: sql<number>`count(*)::int` }).from(push_subscriptions))[0]?.n ?? 0;
  opts.push({ value: "all", label: `Everyone`, count: total });

  // Per fixed topic.
  const FIXED = ["civic-alerts", "saved-events", "daily-briefing", "specials", "parking", "golden-hour"];
  for (const t of FIXED) {
    const n = (await db.select({ n: sql<number>`count(*)::int` }).from(push_subscriptions).where(sql`${push_subscriptions.topics} ? ${t}`))[0]?.n ?? 0;
    if (n > 0) opts.push({ value: `topic:${t}`, label: `Opted into ${t}`, count: n });
  }

  // Town + followed-place group-bys use raw SQL (jsonb array expansion is
  // awkward in the query builder). Same pooled connection, still sequential.
  const raw = getSql();
  if (raw) {
    // Per home town (populated once the settings card captures it).
    const towns = (await raw`
      SELECT home_town AS slug, count(*)::int AS n FROM push_subscriptions
      WHERE home_town IS NOT NULL GROUP BY home_town ORDER BY n DESC
    `) as Array<{ slug: string; n: number }>;
    for (const row of towns) {
      opts.push({ value: `town:${row.slug}`, label: `Town: ${MUNICIPALITY_BY_SLUG[row.slug]?.name ?? row.slug}`, count: Number(row.n) });
    }

    // Per followed place (biz:<slug> topics).
    const biz = (await raw`
      SELECT elem AS topic, count(*)::int AS n
      FROM push_subscriptions, jsonb_array_elements_text(topics) elem
      WHERE elem LIKE 'biz:%' GROUP BY elem ORDER BY n DESC LIMIT 40
    `) as Array<{ topic: string; n: number }>;
    for (const row of biz) {
      const slug = String(row.topic).slice("biz:".length);
      opts.push({ value: `biz:${slug}`, label: `Followers of ${PLACE_BY_SLUG[slug]?.name ?? slug}`, count: Number(row.n) });
    }
  }

  return opts;
}

export type BroadcastRow = { title: string | null; body: string | null; url: string | null; sent_count: number; sent_at: string };

/** Recent owner broadcasts, newest first — the history panel + reach per send. */
export async function recentBroadcasts(limit = 12): Promise<BroadcastRow[]> {
  const raw = getSql();
  if (!raw) return [];
  return (await raw`
    SELECT title, body, url, sent_count, sent_at
    FROM push_log WHERE topic = 'broadcast' ORDER BY sent_at DESC LIMIT ${limit}
  `) as BroadcastRow[];
}

export type BroadcastResult = { attempted: number; sent: number; gone: number; held: number };

/**
 * Send one ad-hoc broadcast to a segment. Owner-triggered only (the caller is
 * behind Basic Auth). A fresh dedupe key per send means the same message can
 * be re-sent deliberately; the push_log row is the durable history entry.
 */
export async function broadcast(
  seg: Segment,
  payload: PushPayload,
  opts: { urgent?: boolean } = {},
): Promise<BroadcastResult> {
  const db = getDb();
  if (!db || !configurePush()) return { attempted: 0, sent: 0, gone: 0, held: 0 };

  const dedupeKey = `broadcast:${randomUUID()}`;
  const claim = await db
    .insert(push_log)
    .values({ topic: "broadcast", dedupe_key: dedupeKey, title: payload.title, body: payload.body, url: payload.url })
    .onConflictDoNothing({ target: [push_log.topic, push_log.dedupe_key] })
    .returning({ id: push_log.id });
  if (claim.length === 0) return { attempted: 0, sent: 0, gone: 0, held: 0 };

  const rows = await db
    .select({
      endpoint: push_subscriptions.endpoint,
      p256dh: push_subscriptions.p256dh,
      auth: push_subscriptions.auth,
      quiet_start: push_subscriptions.quiet_start,
      quiet_end: push_subscriptions.quiet_end,
    })
    .from(push_subscriptions)
    .where(whereFor(seg));

  const now = new Date();
  let sent = 0;
  let gone = 0;
  let held = 0;
  for (const row of rows) {
    if (!shouldDeliver(row, { urgent: opts.urgent }, now)) {
      held += 1;
      continue;
    }
    try {
      await sendPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
      sent += 1;
    } catch (err) {
      if (err instanceof Error && err.message === "subscription_gone") {
        gone += 1;
        try {
          await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, row.endpoint));
        } catch {}
      }
    }
  }

  if (sent > 0) {
    await db.update(push_log).set({ sent_count: sent }).where(eq(push_log.id, claim[0].id));
  }
  return { attempted: rows.length, sent, gone, held };
}

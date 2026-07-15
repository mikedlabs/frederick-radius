/**
 * Client-safe push topic definitions. Lives outside push.ts so the
 * NotificationsCard (and any other client surface) can import the
 * labels without pulling in the Node-only `web-push` library.
 */
export type PushTopic =
  | "civic-alerts"
  | "saved-events"
  | "daily-briefing"
  | "specials"
  | "parking"
  | "golden-hour";

export const TOPIC_LABELS: Record<PushTopic, { label: string; desc: string }> = {
  "civic-alerts": {
    label: "Civic alerts",
    desc: "NWS warnings, park closures, county incidents",
  },
  "saved-events": {
    label: "Saved event reminders",
    desc: "One hour before something you saved starts",
  },
  "daily-briefing": {
    label: "Daily briefing",
    desc: "What's on today, sent every morning at 8",
  },
  specials: {
    label: "Specials near you",
    desc: "Deals and pop-ups from Frederick County businesses",
  },
  parking: {
    label: "Parking alerts",
    desc: "A heads-up before downtown garages fill, so you can pick another",
  },
  "golden-hour": {
    label: "Golden hour",
    desc: "A heads-up half an hour before the day's best light",
  },
};

/** The golden-hour cron's topic, named so callers don't scatter the string. */
export const GOLDEN_HOUR_TOPIC: PushTopic = "golden-hour";

/**
 * The per-business follow topic for a place slug. Subscriptions store
 * these alongside the fixed topics; the fan-out treats every topic as a
 * plain string, so `biz:<slug>` needs no schema or type change.
 */
export function businessTopic(slug: string): string {
  return `biz:${slug}`;
}

const PUBLIC_FIXED_TOPICS = new Set<string>(Object.keys(TOPIC_LABELS));
const BUSINESS_TOPIC = /^biz:[a-z0-9][a-z0-9_-]{0,159}$/;
const MAX_TOPIC_CHANGES = 24;

export function isPublicFixedPushTopic(topic: unknown): topic is PushTopic {
  return typeof topic === "string" && PUBLIC_FIXED_TOPICS.has(topic);
}

/**
 * Topics a public client is allowed to manage. Keep this as an allowlist:
 * fixed notification preferences plus the per-business topics created by
 * `businessTopic`. Anything else is internal or malformed.
 */
export function isPublicPushTopic(topic: unknown): topic is string {
  return (
    typeof topic === "string" &&
    (isPublicFixedPushTopic(topic) || BUSINESS_TOPIC.test(topic))
  );
}

/** Parse the complete fixed-topic set owned by the notification settings UI. */
export function parsePublicFixedPushTopics(value: unknown): PushTopic[] | null {
  if (!Array.isArray(value) || value.length > PUBLIC_FIXED_TOPICS.size) return null;
  if (!value.every(isPublicFixedPushTopic)) return null;
  return [...new Set(value)];
}

export function publicPushTopics(topics: readonly string[]): string[] {
  return topics.filter(isPublicPushTopic);
}

export type PublicTopicChanges = Readonly<{
  add: string[];
  remove: string[];
}>;

/**
 * Validate an untrusted merge request before it reaches the subscription row.
 * A single reserved or malformed topic rejects the entire change, avoiding a
 * partial update whose result would be difficult for the caller to reason about.
 */
export function parsePublicTopicChanges(
  add: unknown,
  remove: unknown,
): PublicTopicChanges | null {
  const parse = (value: unknown): string[] | null => {
    if (value === undefined) return [];
    if (
      !Array.isArray(value) ||
      value.length > MAX_TOPIC_CHANGES ||
      !value.every(isPublicPushTopic)
    ) {
      return null;
    }
    return [...new Set(value)];
  };

  const parsedAdd = parse(add);
  const parsedRemove = parse(remove);
  if (!parsedAdd || !parsedRemove) return null;
  if (parsedAdd.length + parsedRemove.length > MAX_TOPIC_CHANGES) return null;
  const removed = new Set(parsedRemove);
  if (parsedAdd.some((topic) => removed.has(topic))) return null;

  return { add: parsedAdd, remove: parsedRemove };
}

/** Apply validated public changes while preserving owner/internal topics. */
export function applyPublicTopicChanges(
  currentTopics: readonly string[],
  changes: PublicTopicChanges,
): string[] {
  const next = new Set(currentTopics);
  for (const topic of changes.add) next.add(topic);
  for (const topic of changes.remove) next.delete(topic);
  return [...next];
}

/**
 * The owner's ops-alert topic (new beta feedback, new signups). NOT in
 * TOPIC_LABELS on purpose — it must never render as a user-facing choice,
 * and the public subscribe route strips it so only the Basic-Auth-gated
 * /admin/api/owner-alerts endpoint can grant it. The alert payloads carry
 * feedback text and signup emails, so the gate is load-bearing.
 */
export const OWNER_ALERTS_TOPIC = "owner-alerts";

export function isOwnerTopic(topic: string): boolean {
  return topic === OWNER_ALERTS_TOPIC;
}

/**
 * Client-safe push topic definitions. Lives outside push.ts so the
 * NotificationsCard (and any other client surface) can import the
 * labels without pulling in the Node-only `web-push` library.
 */
export type PushTopic = "civic-alerts" | "saved-events" | "daily-briefing" | "specials";

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
};

/**
 * The per-business follow topic for a place slug. Subscriptions store
 * these alongside the fixed topics; the fan-out treats every topic as a
 * plain string, so `biz:<slug>` needs no schema or type change.
 */
export function businessTopic(slug: string): string {
  return `biz:${slug}`;
}

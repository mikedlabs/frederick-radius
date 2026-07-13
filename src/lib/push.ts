/**
 * Web Push helper — thin wrapper over the `web-push` library so the
 * rest of the app can fire a notification without thinking about
 * VAPID auth, payload encryption, or transport.
 *
 * Gated on env: without VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY +
 * VAPID_SUBJECT, every send is a no-op (returns null). This is the
 * production-safe stance — if the keys aren't configured on Vercel
 * yet, no error is thrown and no payload leaks, the call just
 * silently drops. Dev mode behaves the same; the editor can generate
 * keys with `npm run push:keys`.
 *
 * Topics are strings the rest of the app agrees on:
 *   - "civic-alerts"     NWS/NPS warnings
 *   - "saved-events"     reminders for events the user saved
 *   - "daily-briefing"   8 AM digest
 * Add new topics here as they're invented; the column is jsonb so
 * the database doesn't need a migration to accept them.
 */
import "server-only";
import webpush, { type PushSubscription, type SendResult } from "web-push";

// Re-export the client-safe pieces so server code can import topic
// labels from a single place (`@/lib/push`) without ever leaking the
// `web-push` Node-only dependency to the client bundle.
export { TOPIC_LABELS, type PushTopic } from "./push-topics";

export type PushPayload = {
  title: string;
  body: string;
  /** Absolute or relative URL to open on notification click. */
  url?: string;
  /** Optional client-side tag so re-sends collapse to one notification. */
  tag?: string;
  /** Optional badge URL — small monochrome icon for status bar (Android). */
  badge?: string;
  /** Optional icon URL — the primary notification image. */
  icon?: string;
  /** Open-attribution id (a push_log row id). The service worker pings
   *  /api/push/opened?n=<id> on click so we can count opens per send. */
  n?: string;
};

let _configured = false;

export function configurePush(): boolean {
  if (_configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  webpush.setVapidDetails(subject, pub, priv);
  _configured = true;
  return true;
}

/** Public VAPID key for the browser to call pushManager.subscribe with.
 *  Returns null when env is unset so callers can hide the UI cleanly. */
export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/** Send one notification. Returns null when push is unconfigured or
 *  when the subscription is gone (HTTP 404/410 from the push service). */
export async function sendPush(
  sub: PushSubscription,
  payload: PushPayload,
): Promise<SendResult | null> {
  if (!configurePush()) return null;
  try {
    const res = await webpush.sendNotification(sub, JSON.stringify(payload));
    return res;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Subscription expired or unsubscribed — the caller deletes it.
      throw new Error("subscription_gone");
    }

    console.error("[push] send failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Client-side helpers for the "Follow this business" flow.
 *
 * Wraps the existing Web Push subscription machinery so a place page
 * can call `followBusiness(slug)` / `unfollowBusiness(slug)` without
 * touching the settings card.
 *
 * Persistence:
 *   - localStorage `fr:following:v1` holds the set of followed biz
 *     slugs, so the FollowButton can render the right state without
 *     a round-trip on every page load.
 *   - The authoritative state lives in push_subscriptions.topics on
 *     the server; every follow/unfollow re-syncs via /api/push/topics.
 *
 * Topic naming mirrors the server-side helper in src/lib/push-topics.ts:
 *   businessTopic(slug) → `biz:${slug}`.
 */

const FOLLOWING_KEY = "fr:following:v1";

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getFollowedBizSlugs(): Set<string> {
  const ls = safeStorage();
  if (!ls) return new Set();
  try {
    const raw = ls.getItem(FOLLOWING_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function setFollowedBizSlugs(set: Set<string>): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(FOLLOWING_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage may be full or disabled — fail silent
  }
}

export function isFollowingBiz(slug: string): boolean {
  return getFollowedBizSlugs().has(slug);
}

/** Mirrors server-side `businessTopic` in src/lib/push-topics.ts. */
function businessTopic(slug: string): string {
  return `biz:${slug}`;
}

function uint8FromBase64(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(standard);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type FollowResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unsupported"
        | "server-disabled"
        | "permission-denied"
        | "permission-default"
        | "save-failed"
        | "no-subscription";
    };

export type PushCapability =
  | "unknown"
  | "unsupported"
  | "server-disabled"
  | "blocked"
  | "ready";

/**
 * Detect what we can do right now — does the browser support push,
 * is the server configured, is permission already blocked. The
 * FollowButton uses this to render the right call-to-action without
 * triggering a permission prompt on mount.
 */
export async function detectPushCapability(): Promise<PushCapability> {
  if (typeof window === "undefined") return "unknown";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  try {
    const res = await fetch("/api/push/public-key");
    const json = (await res.json()) as { key?: string; enabled?: boolean };
    if (!json.enabled || !json.key) return "server-disabled";
  } catch {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  return "ready";
}

/**
 * Ensure the browser has an active push subscription. Requests
 * permission if not yet granted; subscribes if not yet subscribed.
 * Returns null if any step fails (caller handles the UX).
 */
async function ensureSubscription(): Promise<PushSubscription | null> {
  const res = await fetch("/api/push/public-key");
  const json = (await res.json()) as { key?: string; enabled?: boolean };
  if (!json.enabled || !json.key) return null;
  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;
  } else if (Notification.permission === "denied") {
    return null;
  }
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Newer TS narrows BufferSource; cast — the value IS one at runtime.
    applicationServerKey: uint8FromBase64(json.key) as BufferSource,
  });
}

/**
 * Persist a NEW subscription to the server with the fixed default
 * topic set. Only called the first time a user opts in via a Follow
 * (the settings card calls /api/push/subscribe directly with its own
 * topic preferences). The biz topic is added separately below.
 */
async function persistInitialSubscription(sub: PushSubscription): Promise<boolean> {
  const body = {
    subscription: sub.toJSON(),
    // Sensible defaults — the settings card can tighten these later.
    topics: ["civic-alerts", "saved-events", "daily-briefing", "specials"],
  };
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function followBusiness(slug: string): Promise<FollowResult> {
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" };
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return { ok: false, reason: "unsupported" };
  }

  // Was the user already subscribed before this call? If not, we'll
  // persist the initial subscription before adding the biz topic.
  const reg = await navigator.serviceWorker.ready;
  const preexisting = await reg.pushManager.getSubscription();

  const sub = await ensureSubscription();
  if (!sub) {
    if (Notification.permission === "denied") return { ok: false, reason: "permission-denied" };
    if (Notification.permission === "default") return { ok: false, reason: "permission-default" };
    return { ok: false, reason: "server-disabled" };
  }

  if (!preexisting) {
    const ok = await persistInitialSubscription(sub);
    if (!ok) return { ok: false, reason: "save-failed" };
  }

  const topic = businessTopic(slug);
  const res = await fetch("/api/push/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, add: [topic] }),
  });
  if (!res.ok) return { ok: false, reason: "save-failed" };

  const followed = getFollowedBizSlugs();
  followed.add(slug);
  setFollowedBizSlugs(followed);
  return { ok: true };
}

export async function unfollowBusiness(slug: string): Promise<FollowResult> {
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" };
  if (!("serviceWorker" in navigator)) return { ok: false, reason: "unsupported" };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  // Always clear the local follow flag, even if the server has no
  // record — the user's intent is clear, and the local UI should
  // reflect it immediately. The server side becomes a no-op then.
  const followed = getFollowedBizSlugs();
  followed.delete(slug);
  setFollowedBizSlugs(followed);

  if (!sub) return { ok: true };

  const topic = businessTopic(slug);
  await fetch("/api/push/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, remove: [topic] }),
  });
  return { ok: true };
}

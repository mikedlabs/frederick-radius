"use client";

/**
 * subscribeDevicePush — the one-call push opt-in, callable from any surface.
 *
 * The full second-session engine (saved-event reminders, follow topics,
 * parking alerts) was gated behind /settings/notifications — three taps deep
 * behind the Explore sheet, a path almost nobody finds, so the machinery ran
 * dark (experience review, nav finding #2). This extracts the subscribe flow
 * so a contextual moment (the first event save) can offer it inline.
 *
 * Mirrors NotificationsCard's subscribe step-for-step (public key →
 * requestPermission → pushManager.subscribe → POST /api/push/subscribe);
 * keep the two in sync if the endpoint contract changes.
 *
 * Never throws. Returns:
 *   "subscribed"  — permission granted and the server has the subscription
 *   "dismissed"   — the user closed the browser prompt without choosing
 *   "denied"      — the user blocked notifications
 *   "unsupported" — no SW/Push/Notification support in this browser
 *   "error"       — key fetch / subscribe / server write failed
 */
export type PushSubscribeResult = "subscribed" | "dismissed" | "denied" | "unsupported" | "error";

function uint8FromBase64(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeDevicePush(topics: string[] = []): Promise<PushSubscribeResult> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  try {
    const keyRes = await fetch("/api/push/public-key");
    const json = (await keyRes.json().catch(() => ({}))) as { key?: string; enabled?: boolean };
    if (!keyRes.ok || !json.enabled || !json.key) return "unsupported"; // server not configured
    const pubKey = json.key;

    const permission = await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "dismissed";

    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: uint8FromBase64(pubKey) as BufferSource,
      }));

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        topics,
        device_id:
          typeof localStorage !== "undefined"
            ? localStorage.getItem("fr-device-id") ?? undefined
            : undefined,
      }),
    });
    return res.ok ? "subscribed" : "error";
  } catch {
    return "error";
  }
}

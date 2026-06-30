"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, AlertCircle, Send } from "lucide-react";
import { TOPIC_LABELS, type PushTopic } from "@/lib/push-topics";

const ALL_TOPICS: PushTopic[] = [
  "civic-alerts",
  "saved-events",
  "daily-briefing",
  "specials",
  "parking",
];

type SupportState =
  | "unknown"
  | "unsupported"
  | "server-disabled"
  | "blocked"
  | "ready"
  | "subscribed";

function uint8FromBase64(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(standard);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function NotificationsCard() {
  const [support, setSupport] = useState<SupportState>("unknown");
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [topics, setTopics] = useState<Set<PushTopic>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Feature detect + load existing subscription on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupport("unsupported");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/push/public-key");
        const json = (await res.json()) as { key?: string; enabled?: boolean };
        if (!json.enabled || !json.key) {
          setSupport("server-disabled");
          return;
        }
        setPubKey(json.key);
        if (Notification.permission === "denied") {
          setSupport("blocked");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setSubscription(existing);
          setSupport("subscribed");
        } else {
          setSupport("ready");
        }
      } catch (err) {

        console.error("[notifications] init failed:", err);
        setSupport("unsupported");
      }
    })();
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const subscribe = useCallback(async () => {
    if (!pubKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "blocked" : "ready");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Newer TS lib narrows BufferSource to ArrayBufferView<ArrayBuffer>
        // and rejects Uint8Array<ArrayBufferLike>. Cast as BufferSource —
        // the value IS one at runtime; the strict generic just rejects it.
        applicationServerKey: uint8FromBase64(pubKey) as BufferSource,
      });
      const body = {
        subscription: sub.toJSON(),
        topics: [...topics],
        device_id:
          typeof localStorage !== "undefined"
            ? localStorage.getItem("fr-device-id") ?? undefined
            : undefined,
      };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        flash("Couldn't save subscription. Try again later.");
        return;
      }
      setSubscription(sub);
      setSupport("subscribed");
      flash("Notifications on.");
    } finally {
      setBusy(false);
    }
  }, [pubKey, topics, flash]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    setBusy(true);
    try {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setSupport("ready");
      flash("Notifications off.");
    } finally {
      setBusy(false);
    }
  }, [subscription, flash]);

  // Persist topic changes when subscribed by re-POSTing the subscription.
  const saveTopics = useCallback(
    async (next: Set<PushTopic>) => {
      if (!subscription) return;
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          topics: [...next],
        }),
      });
    },
    [subscription],
  );

  const toggleTopic = useCallback(
    (t: PushTopic) => {
      setTopics((prev) => {
        const next = new Set(prev);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        void saveTopics(next);
        return next;
      });
    },
    [saveTopics],
  );

  const sendTest = useCallback(async () => {
    if (!subscription) return;
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({ error: "" }))) as { error?: string };
        flash(json.error ? `Send failed: ${json.error}` : "Send failed.");
        return;
      }
      flash("Test sent. Check your notifications.");
    } finally {
      setBusy(false);
    }
  }, [subscription, flash]);

  if (support === "unsupported") {
    return (
      <article className="tactile rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4">
        <header className="flex items-center gap-2">
          <BellOff className="h-4 w-4" style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Notifications
          </h2>
        </header>
        <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Your browser doesn&apos;t support web push notifications. Try
          Safari 16.4+ on iOS, or any recent Chrome / Firefox on desktop.
        </p>
      </article>
    );
  }

  if (support === "server-disabled") {
    return (
      <article className="tactile rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4">
        <header className="flex items-center gap-2">
          <BellOff className="h-4 w-4" style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Notifications
          </h2>
        </header>
        <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Push notifications aren&apos;t enabled on this deployment yet.
          They&apos;ll appear here once VAPID keys are configured.
        </p>
      </article>
    );
  }

  const enabled = support === "subscribed";

  return (
    <article className="tactile rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell
            className="h-4 w-4"
            style={{ color: enabled ? "var(--app-positive)" : "var(--app-ink-3)" }}
            aria-hidden
          />
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Notifications
          </h2>
        </div>
        {support === "blocked" ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "color-mix(in srgb, var(--app-warning) 18%, transparent)", color: "var(--app-warning)" }}
          >
            <AlertCircle className="h-3 w-3" aria-hidden /> Blocked
          </span>
        ) : (
          <button
            type="button"
            onClick={enabled ? unsubscribe : subscribe}
            disabled={busy}
            className="tactile tactile-interactive inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{
              background: enabled ? "var(--app-bg-elevated)" : "var(--app-brand)",
              color: enabled ? "var(--app-ink-2)" : "white",
            }}
          >
            {enabled ? (
              <>
                <BellOff className="h-3 w-3" strokeWidth={2.25} aria-hidden /> Turn off
              </>
            ) : (
              <>
                <Bell className="h-3 w-3" strokeWidth={2.25} aria-hidden /> Turn on
              </>
            )}
          </button>
        )}
      </header>

      <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        {support === "blocked"
          ? "Notifications are blocked at the browser level. Re-enable in your site settings to subscribe."
          : enabled
            ? "Choose what gets through. Your selections save automatically."
            : "One tap to opt in. You'll only get the topics you choose."}
      </p>

      <ul className="mt-4 space-y-2">
        {ALL_TOPICS.map((t) => {
          const info = TOPIC_LABELS[t];
          const on = topics.has(t);
          const disabled = !enabled || busy;
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => toggleTopic(t)}
                disabled={disabled}
                aria-pressed={on}
                className={`flex w-full items-start gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                  disabled ? "opacity-60" : ""
                }`}
                style={{
                  borderColor: on ? "var(--app-brand)" : "var(--app-border)",
                  background: on
                    ? "color-mix(in srgb, var(--app-brand) 8%, var(--app-bg-elevated))"
                    : "var(--app-bg-elevated)",
                }}
              >
                <span
                  aria-hidden
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                  style={{
                    background: on ? "var(--app-brand)" : "var(--app-bg-elevated)",
                    borderColor: on ? "var(--app-brand)" : "var(--app-border)",
                  }}
                >
                  {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[14px] font-semibold leading-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {info.label}
                  </span>
                  <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {info.desc}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {enabled && (
        <button
          type="button"
          onClick={sendTest}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold disabled:opacity-50"
          style={{ color: "var(--app-cool)" }}
        >
          <Send className="h-3 w-3" strokeWidth={2.25} aria-hidden /> Send me a test
        </button>
      )}

      {/* Always-present live region so screen readers announce the toast
          when it appears (a conditionally-mounted region can be missed). */}
      <p
        role="status"
        aria-live="polite"
        className={toast ? "mt-3 rounded-[var(--app-radius-md)] px-3 py-2 text-[12px] font-medium" : "sr-only"}
        style={toast ? { background: "color-mix(in srgb, var(--app-cool) 12%, transparent)", color: "var(--app-cool)" } : undefined}
      >
        {toast}
      </p>
    </article>
  );
}

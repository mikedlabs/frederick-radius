"use client";

import { track } from "@/lib/track";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellOff,
  Check,
  Play,
  Send,
  Smartphone,
} from "lucide-react";
import { TOPIC_LABELS, type PushTopic } from "@/lib/push-topics";
import { isIos, isStandalone } from "@/lib/pwa-display";
import { openReturnBridge } from "@/lib/return-bridge";
import { getHomeMuni } from "@/lib/personalize";
import {
  haptic,
  isPhoneFeedbackEnabled,
  PHONE_FEEDBACK_CHANGE_EVENT,
  PHONE_FEEDBACK_STORAGE_KEY,
  phoneFeedbackSupport,
  setPhoneFeedbackEnabled,
  type PhoneFeedbackSupport,
} from "@/lib/haptics";

const TOPIC_GROUPS: Array<{
  label: string;
  description: string;
  topics: PushTopic[];
}> = [
  {
    label: "Needs attention",
    description: "Changes that can affect your day.",
    topics: ["civic-alerts", "traffic-alerts", "parking"],
  },
  {
    label: "Your plans",
    description: "Reminders connected to things you follow.",
    topics: ["saved-events", "specials"],
  },
  {
    label: "Daily rhythm",
    description: "Optional, predictable check-ins.",
    topics: ["daily-briefing", "golden-hour"],
  },
];

const ALL_TOPICS = TOPIC_GROUPS.flatMap((group) => group.topics);

type SupportState =
  | "unknown"
  | "unsupported"
  | "server-disabled"
  | "ios-needs-install"
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

/** "9 PM" / "12 AM" for the quiet-hours selects. */
function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${period}`;
}

function PhoneFeedbackCard() {
  const [enabled, setEnabled] = useState(true);
  const [support, setSupport] = useState<PhoneFeedbackSupport>("none");
  const [previewState, setPreviewState] = useState<
    "sent" | "unavailable" | null
  >(null);

  useEffect(() => {
    // Device capability and localStorage exist only after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(isPhoneFeedbackEnabled());
    setSupport(phoneFeedbackSupport());

    const onPreferenceChange = (event: Event) => {
      const next = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      setEnabled(
        typeof next === "boolean" ? next : isPhoneFeedbackEnabled(),
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === PHONE_FEEDBACK_STORAGE_KEY) {
        setEnabled(isPhoneFeedbackEnabled());
      }
    };
    window.addEventListener(
      PHONE_FEEDBACK_CHANGE_EVENT,
      onPreferenceChange,
    );
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(
        PHONE_FEEDBACK_CHANGE_EVENT,
        onPreferenceChange,
      );
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    if (!next) haptic("light");
    setPhoneFeedbackEnabled(next);
    setEnabled(next);
    if (next) haptic("success");
    setPreviewState(null);
  }, [enabled]);

  const preview = useCallback(() => {
    setPreviewState(haptic("success") ? "sent" : "unavailable");
    window.setTimeout(() => setPreviewState(null), 1800);
  }, []);

  const unavailable = support === "none";
  const supportCopy =
    support === "vibration"
      ? "Short vibration cues confirm saves, choices, and near-arrival moments."
      : support === "ios-tap"
        ? "Short tap cues confirm actions when your iPhone supports them."
        : "This browser does not expose physical feedback. Visual confirmations still work.";

  return (
    <article
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{
              background:
                "color-mix(in srgb, var(--app-brand) 11%, transparent)",
              color: "var(--app-brand-press)",
            }}
          >
            <Smartphone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              className="text-[15px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              Phone feedback
            </h2>
            <p
              className="mt-0.5 text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              {supportCopy}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled && !unavailable}
          aria-label="Phone feedback"
          onClick={toggle}
          disabled={unavailable}
          className="tap-44 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-45"
          style={{
            background:
              enabled && !unavailable
                ? "var(--app-brand)"
                : "color-mix(in srgb, var(--app-ink) 22%, transparent)",
          }}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
            style={{
              transform:
                enabled && !unavailable
                  ? "translateX(22px)"
                  : "translateX(2px)",
              boxShadow: "var(--app-elev-1)",
            }}
          />
        </button>
      </header>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          This preference is stored only on this device.
        </p>
        {!unavailable && (
          <button
            type="button"
            onClick={preview}
            disabled={!enabled}
            className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold disabled:opacity-45"
            style={{ color: "var(--app-brand-press)" }}
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            {previewState === "sent"
              ? "Feedback sent"
              : previewState === "unavailable"
                ? "No cue detected"
                : "Try feedback"}
          </button>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {previewState === "sent"
          ? "The phone feedback cue was sent."
          : previewState === "unavailable"
            ? "This browser did not accept the phone feedback cue."
            : ""}
      </p>
    </article>
  );
}

function PushNotificationsCard() {
  const [support, setSupport] = useState<SupportState>("unknown");
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [topics, setTopics] = useState<Set<PushTopic>>(new Set());
  // Eastern-time quiet window; null/null = off. Non-urgent pushes are held
  // during it (civic alerts always come through). Hydrated from the server.
  const [quietStart, setQuietStart] = useState<number | null>(null);
  const [quietEnd, setQuietEnd] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
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
        // iOS Web Push only works in an INSTALLED (standalone) PWA. In a
        // Safari tab the APIs are present but no-op, so a "Turn on" button
        // would silently fail — guide the user to Add to Home Screen first.
        if (isIos() && !isStandalone()) {
          setSupport("ios-needs-install");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setSubscription(existing);
          setSupport("subscribed");
          // Hydrate the toggles from the server so a returning subscriber
          // sees their REAL selections, not all-off (a stale empty UI would,
          // on the next toggle, REPLACE the server set and wipe their topics).
          try {
            const tRes = await fetch(`/api/push/topics?endpoint=${encodeURIComponent(existing.endpoint)}`);
            if (tRes.ok) {
              const tj = (await tRes.json()) as { topics?: string[] };
              if (Array.isArray(tj.topics)) {
                setTopics(new Set(tj.topics.filter((t): t is PushTopic => (ALL_TOPICS as string[]).includes(t))));
              }
            }
          } catch { /* leave toggles as-seeded */ }
          // Hydrate quiet hours so a returning subscriber sees their window.
          try {
            const pRes = await fetch(`/api/push/prefs?endpoint=${encodeURIComponent(existing.endpoint)}`);
            if (pRes.ok) {
              const pj = (await pRes.json()) as { quiet_start?: number | null; quiet_end?: number | null };
              setQuietStart(typeof pj.quiet_start === "number" ? pj.quiet_start : null);
              setQuietEnd(typeof pj.quiet_end === "number" ? pj.quiet_end : null);
            }
          } catch { /* leave quiet hours off */ }
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
        // "default" = the user dismissed the prompt without choosing. Say so,
        // rather than silently snapping back to the Turn-on button.
        if (permission === "default") flash("Tap Turn on and choose Allow to get notifications.");
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
        home_town: getHomeMuni() ?? undefined,
      };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => false);
        flash("Couldn't save subscription. Try again later.");
        return;
      }
      setSubscription(sub);
      setSupport("subscribed");
      track("push_optin");
      haptic("success");
      flash("Notifications on.");
    } catch {
      flash("Notifications could not be turned on. Try again.");
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
      haptic("medium");
      flash("Notifications off.");
    } finally {
      setBusy(false);
    }
  }, [subscription, flash]);

  // Persist topic changes when subscribed by re-POSTing the subscription.
  const saveTopics = useCallback(
    async (next: Set<PushTopic>): Promise<boolean> => {
      if (!subscription) return false;
      setSaving(true);
      try {
        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            topics: [...next],
            home_town: getHomeMuni() ?? undefined,
          }),
        });
        if (!response.ok) {
          flash("That topic change did not save. Try it again.");
          return false;
        }
        return true;
      } catch {
        flash("That topic change did not save. Try it again.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [subscription, flash],
  );

  const toggleTopic = useCallback(
    (t: PushTopic) => {
      if (saving) return;
      haptic("light");
      const previous = new Set(topics);
      const next = new Set(topics);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      setTopics(next);
      void saveTopics(next).then((saved) => {
        if (!saved) setTopics(previous);
      });
    },
    [saveTopics, saving, topics],
  );

  // Persist quiet hours (both null = off). Roll back the controls when the
  // server rejects the change so the visible setting remains truthful.
  const applyQuiet = useCallback(
    async (start: number | null, end: number | null) => {
      if (!subscription || saving) return;
      const previousStart = quietStart;
      const previousEnd = quietEnd;
      setQuietStart(start);
      setQuietEnd(end);
      haptic("light");
      setSaving(true);
      try {
        const response = await fetch("/api/push/prefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            quiet_start: start,
            quiet_end: end,
          }),
        });
        if (!response.ok) throw new Error("quiet-hours-save-failed");
      } catch {
        setQuietStart(previousStart);
        setQuietEnd(previousEnd);
        flash("That quiet-hours change did not save. Try it again.");
      } finally {
        setSaving(false);
      }
    },
    [flash, quietEnd, quietStart, saving, subscription],
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
      haptic("success");
      flash("The test notification was sent.");
    } finally {
      setBusy(false);
    }
  }, [subscription, flash]);

  if (support === "unknown") {
    return (
      <article
        aria-busy="true"
        className="rounded-[var(--app-radius-lg)] border p-4"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <header className="flex items-center gap-2">
          <Bell
            className="h-4 w-4"
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
          <h2
            className="text-[15px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Local alerts
          </h2>
        </header>
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Checking notification support on this device…
        </p>
      </article>
    );
  }

  if (support === "unsupported") {
    return (
      <article className="tactile rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4">
        <header className="flex items-center gap-2">
          <BellOff className="h-4 w-4" style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Local alerts
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
            Local alerts
          </h2>
        </header>
        <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Push notifications aren&apos;t enabled on this deployment yet.
          They&apos;ll appear here once VAPID keys are configured.
        </p>
      </article>
    );
  }

  if (support === "ios-needs-install") {
    return (
      <article className="tactile rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4">
        <header className="flex items-center gap-2">
          <Bell className="h-4 w-4" style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Local alerts
          </h2>
        </header>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          On iPhone and iPad, notifications work once Frederick Radius is on
          your Home Screen. Open the Share menu, choose Add to Home Screen,
          then open the app from there before you turn notifications on.
        </p>
        <button
          type="button"
          onClick={openReturnBridge}
          className="tactile-interactive mt-3 inline-flex min-h-11 items-center rounded-[var(--app-radius-sm)] border px-3 text-[13px] font-semibold transition active:scale-[0.98]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
        >
          Add Frederick Radius to Home Screen
        </button>
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
            Local alerts
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
            disabled={busy || saving || !pubKey}
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
            ? topics.size === 0
              ? "You’re connected. Pick at least one alert below."
              : saving
                ? "Saving your choices…"
                : `${topics.size} ${topics.size === 1 ? "alert is" : "alerts are"} on for this device.`
            : "Turn notifications on, then choose the topics you want."}
      </p>

      <div className="mt-4 space-y-4">
        {TOPIC_GROUPS.map((group) => (
          <section key={group.label} aria-labelledby={`topic-${group.label.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="mb-2">
              <h3
                id={`topic-${group.label.replace(/\s+/g, "-").toLowerCase()}`}
                className="text-[12px] font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                {group.label}
              </h3>
              <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                {group.description}
              </p>
            </div>
            <ul
              className="overflow-hidden rounded-[var(--app-radius-md)] border"
              style={{ borderColor: "var(--app-border)" }}
            >
              {group.topics.map((t, index) => {
                const info = TOPIC_LABELS[t];
                const on = topics.has(t);
                const disabled = !enabled || busy || saving;
                return (
                  <li
                    key={t}
                    className={index > 0 ? "border-t" : undefined}
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTopic(t)}
                      disabled={disabled}
                      aria-pressed={on}
                      className={`flex w-full items-start gap-3 px-3 py-3 text-left transition active:scale-[0.99] ${
                        disabled ? "opacity-55" : ""
                      }`}
                      style={{
                        background: on
                          ? "color-mix(in srgb, var(--app-brand) 7%, var(--app-bg-elevated))"
                          : "var(--app-bg-elevated)",
                      }}
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                        style={{
                          background: on
                            ? "var(--app-brand)"
                            : "var(--app-bg-elevated)",
                          borderColor: on
                            ? "var(--app-brand)"
                            : "var(--app-border)",
                        }}
                      >
                        {on && (
                          <Check
                            className="h-3 w-3 text-white"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block text-[14px] font-semibold leading-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {info.label}
                        </span>
                        <span
                          className="mt-0.5 block text-[11px] leading-snug"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {info.desc}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {enabled && (
        <section
          className="mt-5 border-t pt-4"
          style={{ borderColor: "var(--app-border)" }}
          aria-labelledby="delivery-tools"
        >
          <h3
            id="delivery-tools"
            className="mb-2 text-[12px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            Delivery tools
          </h3>
          <div className="rounded-[var(--app-radius-md)] border px-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                Quiet hours
              </span>
              <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                Hold notifications overnight. Urgent civic alerts still come through.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void (
                quietStart !== null && quietEnd !== null
                  ? applyQuiet(null, null)
                  : applyQuiet(21, 7)
              )}
              aria-pressed={quietStart !== null && quietEnd !== null}
              disabled={saving}
              className="tactile tactile-interactive shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold disabled:opacity-50"
              style={{
                background: quietStart !== null && quietEnd !== null ? "var(--app-brand)" : "var(--app-bg-elevated)",
                color: quietStart !== null && quietEnd !== null ? "white" : "var(--app-ink-2)",
                border: "1px solid var(--app-border)",
              }}
            >
              {quietStart !== null && quietEnd !== null ? "On" : "Off"}
            </button>
          </div>
          {quietStart !== null && quietEnd !== null && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
              <span>From</span>
              <select
                aria-label="Quiet hours start"
                value={quietStart}
                onChange={(e) => void applyQuiet(Number(e.target.value), quietEnd)}
                disabled={saving}
                className="rounded-[var(--app-radius-sm)] border px-2 py-1 text-[16px] disabled:opacity-50"
                style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
              <span>to</span>
              <select
                aria-label="Quiet hours end"
                value={quietEnd}
                onChange={(e) => void applyQuiet(quietStart, Number(e.target.value))}
                disabled={saving}
                className="rounded-[var(--app-radius-sm)] border px-2 py-1 text-[16px] disabled:opacity-50"
                style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
            </div>
          )}
          </div>
          <button
            type="button"
            onClick={sendTest}
            disabled={busy || saving}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ color: "var(--app-cool)" }}
          >
            <Send className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            Send a test notification
          </button>
        </section>
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

export default function NotificationsCard() {
  return (
    <div className="space-y-3">
      <PhoneFeedbackCard />
      <PushNotificationsCard />
    </div>
  );
}

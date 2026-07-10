"use client";

/**
 * OwnerAlertsCard — "alert this device" toggle on /admin/beta.
 *
 * Grants THIS browser's push subscription the owner-alerts topic via the
 * Basic-Auth-gated /admin/api/owner-alerts endpoint (the public subscribe
 * route strips that topic on purpose — the payloads carry feedback text and
 * signup emails). The browser attaches the admin credentials to same-origin
 * fetches under /admin automatically, so no extra auth plumbing is needed.
 */
import { useEffect, useState } from "react";
import { ensureDevicePushSubscription } from "@/lib/pushSubscribe";

type State =
  | "checking"
  | "off"
  | "on"
  | "working"
  | "unsupported"
  | "denied"
  | "error";

export default function OwnerAlertsCard() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) {
          if (!cancelled) setState("off");
          return;
        }
        const res = await fetch(
          `/admin/api/owner-alerts?endpoint=${encodeURIComponent(sub.endpoint)}`,
        );
        const json = (await res.json().catch(() => ({}))) as { subscribed?: boolean };
        if (!cancelled) setState(res.ok && json.subscribed ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(enable: boolean) {
    setState("working");
    const ensured = await ensureDevicePushSubscription();
    if (ensured.status !== "ok") {
      setState(
        ensured.status === "denied"
          ? "denied"
          : ensured.status === "unsupported"
            ? "unsupported"
            : "error",
      );
      return;
    }
    try {
      const res = await fetch("/admin/api/owner-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: ensured.sub.toJSON(), enable }),
      });
      const json = (await res.json().catch(() => ({}))) as { subscribed?: boolean };
      setState(res.ok ? (json.subscribed ? "on" : "off") : "error");
    } catch {
      setState("error");
    }
  }

  const on = state === "on";
  const busy = state === "checking" || state === "working";

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
          Alert this device
        </p>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {state === "unsupported"
            ? "This browser does not support push. On iPhone, open the installed app."
            : state === "denied"
              ? "Notifications are blocked for this site in the browser settings."
              : state === "error"
                ? "Could not update. Reload and try again."
                : on
                  ? "New feedback and signups will push to this device the moment they arrive."
                  : "Get a push here the moment a tester sends feedback or signs up."}
        </p>
      </div>
      {state !== "unsupported" && state !== "denied" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => toggle(!on)}
          className="tap-44 shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wide"
          style={{
            borderColor: on ? "var(--app-positive)" : "var(--app-border-strong)",
            color: on ? "var(--app-positive)" : "var(--app-ink-2)",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "…" : on ? "On" : "Turn on"}
        </button>
      ) : null}
    </div>
  );
}

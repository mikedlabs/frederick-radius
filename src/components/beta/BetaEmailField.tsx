"use client";

import { useState } from "react";

/**
 * Optional launch-news signup under the beta password form.
 *
 * The wall used to collect only the shared password, leaving every visitor
 * unreachable (experience review, blind spots: launch day had no announcement
 * channel). One field, clearly optional, calm copy — a person locked out
 * without the password can still raise a hand for opening day. Fail-soft: a
 * missing table or DB just apologizes quietly.
 */
export default function BetaEmailField() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch("/api/beta/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean };
      setState(res.ok && d.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      {/* Persistent live region for the success confirmation. It exists from
          first render and only its TEXT changes on submit — live regions
          announce text changes, not regions mounted with content (the old
          early-return swapped the whole subtree, which several SRs never
          announced). When done it doubles as the visible confirmation. */}
      <p
        role="status"
        aria-live="polite"
        className={
          state === "done"
            ? "mx-auto mt-8 max-w-[22rem] text-[13px] font-semibold"
            : "sr-only"
        }
        style={state === "done" ? { color: "var(--app-brand-2)" } : undefined}
      >
        {state === "done" ? "You’re on the list. We’ll write when the doors open." : ""}
      </p>
      {state !== "done" && (
    <form onSubmit={submit} className="mx-auto mt-8 max-w-[20rem] space-y-2">
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        No password? Leave an email and we&rsquo;ll tell you when Frederick Radius opens up.
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          inputMode="email"
          aria-label="Email for launch news"
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-[var(--app-radius-md)] border px-3 py-2.5 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-1"
          style={{
            borderColor: "var(--app-border-strong)",
            background: "var(--app-bg-elevated-solid)",
            color: "var(--app-ink)",
          }}
        />
        <button
          type="submit"
          disabled={state === "busy"}
          className="tap-44 shrink-0 rounded-[var(--app-radius-md)] px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--app-ink)" }}
        >
          {state === "busy" ? "…" : "Notify me"}
        </button>
      </div>
      {state === "error" && (
        <p role="alert" className="text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
          Couldn&rsquo;t save that right now. Try again in a minute.
        </p>
      )}
    </form>
      )}
    </>
  );
}

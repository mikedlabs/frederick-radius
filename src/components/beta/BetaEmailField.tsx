"use client";

import { useState } from "react";

/**
 * Self-serve access under the code entry form: the second way in.
 *
 * A visitor without a code enters their email and /api/beta/email mints a
 * personal access code and emails it right away (inviteEmail), so they can try
 * the beta immediately, not "at launch." One field, calm copy. Fail-soft: a
 * missing table or DB just apologizes quietly; a duplicate email reads as
 * success (they already have a code in their inbox).
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
        {state === "done" ? "Sent. Check your email for your access code, then come on in." : ""}
      </p>
      {state !== "done" && (
    <form onSubmit={submit} className="mx-auto mt-6 max-w-[20rem] space-y-2">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
        No access code? Try it now
      </p>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Enter your email and we&rsquo;ll send you a code right away.
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
          {state === "busy" ? "…" : "Email me a code"}
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

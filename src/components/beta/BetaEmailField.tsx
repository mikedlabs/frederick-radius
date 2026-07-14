"use client";

import Link from "next/link";
import { useState } from "react";
import {
  betaInviteWasSent,
  type BetaEmailResponse,
} from "@/lib/beta-email-response";

/** The primary beta-access path: email in, personal code out. */
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
      const data = (await res.json().catch(() => ({}))) as BetaEmailResponse;
      setState(betaInviteWasSent(res.ok, data) ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-5">
      <p
        role="status"
        aria-live="polite"
        className={state === "done" ? "text-[13px] font-semibold" : "sr-only"}
        style={state === "done" ? { color: "var(--app-brand-2)" } : undefined}
      >
        {state === "done" ? "Sent. Check your email for your access code, then come on in." : ""}
      </p>

      {state !== "done" ? (
        <form onSubmit={submit} className="space-y-2.5">
          <label
            htmlFor="beta-email"
            className="block text-[12px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            Email address
          </label>
          <div className="flex gap-2">
            <input
              id="beta-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
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
              className="tap-44 shrink-0 rounded-[var(--app-radius-md)] px-3.5 text-[13px] font-semibold disabled:opacity-60"
              style={{
                background: "var(--app-brand-press)",
                color: "var(--app-on-brand)",
                boxShadow:
                  "0 8px 20px -10px color-mix(in srgb, var(--app-brand) 70%, transparent), var(--app-hi)",
              }}
            >
              {state === "busy" ? "Sending…" : "Send my code"}
            </button>
          </div>

          {state === "error" ? (
            <p role="alert" className="text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
              We couldn&rsquo;t send a code right now. Try again in a minute.
            </p>
          ) : null}

          <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            We use your email to send and manage your beta access. We don&rsquo;t
            sell it. Ask us to remove it anytime. By requesting a code, you
            agree to our{" "}
            <Link
              href="/terms"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--app-ink-2)" }}
            >
              Terms
            </Link>{" "}
            and acknowledge our{" "}
            <Link
              href="/privacy"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--app-ink-2)" }}
            >
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      ) : null}
    </div>
  );
}

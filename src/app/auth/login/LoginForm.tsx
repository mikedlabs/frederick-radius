"use client";

import { useState } from "react";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * LoginForm â client island that sends a magic link via Supabase Auth.
 *
 * Two states:
 *   - "form"  â email input + submit
 *   - "sent"  â "Check your inbox" confirmation with the recipient
 *               address echoed back so the user knows where to look
 *
 * Errors are inline (red text under the input) â never toasted,
 * since the user is mid-flow and a disappearing toast would lose
 * the context.
 */
export default function LoginForm({
  next,
  initialSentTo,
}: {
  next: string | null;
  initialSentTo: string | null;
}) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(initialSentTo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      // emailRedirectTo is where Supabase sends the user after they
      // click the magic link. The callback exchanges the code for a
      // session and forwards to ?next= (or /my-radius if absent).
      const origin = window.location.origin;
      const next_q = next ? `?next=${encodeURIComponent(next)}` : "";
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${origin}/auth/callback${next_q}` },
      });
      if (err) {
        setError(err.message);
        return;
      }
      setSentTo(trimmed);
    } catch {
      setError("That link didn’t send. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div
        className="rounded-[var(--app-radius-lg)] border p-5 text-center"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <CheckCircle2
          className="mx-auto h-7 w-7"
          strokeWidth={1.75}
          aria-hidden
          style={{ color: "var(--app-positive)" }}
        />
        <h2
          className="mt-3 font-serif text-[18px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Check your inbox
        </h2>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          We sent a magic link to{" "}
          <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
            {sentTo}
          </span>
          . Click it from this device and you&apos;ll be signed in.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          className="mt-4 text-[12px] font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label
        htmlFor="email"
        className="block text-[12px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Email
      </label>
      <div className="relative">
        <Mail
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--app-ink-3)" }}
          aria-hidden
        />
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          className="w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 pl-9 pr-3 text-[14px]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink)",
          }}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="text-[12px]"
          style={{ color: "var(--app-danger)" }}
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="tactile tactile-interactive tactile-lift tactile-glow-brand inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-5 py-3 text-[14px] font-semibold disabled:opacity-60"
        style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} aria-hidden />
            Sendingâ¦
          </>
        ) : (
          <>Send magic link</>
        )}
      </button>
    </form>
  );
}

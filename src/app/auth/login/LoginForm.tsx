"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resetFollowsSyncFlag } from "@/hooks/useFollows";

const SAVED_KEY = "fr:saved:v1";
const PENDING_AUTH_KEY = "fr:auth:pending:v1";
const RESEND_SECONDS = 30;

function localPlaceCount(): number {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const saved = raw ? (JSON.parse(raw) as Array<{ type?: unknown; id?: unknown }>) : [];
    if (!Array.isArray(saved)) return 0;
    return new Set(
      saved
        .filter((item) => item?.type === "place" && typeof item.id === "string")
        .map((item) => item.id as string),
    ).size;
  } catch {
    return 0;
  }
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, 1)}${"•".repeat(Math.min(4, Math.max(2, name.length - 1)))}@${domain}`;
}

function friendlySendError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "Too many sign-in emails were requested just now. Wait a minute, then try again.";
  }
  return "We could not send a sign-in email right now. Your on-device saves are safe. Try again in a moment.";
}

function friendlyCodeError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("token")
  ) {
    return "That code has closed or was already used. Send a fresh one below.";
  }
  return "We could not verify that code. Check all six digits and try again.";
}

export default function LoginForm({
  next,
  destinationLabel,
}: {
  next: string;
  destinationLabel: string;
}) {
  const router = useRouter();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [savedPlaces, setSavedPlaces] = useState(0);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    setSavedPlaces(localPlaceCount());
    try {
      const pending = window.sessionStorage.getItem(PENDING_AUTH_KEY);
      if (!pending) return;
      const parsed = JSON.parse(pending) as { email?: unknown; next?: unknown };
      if (typeof parsed.email === "string" && parsed.next === next) {
        setSentTo(parsed.email);
      }
    } catch {
      /* private browsing or malformed stale state; start clean */
    }
  }, [next]);

  useEffect(() => {
    if (!sentTo) return;
    codeInputRef.current?.focus();
  }, [sentTo]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function sendCode(target: string, isResend = false) {
    const normalized = target.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a complete email address, like you@example.com.");
      return;
    }

    setBusy("send");
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", next);
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          shouldCreateUser: true,
          // The current Supabase template uses the callback link. The polished
          // template also includes {{ .Token }}, making the code field below a
          // scanner-safe, cross-browser alternative.
          emailRedirectTo: callback.toString(),
        },
      });
      if (authError) {
        setError(friendlySendError(authError.message));
        return;
      }

      setSentTo(normalized);
      setEmail(normalized);
      setCode("");
      setResendIn(RESEND_SECONDS);
      setNotice(isResend ? "A fresh sign-in is on its way. Use the newest email." : null);
      try {
        window.sessionStorage.setItem(
          PENDING_AUTH_KEY,
          JSON.stringify({ email: normalized, next }),
        );
      } catch {
        /* the current screen still works without restorable state */
      }
    } catch (caught) {
      setError(
        friendlySendError(caught instanceof Error ? caught.message : "unknown error"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function onEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    await sendCode(email);
  }

  async function onCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !sentTo) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter all six digits from the email.");
      return;
    }

    setBusy("verify");
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.verifyOtp({
        email: sentTo,
        token: code,
        type: "email",
      });
      if (authError || !data.session) {
        setError(friendlyCodeError(authError?.message ?? "missing session"));
        return;
      }

      try {
        window.sessionStorage.removeItem(PENDING_AUTH_KEY);
      } catch {
        /* no-op */
      }
      // This is a client-side transition, so module state from the page that
      // sent the user here can survive. Invalidate its cached anonymous lookup
      // before returning; My Radius will then discover the new session and
      // import device-local places exactly once for this account.
      resetFollowsSyncFlag();
      router.replace(next);
      router.refresh();
    } catch (caught) {
      setError(
        friendlyCodeError(caught instanceof Error ? caught.message : "unknown error"),
      );
    } finally {
      setBusy(null);
    }
  }

  if (sentTo) {
    return (
      <div aria-busy={busy !== null}>
        <p className="sr-only" role="status">
          Sign-in email sent. Check your inbox, then use the button or code shown there.
        </p>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-positive) 13%, transparent)",
              color: "var(--app-positive)",
            }}
          >
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <p className="eyebrow" style={{ color: "var(--app-positive)" }}>
              Email sent
            </p>
            <h2 className="mt-1 font-serif text-[25px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
              Check your email.
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              We sent a one-time sign-in email to <strong>{maskEmail(sentTo)}</strong>.
              Open its button in this browser, or enter the 6-digit code if the
              email shows one.
            </p>
          </div>
        </div>

        {savedPlaces > 0 && (
          <div
            className="mt-5 rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12px] leading-relaxed"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-sunken)",
              color: "var(--app-ink-2)",
            }}
          >
            {savedPlaces} {savedPlaces === 1 ? "place" : "places"} on this device
            will be added without removing anything already in your account. Then
            we&apos;ll return you to {destinationLabel}.
          </div>
        )}

        <form onSubmit={onCodeSubmit} className="mt-5 space-y-3">
          <label
            htmlFor="email-code"
            className="block text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            6-digit code (if shown)
          </label>
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <input
              ref={codeInputRef}
              id="email-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "code-help auth-error" : "code-help"}
              className="min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 pl-10 pr-3 font-mono text-[18px] font-semibold tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            />
          </div>
          <p id="code-help" className="text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            A code works here even if you read email on another device. If your
            email has a sign-in button instead, use that in this browser.
          </p>

          {error && (
            <p id="auth-error" role="alert" className="text-[12px] leading-relaxed" style={{ color: "var(--app-danger)" }}>
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-[12px] leading-relaxed" style={{ color: "var(--app-positive)" }}>
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy !== null || code.length !== 6}
            className="tactile tactile-interactive tactile-glow-brand inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-55"
            style={{ background: "var(--app-brand)" }}
          >
            {busy === "verify" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} aria-hidden />
                Bringing your Radius together…
              </>
            ) : (
              `Continue to ${destinationLabel}`
            )}
          </button>
        </form>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy !== null || resendIn > 0}
            onClick={() => void sendCode(sentTo, true)}
            className="min-h-11 rounded-[var(--app-radius-md)] border px-3 text-[12px] font-semibold disabled:opacity-55"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Send a fresh email"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setSentTo(null);
              setCode("");
              setError(null);
              setNotice(null);
              try {
                window.sessionStorage.removeItem(PENDING_AUTH_KEY);
              } catch {
                /* no-op */
              }
            }}
            className="min-h-11 rounded-[var(--app-radius-md)] border px-3 text-[12px] font-semibold disabled:opacity-55"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            Change email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onEmailSubmit} className="space-y-4" aria-busy={busy !== null}>
      <div>
        <p className="eyebrow" style={{ color: "var(--app-brand)" }}>
          Secure sign-in
        </p>
        <h2 className="mt-1 font-serif text-[27px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          Send yourself a secure sign-in.
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          No password. A new email starts a Radius account automatically.
        </p>
      </div>

      {savedPlaces > 0 && (
        <div
          className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12px] leading-relaxed"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-sunken)",
            color: "var(--app-ink-2)",
          }}
        >
          <strong style={{ color: "var(--app-ink)" }}>
            {savedPlaces} {savedPlaces === 1 ? "place" : "places"} waiting on this device.
          </strong>{" "}
          We&apos;ll add {savedPlaces === 1 ? "it" : "them"} to anything already
          with your account.
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-[11px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Your email
        </label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy !== null}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "email-help auth-error" : "email-help"}
            className="min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 pl-10 pr-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          />
        </div>
        <p id="email-help" className="text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          Used only for your Radius account. No newsletters or alerts unless you choose them separately.
        </p>
      </div>

      {error && (
        <p id="auth-error" role="alert" className="text-[12px] leading-relaxed" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy !== null}
        className="tactile tactile-interactive tactile-glow-brand inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-55"
        style={{ background: "var(--app-brand)" }}
      >
        {busy === "send" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} aria-hidden />
            Sending your email…
          </>
        ) : (
          "Send sign-in email"
        )}
      </button>
    </form>
  );
}

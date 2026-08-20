"use client";

import { useState, useTransition } from "react";
import { Check, Megaphone } from "lucide-react";
import { postOwnerUpdateAction } from "@/components/business/manage-actions";
import { validateOwnerPost, type OwnerPostInput } from "@/lib/submissions";

/**
 * ManagePanel: the owner's post form on /business/manage/[token]. Posts
 * a special or event, which lands as a moderated submission. Mirrors the
 * ClaimForm pattern; the token is carried through to the server action,
 * which re-verifies it.
 */
export default function ManagePanel({
  token,
  businessName,
}: {
  token: string;
  businessName: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"special" | "event">("special");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const input: OwnerPostInput = {
      kind,
      title: String(data.get("title") ?? ""),
      details: String(data.get("details") ?? ""),
      starts_at: String(data.get("starts_at") ?? ""),
      link: String(data.get("link") ?? ""),
    };
    const validationError = validateOwnerPost(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      try {
        await postOwnerUpdateAction(token, input);
        setSubmitted(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn’t send this update. Try again in a minute.");
      }
    });
  };

  if (submitted) {
    return (
      <div
        className="mt-6 space-y-4 rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-6 text-center shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-full"
          style={{ background: "var(--app-positive)" }}
        >
          <Check className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
        </div>
        <h2
          className="font-serif text-xl font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Sent for review
        </h2>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          We give every post a quick look before it goes live. It usually
          publishes within a day.
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setError(null);
          }}
          className="text-sm font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Post another update
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      <div
        role="radiogroup"
        aria-label="Post type"
        className="grid grid-cols-2 gap-2"
      >
        {(["special", "event"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className="rounded-[var(--app-radius-md)] border py-2.5 text-[13px] font-semibold capitalize transition"
            style={{
              borderColor: kind === k ? "var(--app-brand)" : "var(--app-border)",
              background:
                kind === k
                  ? "color-mix(in srgb, var(--app-brand) 12%, transparent)"
                  : "var(--app-bg-elevated)",
              color: kind === k ? "var(--app-brand)" : "var(--app-ink-2)",
            }}
          >
            {k}
          </button>
        ))}
      </div>

      <Field
        name="title"
        label={kind === "special" ? "What's the special?" : "Event name"}
        required
        placeholder={
          kind === "special"
            ? "e.g. Half-price growlers on Fridays"
            : "e.g. Live jazz on the patio"
        }
      />
      <Area name="details" label="Details" />
      {kind === "event" ? (
        <Field name="starts_at" label="Date and time" type="datetime-local" required />
      ) : null}
      <Field name="link" label="Link (optional)" type="url" placeholder="https://" />

      {error ? (
        <p
          className="rounded-[var(--app-radius-md)] px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--app-danger) 10%, transparent)", color: "var(--app-danger)" }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-sm font-semibold shadow-[var(--app-shadow-1)] transition disabled:opacity-60"
        style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
      >
        <Megaphone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        {pending ? "Submitting…" : "Submit for review"}
      </button>
      <p
        className="text-[11px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        Posts are reviewed before they publish. Approved specials reach the
        people who follow {businessName || "your business"}.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}
        {required ? <span aria-hidden style={{ color: "var(--app-brand)" }}>*</span> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

function Area({ name, label }: { name: string; label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}
      </span>
      <textarea
        name={name}
        rows={3}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

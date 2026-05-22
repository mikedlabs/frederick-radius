"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { submitBusinessClaimAction } from "@/components/submit/actions";
import {
  validateBusinessClaim,
  type SubmitBusinessClaimInput,
} from "@/lib/submissions";

/**
 * ClaimForm: the business-owner claim intake. Mirrors the SubmitPlace
 * form pattern. Submits a moderated business_claim that an admin reviews
 * in /admin/claims. `placeSlug` is set when the claim was deep-linked
 * from a specific listing.
 */
export default function ClaimForm({ placeSlug = "" }: { placeSlug?: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const input: SubmitBusinessClaimInput = {
      business_name: String(data.get("business_name") ?? ""),
      place_slug: placeSlug,
      owner_name: String(data.get("owner_name") ?? ""),
      owner_role: String(data.get("owner_role") ?? ""),
      owner_email: String(data.get("owner_email") ?? ""),
      owner_phone: String(data.get("owner_phone") ?? ""),
      note: String(data.get("note") ?? ""),
    };
    const validationError = validateBusinessClaim(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      try {
        await submitBusinessClaimAction(input);
        setSubmitted(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  if (submitted) {
    return (
      <div
        className="mt-8 space-y-4 rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-6 text-center shadow-[var(--app-shadow-1)]"
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
          Claim submitted
        </h2>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          We&apos;ll verify the details and follow up at the email you gave us,
          usually within a few days.
        </p>
        <Link
          href="/"
          className="inline-block text-sm font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Back to Frederick Radius
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {placeSlug ? (
        <p
          className="rounded-[var(--app-radius-md)] px-3 py-2 text-[13px]"
          style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
        >
          Claiming the listing for{" "}
          <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
            {placeSlug}
          </span>
          .
        </p>
      ) : null}

      <Field
        name="business_name"
        label="Business name"
        required
        placeholder="e.g. Idiom Brewing Co."
      />

      <div
        className="space-y-1.5 border-t pt-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        <p
          className="pt-2 text-xs font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          About you
        </p>
        <Field name="owner_name" label="Your name" required />
        <Field
          name="owner_role"
          label="Your role"
          placeholder="Owner, manager, or marketing"
        />
        <Field name="owner_email" label="Your email" required type="email" />
        <Field
          name="owner_phone"
          label="Business phone"
          type="tel"
          placeholder="(240) 555-0100"
        />
      </div>

      <Area name="note" label="Anything we should know? (optional)" />

      {error ? (
        <p
          className="rounded-[var(--app-radius-md)] px-3 py-2 text-sm"
          style={{ background: "rgba(160,41,41,0.10)", color: "var(--app-danger)" }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--app-shadow-1)] transition disabled:opacity-60"
        style={{ background: "var(--app-brand)" }}
      >
        {pending ? "Submitting…" : "Submit claim for review"}
      </button>
      <p
        className="text-[11px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        Claims are reviewed by hand. We verify ownership before a listing is
        marked owner-managed. Your contact details are never shown publicly.
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
        {required ? <span style={{ color: "var(--app-brand)" }}>*</span> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[15px] outline-none focus:ring-2"
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
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[15px] outline-none focus:ring-2"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

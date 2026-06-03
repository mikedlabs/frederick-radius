"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { submitPlaceAction, type SubmitPlaceInput } from "./actions";
import { MUNICIPALITIES } from "@/data/municipalities";
import { TOP_CATEGORIES } from "@/data/categories";

export default function SubmitPlaceForm() {
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const input: SubmitPlaceInput = {
      name: String(data.get("name") ?? ""),
      category: String(data.get("category") ?? ""),
      address: String(data.get("address") ?? ""),
      municipality: String(data.get("municipality") ?? ""),
      website: String(data.get("website") ?? ""),
      phone: String(data.get("phone") ?? ""),
      description: String(data.get("description") ?? ""),
      submitter_email: String(data.get("submitter_email") ?? ""),
      submitter_name: String(data.get("submitter_name") ?? ""),
      is_owner: data.get("is_owner") === "on",
    };
    if (!input.name || !input.category || !input.submitter_email) {
      setError("Name, category, and your email are required.");
      return;
    }
    startTransition(async () => {
      try {
        await submitPlaceAction(input);
        setSubmitted(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  if (submitted) {
    return (
      <div className="mt-8 space-y-4 rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-6 text-center shadow-[var(--app-shadow-1)]"
           style={{ borderColor: "var(--app-border)" }}>
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-full"
          style={{ background: "var(--app-positive)" }}
        >
          <Check className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
        </div>
        <h2 className="font-serif text-xl font-semibold" style={{ color: "var(--app-ink)" }}>Thanks, submitted</h2>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          We&apos;ll cross-verify and either publish or reach out to you for clarification within a week.
        </p>
        <Link href="/" className="inline-block text-sm font-semibold" style={{ color: "var(--app-cool)" }}>
          Back to Frederick Radius →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <FieldText name="name" label="Place name" required placeholder="e.g. Idiom Brewing Co." />
      <FieldSelect name="category" label="Category" required options={TOP_CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))} />
      <FieldSelect name="municipality" label="Town" required options={MUNICIPALITIES.map((m) => ({ value: m.slug, label: m.name }))} />
      <FieldText name="address" label="Full address" placeholder="340 E Patrick St, Frederick, MD 21701" />
      <FieldText name="website" label="Website" placeholder="https://…" />
      <FieldText name="phone" label="Phone" placeholder="(240) 555-0100" />
      <FieldTextarea name="description" label="What makes this place worth a visit?" rows={3} />

      <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: "var(--app-border)" }}>
        <p className="pt-2 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          About you
        </p>
        <FieldText name="submitter_name" label="Your name" />
        <FieldText name="submitter_email" label="Your email" required type="email" />
        <label className="mt-2 inline-flex items-center gap-2 text-sm" style={{ color: "var(--app-ink-2)" }}>
          <input type="checkbox" name="is_owner" className="h-4 w-4" />
          I&apos;m the owner or on the team at this place
        </label>
      </div>

      {error && (
        <p className="rounded-[var(--app-radius-md)] px-3 py-2 text-sm" style={{ background: `${"#A02929"}1A`, color: "var(--app-danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--app-shadow-1)] transition disabled:opacity-60"
        style={{ background: "var(--app-brand)" }}
      >
        {pending ? "Submitting…" : "Submit for review"}
      </button>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Submissions are reviewed by hand. We&apos;ll verify against public sources before publishing — your email isn&apos;t shown publicly.
      </p>
    </form>
  );
}

function FieldText({ name, label, required, type = "text", placeholder }: { name: string; label: string; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}{required && <span style={{ color: "var(--app-brand)" }}>*</span>}
      </span>
      <input
        name={name} type={type} required={required} placeholder={placeholder}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[15px] outline-none focus:ring-2"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

function FieldTextarea({ name, label, rows = 3 }: { name: string; label: string; rows?: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>{label}</span>
      <textarea
        name={name} rows={rows}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[15px] outline-none focus:ring-2"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

function FieldSelect({ name, label, required, options }: { name: string; label: string; required?: boolean; options: { value: string; label: string }[] }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}{required && <span style={{ color: "var(--app-brand)" }}>*</span>}
      </span>
      <select
        name={name} required={required}
        defaultValue=""
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[15px] outline-none focus:ring-2"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      >
        <option value="" disabled>Pick one…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

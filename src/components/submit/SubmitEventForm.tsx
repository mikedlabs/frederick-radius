"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { submitEventAction, type SubmitEventInput } from "./actions";
import BotTrapFields from "./BotTrapFields";
import { MUNICIPALITIES } from "@/data/municipalities";
import { TOP_CATEGORIES } from "@/data/categories";

const EVENT_FIELD_MAX_LENGTHS: Record<string, number> = {
  title: 160,
  organizer: 160,
  starts_at: 32,
  ends_at: 32,
  venue_name: 160,
  address: 240,
  description: 4_000,
  price_text: 80,
  ticket_url: 2_048,
  submitter_name: 120,
  submitter_email: 254,
};

export default function SubmitEventForm() {
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Prefill the town when arriving from a "Submit an event for <town>" CTA.
  // Set post-mount on the uncontrolled select so there is no hydration
  // mismatch and no behavior change when ?m= is absent.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("m");
    if (!slug || !MUNICIPALITIES.some((mm) => mm.slug === slug)) return;
    const el = formRef.current?.elements.namedItem("municipality");
    if (el instanceof HTMLSelectElement) el.value = slug;
  }, []);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const input: SubmitEventInput = {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      starts_at: String(data.get("starts_at") ?? ""),
      ends_at: String(data.get("ends_at") ?? ""),
      venue_name: String(data.get("venue_name") ?? ""),
      address: String(data.get("address") ?? ""),
      municipality: String(data.get("municipality") ?? ""),
      category: String(data.get("category") ?? ""),
      is_free: data.get("is_free") === "on",
      price_text: String(data.get("price_text") ?? ""),
      ticket_url: String(data.get("ticket_url") ?? ""),
      organizer: String(data.get("organizer") ?? ""),
      submitter_email: String(data.get("submitter_email") ?? ""),
      submitter_name: String(data.get("submitter_name") ?? ""),
      contact_fax: String(data.get("contact_fax") ?? ""),
    };
    if (!input.title || !input.starts_at || !input.submitter_email) {
      setError("Title, start time, and your email are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(input.submitter_email)) {
      setError("Enter a valid email so we can follow up about this event.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitEventAction(input);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSubmitted(true);
        setError(null);
      } catch {
        setError("We couldn’t submit this event. Try again in a minute.");
      }
    });
  };

  if (submitted) {
    return (
      <div className="mt-8 space-y-4 rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-6 text-center shadow-[var(--app-shadow-1)]"
           style={{ borderColor: "var(--app-border)" }}>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--app-positive)" }}>
          <Check className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
        </div>
        <h2 className="font-serif text-xl font-semibold" style={{ color: "var(--app-ink)" }}>Thanks, submitted</h2>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>We review submissions and reply within three business days.</p>
        <Link href="/" className="inline-block text-sm font-semibold" style={{ color: "var(--app-cool)" }}>Back to Frederick Radius <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} /></Link>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      <BotTrapFields />
      <Field name="title" label="Event title" required placeholder="Punch Brothers at the Weinberg" />
      <Field name="organizer" label="Organizer" placeholder="Weinberg Center for the Arts" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field name="starts_at" label="Starts" required type="datetime-local" />
        <Field name="ends_at" label="Ends" type="datetime-local" />
      </div>
      <Field name="venue_name" label="Venue name" placeholder="Weinberg Center for the Arts" />
      <Field name="address" label="Address" placeholder="20 W Patrick St, Frederick, MD 21701" />
      <Select name="municipality" label="Town" options={MUNICIPALITIES.map((m) => ({ value: m.slug, label: m.name }))} />
      <Select name="category" label="Category" options={TOP_CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))} />
      <Textarea name="description" label="Description" rows={4} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field name="price_text" label="Price" placeholder="$45–$85, or leave blank if free" />
        <Field name="ticket_url" label="Ticket / RSVP URL" placeholder="https://…" />
      </div>
      <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--app-ink-2)" }}>
        <input type="checkbox" name="is_free" className="h-4 w-4" />
        Free admission
      </label>
      <div className="space-y-1.5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
        <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>About you</p>
        <Field name="submitter_name" label="Your name" />
        <Field name="submitter_email" label="Your email" required type="email" />
      </div>
      {error && (
        <p role="alert" className="rounded-[var(--app-radius-md)] px-3 py-2 text-sm" style={{ background: "var(--app-danger-tint-14)", color: "var(--app-danger)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--app-shadow-1)] transition disabled:opacity-60"
        style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
      >
        {pending ? "Submitting…" : "Submit event"}
      </button>
    </form>
  );
}

function Field({ name, label, required, type = "text", placeholder }: { name: string; label: string; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}{required && <span aria-hidden style={{ color: "var(--app-brand-press)" }}> *</span>}
      </span>
      <input
        name={name} type={type} required={required} placeholder={placeholder}
        maxLength={EVENT_FIELD_MAX_LENGTHS[name]}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

function Textarea({ name, label, rows = 3 }: { name: string; label: string; rows?: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>{label}</span>
      <textarea
        name={name} rows={rows}
        maxLength={EVENT_FIELD_MAX_LENGTHS[name]}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: { value: string; label: string }[] }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>{label}</span>
      <select
        name={name} defaultValue=""
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      >
        <option value="">Pick one…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { submitPlaceAction, type SubmitPlaceInput } from "./actions";
import BotTrapFields from "./BotTrapFields";
import { MUNICIPALITIES } from "@/data/municipalities";
import { TOP_CATEGORIES } from "@/data/categories";

const PLACE_FIELD_MAX_LENGTHS: Record<string, number> = {
  name: 120,
  address: 240,
  website: 2_048,
  phone: 40,
  description: 1_500,
  social_url: 2_048,
  photo_url: 2_048,
  submitter_email: 254,
  submitter_name: 120,
};

export default function SubmitPlaceForm({ variant = "place" }: { variant?: "place" | "food-truck" }) {
  const isFoodTruck = variant === "food-truck";
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
      social_url: String(data.get("social_url") ?? ""),
      photo_url: String(data.get("photo_url") ?? ""),
      photo_permission: data.get("photo_permission") === "on",
      submitter_email: String(data.get("submitter_email") ?? ""),
      submitter_name: String(data.get("submitter_name") ?? ""),
      is_owner: data.get("is_owner") === "on",
      contact_fax: String(data.get("contact_fax") ?? ""),
    };
    if (!input.name || !input.category || !input.municipality || !input.submitter_email) {
      setError("Name, category, town, and your email are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(input.submitter_email)) {
      setError("Enter a valid email so we can follow up about this place.");
      return;
    }
    if (input.photo_url && !input.photo_permission) {
      setError("Please confirm that we have permission to display the photo you shared.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitPlaceAction(input);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSubmitted(true);
        setError(null);
      } catch {
        setError("We couldn’t submit this place. Try again in a minute.");
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
        <h2 className="font-serif text-xl font-semibold" style={{ color: "var(--app-ink)" }}>
          {isFoodTruck ? "Your truck is in for review" : "Thanks, submitted"}
        </h2>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          {isFoodTruck
            ? "We’ll verify the details and contact you before the listing goes live."
            : "We’ll cross-check the details and reach out if anything needs clarification."}
        </p>
        <Link href={isFoodTruck ? "/food-trucks" : "/"} className="inline-flex min-h-11 items-center text-sm font-semibold" style={{ color: "var(--app-cool)" }}>
          {isFoodTruck ? "Back to the truck board" : "Back to Frederick Radius"} <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      <BotTrapFields />
      <FieldText name="name" label={isFoodTruck ? "Truck name" : "Place name"} required placeholder={isFoodTruck ? "Your food truck’s name" : "e.g. Brewer's Alley"} />
      {isFoodTruck ? (
        <input type="hidden" name="category" value="food-truck" />
      ) : (
        <FieldSelect name="category" label="Category" required options={TOP_CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))} />
      )}
      <FieldSelect name="municipality" label={isFoodTruck ? "Main town or service area" : "Town"} required options={MUNICIPALITIES.map((m) => ({ value: m.slug, label: m.name }))} />
      {isFoodTruck ? <FieldText name="social_url" label="Where do you post today’s location?" type="url" placeholder="Instagram or Facebook URL" /> : null}
      <FieldTextarea name="description" label={isFoodTruck ? "What do you serve?" : "What makes this place worth a visit?"} rows={3} />

      {isFoodTruck ? (
        <details className="group rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
          <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
            <span>
              <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Add more listing details</span>
              <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>Optional links, contact details, and an approved truck photo.</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
          </summary>
          <div className="space-y-4 border-t px-3.5 py-4" style={{ borderColor: "var(--app-border)" }}>
            <FieldText name="address" label="Regular home base" placeholder="A brewery, market, or recurring stop" />
            <FieldText name="website" label="Website" type="url" placeholder="https://…" />
            <FieldText name="phone" label="Phone" type="tel" placeholder="(240) 555-0100" />
            <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Help the listing look like your truck</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                  Share a public link to one strong truck photo. A cloud-storage or website image link works.
                </p>
              </div>
              <FieldText name="photo_url" label="Truck photo link" type="url" placeholder="https://…" />
              <label className="flex min-h-11 items-start gap-2 py-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                <input type="checkbox" name="photo_permission" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>I own this photo or have permission for Frederick Radius to display it.</span>
              </label>
            </div>
          </div>
        </details>
      ) : (
        <>
          <FieldText name="address" label="Full address" placeholder="124 N Market St, Frederick, MD 21701" />
          <FieldText name="website" label="Website" placeholder="https://…" />
          <FieldText name="phone" label="Phone" placeholder="(240) 555-0100" />
        </>
      )}

      <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: "var(--app-border)" }}>
        <p className="pt-2 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          About you
        </p>
        <FieldText name="submitter_name" label="Your name" />
        <FieldText name="submitter_email" label="Your email" required type="email" />
        <label className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--app-ink-2)" }}>
          <input type="checkbox" name="is_owner" defaultChecked={isFoodTruck} className="h-4 w-4" />
          {isFoodTruck ? "I’m the owner or on this truck’s team" : "I’m the owner or on the team at this place"}
        </label>
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
        {pending ? "Submitting…" : isFoodTruck ? "Send my truck for review" : "Submit for review"}
      </button>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Submissions are reviewed by hand. We&apos;ll verify against public sources before publishing. Your email isn&apos;t shown publicly.
      </p>
    </form>
  );
}

function FieldText({ name, label, required, type = "text", placeholder }: { name: string; label: string; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}{required && <span aria-hidden style={{ color: "var(--app-brand-press)" }}> *</span>}
      </span>
      <input
        name={name} type={type} required={required} placeholder={placeholder}
        maxLength={PLACE_FIELD_MAX_LENGTHS[name]}
        className="block min-h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
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
        maxLength={PLACE_FIELD_MAX_LENGTHS[name]}
        className="block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

function FieldSelect({ name, label, required, options }: { name: string; label: string; required?: boolean; options: { value: string; label: string }[] }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}{required && <span aria-hidden style={{ color: "var(--app-brand-press)" }}> *</span>}
      </span>
      <select
        name={name} required={required}
        defaultValue=""
        className="block min-h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      >
        <option value="" disabled>Pick one…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

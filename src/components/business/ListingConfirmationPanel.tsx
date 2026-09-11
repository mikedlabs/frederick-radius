"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CheckCircle2, PencilLine } from "lucide-react";
import { submitOwnerListingConfirmationAction } from "@/components/business/manage-actions";
import type { OwnerListingFacts } from "@/lib/business/owner-listing-confirmation";
import {
  validateOwnerListingConfirmation,
  type OwnerListingChangeField,
  type OwnerListingConfirmationInput,
} from "@/lib/submissions";

type Decision = OwnerListingConfirmationInput["decision"];

const CHANGE_OPTIONS: Array<{
  value: OwnerListingChangeField;
  label: string;
}> = [
  { value: "status", label: "Status" },
  { value: "hours", label: "Hours" },
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website" },
  { value: "other", label: "Something else" },
];

export default function ListingConfirmationPanel({
  token,
  facts,
  listingHref,
}: {
  token: string;
  facts: OwnerListingFacts;
  listingHref: string;
}) {
  const [decision, setDecision] = useState<Decision>("");
  const [changedFields, setChangedFields] = useState<
    OwnerListingChangeField[]
  >([]);
  const [submittedDecision, setSubmittedDecision] = useState<Decision>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canConfirm = Boolean(
    facts.status?.confirmable || facts.hours || facts.phone || facts.website,
  );

  const chooseDecision = (next: Decision) => {
    setDecision(next);
    setError(null);
    if (next === "confirmed") setChangedFields([]);
  };

  const toggleField = (field: OwnerListingChangeField) => {
    setChangedFields((current) =>
      current.includes(field)
        ? current.filter((candidate) => candidate !== field)
        : [...current, field],
    );
    setError(null);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: OwnerListingConfirmationInput = {
      decision,
      changed_fields: decision === "change" ? changedFields : [],
      proposed_status: String(data.get("proposed_status") ?? "") as
        OwnerListingConfirmationInput["proposed_status"],
      proposed_hours: String(data.get("proposed_hours") ?? ""),
      proposed_phone: String(data.get("proposed_phone") ?? ""),
      proposed_website: String(data.get("proposed_website") ?? ""),
      details: String(data.get("details") ?? ""),
    };
    const validationError = validateOwnerListingConfirmation(input);
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      try {
        await submitOwnerListingConfirmationAction(token, input);
        setSubmittedDecision(input.decision);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "We couldn’t send this listing check. Try again in a minute.",
        );
      }
    });
  };

  if (submittedDecision) {
    return (
      <section
        aria-labelledby="listing-check-title"
        className="mt-7 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5 shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3"
        >
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--app-positive)", color: "white" }}
          >
            <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </span>
          <div>
            <h2
              id="listing-check-title"
              className="font-serif text-[20px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              {submittedDecision === "confirmed"
                ? "Listing check received"
                : "Change sent for review"}
            </h2>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              {submittedDecision === "confirmed"
                ? "We recorded when you checked these details. Radius will review the confirmation before using it."
                : "Nothing changes publicly until Radius reviews the details you sent."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSubmittedDecision("");
            setDecision("");
            setChangedFields([]);
          }}
          className="tap-44 mt-3 text-[13px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Check the listing again
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="listing-check-title" className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="listing-check-title"
          className="font-serif text-[21px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Confirm listing
        </h2>
        <Link
          href={listingHref}
          className="tap-44 shrink-0 text-[12px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          View public page
        </Link>
      </div>
      <p
        id="listing-check-help"
        className="mt-1 text-[13px] leading-relaxed"
        style={{ color: "var(--app-ink-2)" }}
      >
        Check what Radius currently shows. A confirmation helps us keep the
        listing useful without changing anything automatically.
      </p>

      <CurrentFacts facts={facts} />

      <form
        onSubmit={onSubmit}
        aria-busy={pending}
        aria-describedby="listing-check-help listing-moderation-note"
        className="mt-4 space-y-4"
      >
        <fieldset disabled={pending}>
          <legend
            className="text-[13px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Are the listed details still right?
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <DecisionOption
              value="confirmed"
              checked={decision === "confirmed"}
              disabled={!canConfirm}
              icon={CheckCircle2}
              label="The details are current"
              description={
                canConfirm
                  ? "Send a dated confirmation for review."
                  : "No published details are ready to confirm."
              }
              onChange={() => chooseDecision("confirmed")}
            />
            <DecisionOption
              value="change"
              checked={decision === "change"}
              icon={PencilLine}
              label="Something needs changing"
              description="Tell Radius exactly what is different."
              onChange={() => chooseDecision("change")}
            />
          </div>
        </fieldset>

        {decision === "change" ? (
          <fieldset
            disabled={pending}
            className="rounded-[var(--app-radius-md)] border p-4"
            style={{ borderColor: "var(--app-border)" }}
          >
            <legend
              className="px-1 text-[13px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              What changed?
            </legend>
            <div className="flex flex-wrap gap-2">
              {CHANGE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="tap-44 inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] font-medium"
                  style={{
                    borderColor: changedFields.includes(option.value)
                      ? "var(--app-brand)"
                      : "var(--app-border)",
                    background: changedFields.includes(option.value)
                      ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))"
                      : "var(--app-bg-elevated)",
                    color: "var(--app-ink)",
                  }}
                >
                  <input
                    type="checkbox"
                    name="changed_fields"
                    value={option.value}
                    checked={changedFields.includes(option.value)}
                    onChange={() => toggleField(option.value)}
                    className="h-4 w-4 accent-[var(--app-brand)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {changedFields.includes("status") ? (
                <SelectField
                  name="proposed_status"
                  label="Current status"
                  required
                  options={[
                    ["", "Choose a status"],
                    ["operational", "Open and operating"],
                    ["closed_temporarily", "Temporarily closed"],
                    ["closed_permanently", "Permanently closed"],
                  ]}
                />
              ) : null}
              {changedFields.includes("hours") ? (
                <TextAreaField
                  name="proposed_hours"
                  label="Current weekly hours"
                  required
                  placeholder="Mon–Fri 8am–6pm; Sat 9am–2pm; closed Sun"
                />
              ) : null}
              {changedFields.includes("phone") ? (
                <TextField
                  name="proposed_phone"
                  label="Correct phone"
                  type="tel"
                  hint="Leave blank if the number should be removed."
                />
              ) : null}
              {changedFields.includes("website") ? (
                <TextField
                  name="proposed_website"
                  label="Correct website"
                  type="url"
                  placeholder="https://"
                  hint="Leave blank if the website should be removed."
                />
              ) : null}
              <TextAreaField
                name="details"
                label={
                  changedFields.includes("other")
                    ? "What else should change?"
                    : "Anything we should know? (optional)"
                }
                required={changedFields.includes("other")}
              />
            </div>
          </fieldset>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--app-radius-md)] px-3 py-2 text-[13px]"
            style={{
              background: "color-mix(in srgb, var(--app-danger) 10%, transparent)",
              color: "var(--app-danger)",
            }}
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="tap-44 inline-flex w-full items-center justify-center rounded-[var(--app-radius-md)] px-4 text-sm font-semibold shadow-[var(--app-shadow-1)] transition disabled:opacity-60"
          style={{
            background: "var(--app-brand-press)",
            color: "var(--app-on-brand)",
          }}
        >
          {pending
            ? "Sending…"
            : decision === "change"
              ? "Send change for review"
              : "Send listing check"}
        </button>
        <p
          id="listing-moderation-note"
          className="text-[11px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          Radius records when this was submitted. Every confirmation and change
          is reviewed before it can affect the public listing.
        </p>
      </form>
    </section>
  );
}

function CurrentFacts({ facts }: { facts: OwnerListingFacts }) {
  const hasFacts = Boolean(
    facts.status || facts.hours || facts.phone || facts.website,
  );

  return (
    <div
      className="mt-4 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      {hasFacts ? (
        <dl className="divide-y divide-[var(--app-border)]">
          {facts.status ? (
            <FactRow label="Status">
              <span>{facts.status.label}</span>
              {!facts.status.confirmable ? (
                <span
                  className="mt-0.5 block text-[11px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Tell us the current status under “Something needs changing.”
                </span>
              ) : null}
            </FactRow>
          ) : null}
          {facts.hours ? (
            <FactRow label="Hours">
              <ul className="space-y-0.5">
                {facts.hours.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {facts.hours.checkedAt ? (
                <span
                  className="mt-1 block text-[11px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Last checked {formatDate(facts.hours.checkedAt)}
                </span>
              ) : null}
            </FactRow>
          ) : null}
          {facts.phone ? (
            <FactRow label="Phone">
              <a
                href={`tel:${facts.phone.replace(/[^+\d]/g, "")}`}
                className="font-medium"
                style={{ color: "var(--app-cool)" }}
              >
                {facts.phone}
              </a>
            </FactRow>
          ) : null}
          {facts.website ? (
            <FactRow label="Website">
              <WebsiteFact value={facts.website} />
            </FactRow>
          ) : null}
        </dl>
      ) : (
        <p
          className="px-4 py-3 text-[13px]"
          style={{ color: "var(--app-ink-2)" }}
        >
          Radius does not have listing details to check yet. Choose “Something
          needs changing” to send the correct information.
        </p>
      )}
      {facts.listingCheckedAt ? (
        <p
          className="border-t px-4 py-2 text-[10px]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-3)",
          }}
        >
          Listing source last checked {formatDate(facts.listingCheckedAt)}
        </p>
      ) : null}
    </div>
  );
}

function FactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 px-4 py-3 text-[13px]">
      <dt className="font-medium" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </dt>
      <dd className="min-w-0" style={{ color: "var(--app-ink)" }}>
        {children}
      </dd>
    </div>
  );
}

function DecisionOption({
  value,
  checked,
  disabled = false,
  icon: Icon,
  label,
  description,
  onChange,
}: {
  value: "confirmed" | "change";
  checked: boolean;
  disabled?: boolean;
  icon: typeof CheckCircle2;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label
      className="relative flex min-h-24 cursor-pointer gap-3 rounded-[var(--app-radius-md)] border p-3 transition focus-within:ring-2 focus-within:ring-[var(--app-cool)]"
      style={{
        borderColor: checked ? "var(--app-brand)" : "var(--app-border)",
        background: checked
          ? "color-mix(in srgb, var(--app-brand) 9%, var(--app-bg-elevated))"
          : "var(--app-bg-elevated)",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="radio"
        name="listing_decision"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
      <Icon
        className="mt-0.5 h-5 w-5 shrink-0"
        style={{ color: checked ? "var(--app-brand)" : "var(--app-ink-3)" }}
        strokeWidth={2}
        aria-hidden
      />
      <span>
        <span
          className="block text-[13px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          {label}
        </span>
        <span
          className="mt-1 block text-[11px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          {description}
        </span>
      </span>
    </label>
  );
}

function WebsiteFact({ value }: { value: string }) {
  const href = safeWebsiteHref(value);
  if (!href) return <span className="break-all">{value}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all font-medium"
      style={{ color: "var(--app-cool)" }}
    >
      {websiteLabel(href)}
    </a>
  );
}

function TextField({
  name,
  label,
  type = "text",
  placeholder,
  hint,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        aria-describedby={hintId}
        className="mt-1 block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-cool)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
      {hint ? (
        <span
          id={hintId}
          className="mt-1 block text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function TextAreaField({
  name,
  label,
  required = false,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}
        {required ? <span style={{ color: "var(--app-brand)" }}> *</span> : null}
      </span>
      <textarea
        name={name}
        rows={3}
        required={required}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-cool)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      />
    </label>
  );
}

function SelectField({
  name,
  label,
  required = false,
  options,
}: {
  name: string;
  label: string;
  required?: boolean;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: "var(--app-ink-2)" }}>
        {label}
        {required ? <span style={{ color: "var(--app-brand)" }}> *</span> : null}
      </span>
      <select
        name={name}
        required={required}
        className="mt-1 block w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-cool)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      >
        {options.map(([value, text]) => (
          <option key={value || "empty"} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

function websiteLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function safeWebsiteHref(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

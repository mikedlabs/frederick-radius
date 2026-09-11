import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Check, X } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import {
  AdminShell,
  StatStrip,
  SectionLabel,
  HairlineList,
  AdminButton,
  Tag,
  StatusPill,
  FieldList,
  Notice,
  AllClear,
  type Tone,
} from "@/components/admin/kit";
import { reviewSubmission } from "./actions";

export const metadata: Metadata = {
  title: "Submission review · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Row = typeof submissions.$inferSelect;

async function loadRows(): Promise<
  { ok: true; rows: Row[] } | { ok: false; reason: string }
> {
  const db = getDb();
  if (!db) {
    return {
      ok: false,
      reason: "DATABASE_URL is not configured for this environment.",
    };
  }
  try {
    const rows = await db
      .select()
      .from(submissions)
      .orderBy(desc(submissions.created_at))
      .limit(100);
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      reason:
        "Could not read the submissions table. Apply migration 0005 with `npm run db:push`. " +
        (err instanceof Error ? err.message : ""),
    };
  }
}

export default async function ClaimsReviewPage() {
  const result = await loadRows();

  return (
    <AdminShell eyebrow="Moderation queue" title="Submission review">
      {!result.ok ? (
        <div className="mt-5">
          <Notice tone="warning">{result.reason}</Notice>
        </div>
      ) : (
        <Queue rows={result.rows} />
      )}
    </AdminShell>
  );
}

function Queue({ rows }: { rows: Row[] }) {
  // A queue is answered oldest-first: the longest-waiting submitter is the
  // one being let down right now. (The fetch is newest-first for the decided
  // log below; pending flips.)
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  const decided = rows.filter((r) => r.status !== "pending");
  const oldestDays = pending.length > 0 ? daysWaiting(pending[0].created_at) : 0;

  return (
    <>
      {/* Lead with the answer: how many are waiting, and for how long. */}
      <div className="mt-5">
        <StatStrip
          items={[
            {
              value: pending.length,
              label: "pending",
              tone: pending.length > 0 ? "brand" : "neutral",
            },
            ...(pending.length > 0
              ? [{
                  value: oldestDays >= 1 ? `${oldestDays}d` : "today",
                  label: "oldest waiting",
                  tone: waitTone(oldestDays),
                }]
              : []),
            { value: decided.length, label: "decided" },
          ]}
        />
      </div>

      <section className="mt-6">
        {pending.length === 0 ? (
          <AllClear>No submissions are waiting for review.</AllClear>
        ) : (
          <>
            <SectionLabel>Oldest first</SectionLabel>
            <ul className="space-y-3">
              {pending.map((s) => (
                <li key={s.id}>
                  <SubmissionCard row={s} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {decided.length > 0 ? (
        <section className="mt-8">
          <SectionLabel>Recently decided</SectionLabel>
          <HairlineList>
            {decided.slice(0, 25).map((s, i) => {
              // Approving a business claim mints the owner's manage_token — the
              // only credential to /business/manage. Surface it here so it's
              // copyable (delivery by email is a separate, owner-gated step).
              const manageUrl =
                s.status === "approved" && s.kind === "business_claim" && s.manage_token
                  ? `/business/manage/${s.manage_token}`
                  : null;
              return (
                <li
                  key={s.id}
                  className="bg-[var(--app-bg-elevated)] px-3 py-2.5"
                  style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="min-w-0 flex-1 truncate text-[13px]"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      {kindLabel(s.kind)} · {submissionTitle(s)}
                    </span>
                    <StatusPill tone={statusTone(s.status)}>{s.status}</StatusPill>
                  </div>
                  {manageUrl ? (
                    <a
                      href={manageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-44 mt-1 block truncate font-mono text-[11px]"
                      style={{ color: "var(--app-cool)" }}
                      title="Owner management link for this claim: send it to the claimant"
                    >
                      {manageUrl}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </HairlineList>
        </section>
      ) : null}
    </>
  );
}

function SubmissionCard({ row }: { row: Row }) {
  const entries = fieldEntries(row.payload);
  const days = daysWaiting(row.created_at);
  return (
    <article
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag tone="brand">{kindLabel(row.kind)}</Tag>
          <StatusPill tone={waitTone(days)}>
            {days >= 1 ? `waiting ${days}d` : "arrived today"}
          </StatusPill>
        </div>
        <span className="font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
        </span>
      </div>

      <h3
        className="mt-2 font-serif text-[18px] font-semibold"
        style={{ color: "var(--app-ink)" }}
      >
        {submissionTitle(row)}
      </h3>
      {row.place_slug ? (
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          binds to place: <code>{row.place_slug}</code>
        </p>
      ) : null}

      {entries.length > 0 ? (
        <div className="mt-3">
          <FieldList items={entries.map(([k, v]) => ({ label: k, value: v }))} />
        </div>
      ) : null}

      {isOwnerListingCheck(row.kind) ? (
        <div className="mt-3">
          <Notice tone="cool">
            This is owner-provided evidence. Approving records the moderation
            decision; it does not change the public listing automatically.
          </Notice>
        </div>
      ) : null}

      <form action={reviewSubmission} className="mt-4 grid grid-cols-2 gap-2">
        <input type="hidden" name="id" value={row.id} />
        <AdminButton
          type="submit"
          name="decision"
          value="rejected"
          variant="danger"
          icon={X}
          className="w-full justify-center"
        >
          Reject
        </AdminButton>
        <AdminButton
          type="submit"
          name="decision"
          value="approved"
          variant="positive"
          icon={Check}
          className="w-full justify-center"
        >
          Approve
        </AdminButton>
      </form>
    </article>
  );
}

function statusTone(status: string): Tone {
  if (status === "approved") return "positive";
  if (status === "rejected") return "danger";
  return "neutral";
}

/** Whole days an item has been waiting. Nothing waits a negative day. */
function daysWaiting(created: Date | string | null): number {
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000));
}

/** Shared urgency scale for waiting work: calm under 3 days, warning at 3,
 *  danger at 7. Matches /admin/reports so the desk speaks one language. */
function waitTone(days: number): Tone {
  return days >= 7 ? "danger" : days >= 3 ? "warning" : "neutral";
}

function fieldEntries(payload: unknown): [string, string][] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (
    record.via === "owner-manage" &&
    (record.action === "confirmed" || record.action === "change")
  ) {
    return ownerListingFieldEntries(record);
  }
  return Object.entries(record)
    .map(([k, v]) => [fieldLabel(k), displayValue(k, v)] as [string, string])
    .filter(([, v]) => v.trim() !== "");
}

function kindLabel(kind: string): string {
  if (kind === "business_claim") return "Business claim";
  if (kind === "listing_confirmation") return "Listing check";
  if (kind === "listing_change") return "Listing change";
  if (kind === "place") return "Place";
  if (kind === "event") return "Event";
  if (kind === "special") return "Special";
  return kind;
}

function submissionTitle(row: Row): string {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const candidate = p.business_name ?? p.name ?? p.title;
  if (typeof candidate === "string" && candidate.trim()) return candidate;
  return row.submitter_name || row.submitter_email || "Untitled submission";
}

function isOwnerListingCheck(kind: string): boolean {
  return kind === "listing_confirmation" || kind === "listing_change";
}

const OWNER_LISTING_FIELD_ORDER = [
  "action",
  "fields",
  "proposed_status",
  "proposed_hours",
  "proposed_phone",
  "proposed_website",
  "details",
  "current_status",
  "current_hours",
  "current_hours_checked_at",
  "current_phone",
  "current_website",
  "current_listing_checked_at",
  "observed_at",
  "review_by",
  "expires_at",
  "field_expires_at",
  "claim_submission_id",
] as const;

function ownerListingFieldEntries(
  payload: Record<string, unknown>,
): [string, string][] {
  return OWNER_LISTING_FIELD_ORDER.map((key) => [
    fieldLabel(key),
    displayValue(key, payload[key]),
  ] as [string, string]).filter(([, value]) => value.trim() !== "");
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    action: "Owner report",
    fields: "Details covered",
    proposed_status: "Proposed status",
    proposed_hours: "Proposed hours",
    proposed_phone: "Proposed phone",
    proposed_website: "Proposed website",
    details: "Owner note",
    current_status: "Current status",
    current_hours: "Current hours shown",
    current_hours_checked_at: "Hours last checked",
    current_phone: "Current phone",
    current_website: "Current website",
    current_listing_checked_at: "Listing last checked",
    observed_at: "Owner observed",
    review_by: "Review by",
    expires_at: "Evidence expires",
    field_expires_at: "Field refresh windows",
    claim_submission_id: "Approved claim",
  };
  return labels[key] ?? key.replaceAll("_", " ");
}

function displayValue(key: string, value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(humanizeCode).join(", ");
  if (key === "field_expires_at" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, string>;
      return Object.entries(parsed)
        .map(([field, expires]) => `${humanizeCode(field)}: ${formatAuditDate(expires)}`)
        .join(" · ");
    } catch {
      return value;
    }
  }
  if (
    typeof value === "string" &&
    [
      "observed_at",
      "review_by",
      "expires_at",
      "current_hours_checked_at",
      "current_listing_checked_at",
    ].includes(key)
  ) {
    return formatAuditDate(value);
  }
  if (value === "[remove]") return "Remove this value";
  if (
    typeof value === "string" &&
    ["action", "current_status", "proposed_status"].includes(key)
  ) {
    return humanizeCode(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanizeCode(value: unknown): string {
  const text = String(value);
  const known: Record<string, string> = {
    confirmed: "Details confirmed",
    change: "Change requested",
    operational: "Open and operating",
    closed_temporarily: "Temporarily closed",
    closed_permanently: "Permanently closed",
    needs_verification: "Not yet confirmed",
  };
  return known[text] ?? text.replaceAll("_", " ");
}

function formatAuditDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

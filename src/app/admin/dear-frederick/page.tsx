import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Check, X, Mail } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { dear_frederick_submissions } from "@/lib/db/schema";
import { hasLetterPublicationConsent } from "@/lib/dear-frederick/consent";
import {
  AdminShell,
  StatStrip,
  SectionLabel,
  HairlineList,
  AdminButton,
  Tag,
  StatusPill,
  EmptyState,
  AllClear,
  Notice,
  type Tone,
} from "@/components/admin/kit";
import { reviewLetterSubmission } from "./actions";

export const metadata: Metadata = {
  title: "Dear Frederick submissions · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Row = typeof dear_frederick_submissions.$inferSelect;

async function loadRows(): Promise<
  { ok: true; rows: Row[] } | { ok: false; reason: string }
> {
  const db = getDb();
  if (!db)
    return {
      ok: false,
      reason: "DATABASE_URL is not configured for this environment.",
    };
  try {
    const rows = await db
      .select()
      .from(dear_frederick_submissions)
      .orderBy(desc(dear_frederick_submissions.created_at))
      .limit(100);
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      reason:
        "Could not read dear_frederick_submissions. Apply migration 0027_dear_frederick_submissions.sql by hand. " +
        (err instanceof Error ? err.message : ""),
    };
  }
}

function statusTone(status: string): Tone {
  if (status === "approved") return "positive";
  if (status === "rejected") return "danger";
  return "neutral";
}

/** Whole days an item has been waiting. Nothing waits a negative day. */
function daysWaiting(created: Date | string | null): number {
  if (!created) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000),
  );
}

/** Shared urgency scale, matching the other admin queues. */
function waitTone(days: number): Tone {
  return days >= 7 ? "danger" : days >= 3 ? "warning" : "neutral";
}

export default async function DearFrederickSubmissionsPage() {
  const result = await loadRows();

  return (
    <AdminShell
      eyebrow="Moderation queue"
      title="Dear Frederick submissions"
      intro={
        result.ok
          ? "Read each submitted letter. Approve the ones that fit, then transcribe them into src/data/dear-frederick.ts by hand. Approving does not publish anything on its own."
          : undefined
      }
    >
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
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime(),
    );
  const decided = rows.filter((r) => r.status !== "pending");
  const oldestDays =
    pending.length > 0 ? daysWaiting(pending[0].created_at) : 0;

  return (
    <>
      <div className="mt-5">
        <StatStrip
          items={[
            {
              value: pending.length,
              label: "pending",
              tone: pending.length > 0 ? "brand" : "neutral",
            },
            ...(pending.length > 0
              ? [
                  {
                    value: oldestDays >= 1 ? `${oldestDays}d` : "today",
                    label: "oldest waiting",
                    tone: waitTone(oldestDays),
                  },
                ]
              : []),
            { value: decided.length, label: "decided" },
          ]}
        />
      </div>

      <section className="mt-6">
        {pending.length === 0 ? (
          <AllClear>No letters are waiting for review.</AllClear>
        ) : (
          <>
            <SectionLabel>Oldest first</SectionLabel>
            <ul className="space-y-3">
              {pending.map((r) => (
                <li key={r.id}>
                  <SubmissionCard row={r} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {decided.length > 0 ? (
        <section className="mt-8">
          <SectionLabel>Recently decided</SectionLabel>
          {decided.length === 0 ? (
            <EmptyState tone="muted">Nothing decided yet.</EmptyState>
          ) : (
            <HairlineList>
              {decided.slice(0, 25).map((r, i) => (
                <li
                  key={r.id}
                  className="bg-[var(--app-bg-elevated)] px-3 py-2.5"
                  style={
                    i > 0
                      ? { borderTop: "1px solid var(--app-border)" }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <a
                      href={r.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-[13px]"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      {r.signature || "Anonymous"}
                    </a>
                    <StatusPill tone={statusTone(r.status)}>
                      {r.status}
                    </StatusPill>
                  </div>
                </li>
              ))}
            </HairlineList>
          )}
        </section>
      ) : null}
    </>
  );
}

function SubmissionCard({ row }: { row: Row }) {
  const days = daysWaiting(row.created_at);
  const consentRecorded = hasLetterPublicationConsent(row.image_url);
  return (
    <article
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag tone="brand">
            <Mail
              className="mr-1 inline h-3 w-3"
              strokeWidth={2.25}
              aria-hidden
            />
            Letter
          </Tag>
          <StatusPill tone={waitTone(days)}>
            {days >= 1 ? `waiting ${days}d` : "arrived today"}
          </StatusPill>
          <StatusPill tone={consentRecorded ? "positive" : "warning"}>
            {consentRecorded ? "publication consent" : "consent not recorded"}
          </StatusPill>
        </div>
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
        </span>
      </div>

      {/* The scan is the letter. Show it prominently; it links to the full-size
          Blob so the owner can read every word before deciding. */}
      <a
        href={row.image_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block overflow-hidden rounded-[var(--app-radius-sm)] border bg-white p-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- admin-only preview of a submitted scan */}
        <img
          src={row.image_url}
          alt="Submitted letter scan"
          className="mx-auto max-h-80 w-auto rounded-[3px]"
        />
      </a>

      <dl className="mt-3 grid grid-cols-[minmax(0,6rem)_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        <dt
          className="font-mono text-[11px] uppercase tracking-[0.06em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Signature
        </dt>
        <dd style={{ color: "var(--app-ink)" }}>
          {row.signature || "Anonymous"}
        </dd>
        {row.contact ? (
          <>
            <dt
              className="font-mono text-[11px] uppercase tracking-[0.06em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Contact
            </dt>
            <dd className="break-words" style={{ color: "var(--app-ink)" }}>
              {row.contact}
            </dd>
          </>
        ) : null}
        {row.note ? (
          <>
            <dt
              className="font-mono text-[11px] uppercase tracking-[0.06em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Note
            </dt>
            <dd
              className="whitespace-pre-wrap break-words"
              style={{ color: "var(--app-ink)" }}
            >
              {row.note}
            </dd>
          </>
        ) : null}
      </dl>

      <form
        action={reviewLetterSubmission}
        className="mt-4 grid grid-cols-2 gap-2"
      >
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
          disabled={!consentRecorded}
          title={
            consentRecorded
              ? undefined
              : "Contact the sender and record permission before approval."
          }
        >
          Approve
        </AdminButton>
      </form>
    </article>
  );
}

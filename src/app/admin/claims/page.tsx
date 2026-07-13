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
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <>
      {/* Lead with the answer: how many are waiting, how many are settled. */}
      <div className="mt-5">
        <StatStrip
          items={[
            {
              value: pending.length,
              label: "pending",
              tone: pending.length > 0 ? "brand" : "neutral",
            },
            { value: decided.length, label: "decided" },
          ]}
        />
      </div>

      <section className="mt-6">
        {pending.length === 0 ? (
          <AllClear>Nothing waiting. All caught up.</AllClear>
        ) : (
          <ul className="space-y-3">
            {pending.map((s) => (
              <li key={s.id}>
                <SubmissionCard row={s} />
              </li>
            ))}
          </ul>
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
  return (
    <article
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <Tag tone="brand">{kindLabel(row.kind)}</Tag>
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

function fieldEntries(payload: unknown): [string, string][] {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>)
    .map(([k, v]) => [k, v == null ? "" : String(v)] as [string, string])
    .filter(([, v]) => v.trim() !== "");
}

function kindLabel(kind: string): string {
  if (kind === "business_claim") return "Business claim";
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

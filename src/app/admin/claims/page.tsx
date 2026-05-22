import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Check, X } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
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
    <div
      className="mx-auto max-w-screen-md px-4 py-8"
      style={{ background: "var(--app-bg)" }}
    >
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>
        ← Admin
      </Link>
      <header className="mt-4 space-y-1">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Moderation queue
        </p>
        <h1
          className="font-serif text-[28px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Submission review
        </h1>
      </header>

      {!result.ok ? (
        <p
          className="mt-6 rounded-[var(--app-radius-lg)] border p-5 text-[13px] leading-relaxed"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          {result.reason}
        </p>
      ) : (
        <Queue rows={result.rows} />
      )}
    </div>
  );
}

function Queue({ rows }: { rows: Row[] }) {
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <>
      <p className="mt-4 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        {pending.length} pending · {decided.length} decided
      </p>

      {pending.length === 0 ? (
        <p
          className="mt-6 rounded-[var(--app-radius-lg)] border p-6 text-center font-serif text-[18px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
        >
          Nothing waiting. All caught up.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {pending.map((s) => (
            <li key={s.id}>
              <SubmissionCard row={s} />
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 ? (
        <section className="mt-8">
          <h2
            className="text-xs font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Recently decided
          </h2>
          <ul className="mt-2 space-y-1">
            {decided.slice(0, 25).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2 text-[13px]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="truncate" style={{ color: "var(--app-ink-2)" }}>
                  {kindLabel(s.kind)} · {submissionTitle(s)}
                </span>
                <StatusPill status={s.status} />
              </li>
            ))}
          </ul>
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
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
            color: "var(--app-brand)",
          }}
        >
          {kindLabel(row.kind)}
        </span>
        <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
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
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          binds to place: <code>{row.place_slug}</code>
        </p>
      ) : null}

      <dl className="mt-3 space-y-1 text-[13px]">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt
              className="w-32 shrink-0 font-medium"
              style={{ color: "var(--app-ink-3)" }}
            >
              {k}
            </dt>
            <dd
              className="min-w-0 break-words"
              style={{ color: "var(--app-ink-2)" }}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>

      <form action={reviewSubmission} className="mt-4 grid grid-cols-2 gap-2">
        <input type="hidden" name="id" value={row.id} />
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="inline-flex items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] py-2.5 text-[13px] font-semibold text-white active:scale-[0.97]"
          style={{ background: "var(--app-danger)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Reject
        </button>
        <button
          type="submit"
          name="decision"
          value="approved"
          className="inline-flex items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] py-2.5 text-[13px] font-semibold text-white active:scale-[0.97]"
          style={{ background: "var(--app-positive)" }}
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Approve
        </button>
      </form>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "approved"
      ? "var(--app-positive)"
      : status === "rejected"
        ? "var(--app-danger)"
        : "var(--app-ink-3)";
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
      }}
    >
      {status}
    </span>
  );
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
  return kind;
}

function submissionTitle(row: Row): string {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const candidate = p.business_name ?? p.name ?? p.title;
  if (typeof candidate === "string" && candidate.trim()) return candidate;
  return row.submitter_name || row.submitter_email || "Untitled submission";
}

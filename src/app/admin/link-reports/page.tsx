import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Check, EyeOff, Trash2, Link2 } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { commerce_link_reports } from "@/lib/db/schema";
import {
  AdminShell,
  StatStrip,
  StatusPill,
  Tag,
  AdminButton,
  EmptyState,
  Notice,
  type Tone,
} from "@/components/admin/kit";
import { reviewLinkReport } from "./actions";

/**
 * /admin/link-reports — the review queue for "this order/menu/reserve link is
 * broken" reports. The public write path (/api/commerce/report-link) had run
 * for months with NO reader: a user flagging a dead ordering link produced a
 * row nothing ever looked at, which severed the correction loop the commerce
 * layer depends on (wire-the-unwired audit, finding 6). Same desk language as
 * /admin/reports: pending work first, oldest at the top, one-tap decisions.
 */

export const metadata: Metadata = {
  title: "Link reports · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Row = typeof commerce_link_reports.$inferSelect;

async function loadRows(): Promise<
  { ok: true; rows: Row[] } | { ok: false; reason: string }
> {
  const db = getDb();
  if (!db) return { ok: false, reason: "DATABASE_URL is not configured for this environment." };
  try {
    const rows = await db
      .select()
      .from(commerce_link_reports)
      .orderBy(desc(commerce_link_reports.created_at))
      .limit(200);
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      reason:
        "Could not read commerce_link_reports. " +
        (err instanceof Error ? err.message : ""),
    };
  }
}

function statusTone(status: string): Tone {
  if (status === "open") return "warning";
  if (status === "fixed") return "positive";
  if (status === "dismissed") return "muted";
  return "neutral";
}

function daysWaiting(created: Date | string | null): number {
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000));
}

/** Same urgency scale as /admin/reports and /admin/claims: calm under 3
 *  days, warning at 3, danger at 7 — the desk speaks one language. */
function waitTone(days: number): Tone {
  return days >= 7 ? "danger" : days >= 3 ? "warning" : "neutral";
}

function ReportRow({ r, first, showAge }: { r: Row; first: boolean; showAge?: boolean }) {
  const days = daysWaiting(r.created_at);
  return (
    <li style={first ? undefined : { borderTop: "1px solid var(--app-border)" }}>
      <div className="bg-[var(--app-bg-elevated)] px-3 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/places/${r.place_slug}`}
              className="text-[14px] font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--app-ink)" }}
            >
              {r.place_name?.trim() || r.place_slug}
            </Link>
            {r.link_type ? <Tag tone="neutral">{r.link_type}</Tag> : null}
            {r.provider ? <Tag tone="neutral">{r.provider}</Tag> : null}
            <StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill>
            {showAge ? (
              <StatusPill tone={waitTone(days)}>
                {days >= 1 ? `waiting ${days}d` : "arrived today"}
              </StatusPill>
            ) : null}
          </div>
          {r.url ? (
            <p className="mt-1.5 break-all font-mono text-[11px]" style={{ color: "var(--app-ink-2)" }}>
              {r.url}
            </p>
          ) : null}
          {r.note ? (
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {r.note}
            </p>
          ) : null}
          <p className="mt-1.5 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {r.issue_type}
            {r.link_ref ? ` · ref ${r.link_ref}` : ""}
            {r.created_at ? ` · ${new Date(r.created_at).toLocaleString()}` : ""}
          </p>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {r.status !== "fixed" && (
            <form action={reviewLinkReport}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="fixed" />
              <AdminButton type="submit" variant="positive" icon={Check}>
                Fixed
              </AdminButton>
            </form>
          )}
          {r.status !== "dismissed" && (
            <form action={reviewLinkReport}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="dismissed" />
              <AdminButton type="submit" variant="ghost" icon={EyeOff}>
                Dismiss
              </AdminButton>
            </form>
          )}
          <form action={reviewLinkReport}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="decision" value="delete" />
            <AdminButton type="submit" variant="ghost" icon={Trash2}>
              Delete
            </AdminButton>
          </form>
        </div>
      </div>
    </li>
  );
}

export default async function LinkReportsPage() {
  const result = await loadRows();
  const rows = result.ok ? result.rows : [];
  // Triage order: open reports first, oldest at the top (a dead ordering
  // link is losing someone dinner every night it stays dead), then the
  // resolved log newest-first as fetched.
  const open = rows
    .filter((r) => r.status === "open")
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  const resolved = rows.filter((r) => r.status !== "open");
  const fixed = rows.filter((r) => r.status === "fixed").length;
  const oldestDays = open.length > 0 ? daysWaiting(open[0].created_at) : 0;

  return (
    <AdminShell
      title="Link reports"
      eyebrow="Correction queue"
      back={{ href: "/admin", label: "Admin" }}
      intro={
        result.ok
          ? "Broken order, menu, and reservation links flagged by visitors. Fix the place record, then mark the report."
          : undefined
      }
    >
      {!result.ok ? (
        <div className="mt-5">
          <Notice tone="warning">{result.reason}</Notice>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Link2}>No link reports yet.</EmptyState>
      ) : (
        <>
          <div className="mt-5">
            <StatStrip
              items={[
                { value: open.length, label: "open", tone: open.length > 0 ? "warning" : "neutral" },
                ...(open.length > 0
                  ? [{
                      value: oldestDays >= 1 ? `${oldestDays}d` : "today",
                      label: "oldest waiting",
                      tone: waitTone(oldestDays),
                    }]
                  : []),
                { value: fixed, label: "fixed" },
                { value: rows.length, label: "total" },
              ]}
            />
          </div>
          <ul className="mt-5 overflow-hidden rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
            {open.map((r, i) => (
              <ReportRow key={r.id} r={r} first={i === 0} showAge />
            ))}
            {resolved.map((r, i) => (
              <ReportRow key={r.id} r={r} first={open.length === 0 && i === 0} />
            ))}
          </ul>
        </>
      )}
    </AdminShell>
  );
}

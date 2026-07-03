import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_emails } from "@/lib/db/schema";

/**
 * /admin/beta-emails — the launch-announcement list, owner-only.
 *
 * Gated by the same middleware Basic Auth as the rest of /admin/*. Reads the
 * `beta_emails` table the /beta signup writes to, newest first, with a CSV
 * download (see ./export/route.ts). Fail-soft: no DB or an unmigrated table
 * shows an honest empty state instead of erroring.
 */
export const metadata: Metadata = {
  title: "Beta emails · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function BetaEmailsAdmin() {
  const db = getDb();
  let rows: { email: string; source: string | null; created_at: Date | null }[] = [];
  let dbError = false;
  if (db) {
    try {
      rows = await db
        .select({ email: beta_emails.email, source: beta_emails.source, created_at: beta_emails.created_at })
        .from(beta_emails)
        .orderBy(desc(beta_emails.created_at));
    } catch {
      dbError = true;
    }
  }

  const fmt = (d: Date | null) =>
    d ? new Date(d).toLocaleString("en-US", { timeZone: "America/New_York" }) : "·";

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>← Admin</Link>

      <header className="mt-4 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            Launch announcement list
          </p>
          <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Beta emails
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-serif text-[26px] font-semibold tabular-nums leading-none" style={{ color: "var(--app-ink)" }}>
            {rows.length.toLocaleString()}
          </span>
          {rows.length > 0 && (
            <a
              href="/admin/beta-emails/export"
              className="rounded-[var(--app-radius-md)] px-3 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--app-ink)" }}
            >
              Download CSV
            </a>
          )}
        </div>
      </header>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Everyone who left an email on <code>/beta</code> (the signup writes to the
        <code> beta_emails</code> table; duplicates are de-duped by a unique index).
        Deleting a row in Supabase is the entire unsubscribe story until a real
        email service is wired in.
      </p>

      {dbError ? (
        <p
          className="mt-6 rounded-[var(--app-radius-md)] px-3 py-2 text-[13px]"
          style={{ background: "color-mix(in srgb, var(--app-warning) 12%, var(--app-bg-elevated))", color: "var(--app-warning)" }}
        >
          Could not read the <code>beta_emails</code> table. It may not be migrated in this environment
          (see <code>drizzle/0015_beta_emails.sql</code>).
        </p>
      ) : !db ? (
        <p
          className="mt-6 rounded-[var(--app-radius-md)] px-3 py-2 text-[13px]"
          style={{ background: "color-mix(in srgb, var(--app-ink) 5%, var(--app-bg-elevated))", color: "var(--app-ink-3)" }}
        >
          No database configured in this environment.
        </p>
      ) : rows.length === 0 ? (
        <p
          className="mt-6 rounded-[var(--app-radius-md)] px-3 py-2 text-[13px]"
          style={{ background: "color-mix(in srgb, var(--app-positive) 10%, var(--app-bg-elevated))", color: "var(--app-ink-2)" }}
        >
          No signups yet. They will appear here the moment someone leaves an email on the beta page.
        </p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr style={{ color: "var(--app-ink-3)" }}>
              <th className="py-1 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Email</th>
              <th className="py-1 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Source</th>
              <th className="py-1 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Signed up (ET)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email} className="border-b" style={{ borderColor: "var(--app-border)" }}>
                <td className="py-2 pr-3 font-medium" style={{ color: "var(--app-ink)" }}>{r.email}</td>
                <td className="py-2 pr-3 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>{r.source ?? "·"}</td>
                <td className="py-2 text-right tabular-nums text-[12px]" style={{ color: "var(--app-ink-3)" }}>{fmt(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

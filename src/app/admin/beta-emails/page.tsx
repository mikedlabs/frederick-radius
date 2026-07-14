import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Database, Inbox } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { beta_codes, beta_emails } from "@/lib/db/schema";
import {
  AdminShell,
  SectionLabel,
  StatStrip,
  Notice,
  EmptyState,
  Table,
  THead,
  Th,
  TBody,
  Tr,
  Td,
  AdminButton,
} from "@/components/admin/kit";
import { sendAllCodes } from "./actions";

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

export default async function BetaEmailsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; emailed?: string; failed?: string }>;
}) {
  const { invited, emailed, failed } = await searchParams;
  const db = getDb();
  let rows: { email: string; source: string | null; created_at: Date | null }[] = [];
  let codeByEmail = new Map<string, { code: string; redeemed: boolean }>();
  let dbError = false;
  if (db) {
    try {
      rows = await db
        .select({ email: beta_emails.email, source: beta_emails.source, created_at: beta_emails.created_at })
        .from(beta_emails)
        .orderBy(desc(beta_emails.created_at));
      // Sequential after the first read on purpose (max:1 pooled connection).
      const codes = await db
        .select({ code: beta_codes.code, label: beta_codes.label, redeemed_at: beta_codes.redeemed_at, revoked: beta_codes.revoked })
        .from(beta_codes);
      codeByEmail = new Map(
        codes
          .filter((c) => c.label && !c.revoked)
          .map((c) => [c.label as string, { code: c.code, redeemed: Boolean(c.redeemed_at) }]),
      );
    } catch {
      dbError = true;
    }
  }
  const uninvited = rows.filter((r) => !codeByEmail.has(r.email)).length;
  const invitedCount = rows.length - uninvited;
  const redeemedCount = rows.filter((r) => codeByEmail.get(r.email)?.redeemed).length;
  const resendWired = Boolean(process.env.RESEND_API_KEY);

  const fmt = (d: Date | null) =>
    d ? new Date(d).toLocaleString("en-US", { timeZone: "America/New_York" }) : "·";

  // Tone-aware flash: green on a clean run, amber when something failed or the
  // codes minted but no email went out. Copy stays exactly as before.
  const flashTone =
    Number(failed) > 0 || (Number(invited) > 0 && Number(emailed) === 0) ? "warning" : "positive";

  // A plain anchor to the CSV route handler (NOT a client fetch, NOT a new tab):
  // it must stay under /admin/* so the middleware Basic-Auth gate covers it.
  const csvDownload =
    rows.length > 0 ? (
      <a
        href="/admin/beta-emails/export"
        className="tap-44 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-cool)" }}
      >
        Download CSV
      </a>
    ) : null;

  return (
    <AdminShell
      eyebrow="Launch announcement list"
      title="Beta emails"
      intro={
        <>
          Everyone who left an email on <code>/beta</code> (the signup writes to the{" "}
          <code>beta_emails</code> table; duplicates are de-duped by a unique index). New signups
          are invited automatically; the button below covers everyone who signed up before invites
          existed.
        </>
      }
    >
      {invited !== undefined ? (
        <div className="mt-5">
          <Notice tone={flashTone}>
            Minted {invited} {Number(invited) === 1 ? "code" : "codes"}, emailed {emailed}
            {Number(failed) > 0 ? `, ${failed} failed (see logs)` : ""}.
            {Number(invited) > 0 && Number(emailed) === 0
              ? " Emails were not sent because RESEND_API_KEY is not set."
              : ""}
          </Notice>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-6">
          <StatStrip
            items={[
              { value: rows.length.toLocaleString(), label: "signups" },
              { value: invitedCount.toLocaleString(), label: "invited" },
              {
                value: redeemedCount.toLocaleString(),
                label: "redeemed",
                tone: redeemedCount > 0 ? "positive" : "neutral",
              },
            ]}
          />
          {/* CSV export lives here, gated on rows only: it must stay reachable
              even if the codes read throws (dbError) after the emails read
              succeeded. The export route re-reads beta_emails independently. */}
          <div className="mt-3 flex justify-end">{csvDownload}</div>
        </div>
      ) : null}

      {rows.length > 0 && uninvited > 0 ? (
        <form action={sendAllCodes} className="mt-6 flex flex-wrap items-center gap-3">
          <AdminButton variant="primary" type="submit">
            Mint + email codes to {uninvited} {uninvited === 1 ? "person" : "people"}
          </AdminButton>
          <span className="text-[12px]" style={{ color: resendWired ? "var(--app-ink-3)" : "var(--app-warning-press)" }}>
            {resendWired
              ? "Sends each person their personal access code via Resend."
              : "RESEND_API_KEY is not set: codes will mint but no email goes out."}
          </span>
        </form>
      ) : null}

      <div className="mt-6">
        {dbError ? (
          <Notice tone="warning">
            Could not read the <code>beta_emails</code> table. It may not be migrated in this
            environment (see <code>drizzle/0015_beta_emails.sql</code>).
          </Notice>
        ) : !db ? (
          <EmptyState tone="muted" icon={Database}>
            No database configured in this environment.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox}>
            No signups yet. They will appear here the moment someone leaves an email on the beta page.
          </EmptyState>
        ) : (
          <>
            <SectionLabel>The list</SectionLabel>
            <Table>
              <THead>
                <Th>Email</Th>
                <Th>Code</Th>
                <Th>Source</Th>
                <Th align="right">Signed up (ET)</Th>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const c = codeByEmail.get(r.email);
                  const codeTone = c ? (c.redeemed ? "positive" : "neutral") : "muted";
                  return (
                    <Tr key={r.email}>
                      <Td semibold>{r.email}</Td>
                      <Td mono tone={codeTone}>
                        {c ? `${c.code}${c.redeemed ? " · in" : ""}` : "·"}
                      </Td>
                      <Td mono tone="muted">
                        {r.source ?? "·"}
                      </Td>
                      <Td align="right" tone="muted" nums>
                        {fmt(r.created_at)}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </>
        )}
      </div>
    </AdminShell>
  );
}

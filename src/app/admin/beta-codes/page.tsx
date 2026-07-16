import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes } from "@/lib/db/schema";
import {
  AdminShell,
  Section,
  SectionLabel,
  StatStrip,
  HairlineList,
  EmptyState,
  Callout,
  AdminButton,
  Field,
  TextInput,
} from "@/components/admin/kit";
import { generateCodes, setRevoked } from "./actions";

export const metadata: Metadata = {
  title: "Beta codes",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type CodeRow = {
  code: string;
  label: string | null;
  revoked: boolean;
  uses: number;
  redeemed_at: Date | null;
  last_seen_at: Date | null;
  created_at: Date | null;
};

function fmt(d: Date | null): string {
  if (!d) return "-";
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function BetaCodesAdmin() {
  const db = getDb();
  let rows: CodeRow[] = [];
  let dbError = false;
  if (db) {
    try {
      rows = await db
        .select({
          code: beta_codes.code,
          label: beta_codes.label,
          revoked: beta_codes.revoked,
          uses: beta_codes.uses,
          redeemed_at: beta_codes.redeemed_at,
          last_seen_at: beta_codes.last_seen_at,
          created_at: beta_codes.created_at,
        })
        .from(beta_codes)
        .orderBy(desc(beta_codes.created_at));
    } catch {
      dbError = true;
    }
  }

  const active = rows.filter((r) => !r.revoked);
  const redeemed = active.filter((r) => r.redeemed_at).length;
  const revokedCount = rows.length - active.length;

  return (
    <AdminShell
      back={{ href: "/admin", label: "Back to Admin" }}
      eyebrow="Beta access"
      title="Beta codes"
      intro="Give each tester their own code. Revocation blocks new and renewed sessions for that code; an existing session can remain open for up to 12 hours. The shared password still works as your master key."
    >
      {dbError && (
        <div className="mt-4">
          <Callout tone="warning" title="Beta codes table not migrated">
            Run <code>drizzle/0016_beta_codes.sql</code> in the Supabase SQL editor,
            then reload.
          </Callout>
        </div>
      )}

      {/* Mint — the one primary action on the page. */}
      <Section title="Mint a code" description="Optional name, then hand off the code you generate.">
        <form action={generateCodes} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <Field label="Who is it for?" hint="Optional">
              <TextInput type="text" name="label" placeholder="Jane from the co-op" />
            </Field>
          </div>
          <div className="w-24">
            <Field label="How many">
              <TextInput
                type="number"
                name="count"
                defaultValue={1}
                min={1}
                max={50}
                className="tabular-nums"
              />
            </Field>
          </div>
          <AdminButton type="submit" variant="primary" icon={KeyRound}>
            Generate
          </AdminButton>
        </form>
      </Section>

      {/* Summary — supporting glance, hairline dividers not boxes. */}
      <section className="mt-8">
        <SectionLabel>Summary</SectionLabel>
        <StatStrip
          items={[
            { value: active.length, label: "Active codes" },
            { value: redeemed, label: "Redeemed", tone: "positive" },
            { value: revokedCount, label: "Revoked", tone: "warning" },
          ]}
        />
      </section>

      {/* All codes — one hairline list, per-row revoke/restore stays a native
          server-action form (the kit HairlineRow is display-only). */}
      <Section title="All codes">
        {rows.length === 0 ? (
          <EmptyState>No codes yet. Generate one above to hand to your first tester.</EmptyState>
        ) : (
          <div className="mt-3">
            <HairlineList>
              {rows.map((r, i) => (
                <li key={r.code} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                  <div
                    className="flex items-center gap-3 px-3 py-2.5"
                    style={{ background: "var(--app-bg-elevated)", opacity: r.revoked ? 0.55 : 1 }}
                  >
                    <div className="min-w-0 flex-1">
                      <code
                        className="font-mono text-[14px] font-semibold"
                        style={{
                          color: r.revoked ? "var(--app-ink-3)" : "var(--app-brand-press)",
                          textDecoration: r.revoked ? "line-through" : "none",
                        }}
                      >
                        {r.code}
                      </code>
                      <div
                        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {r.label && <span style={{ color: "var(--app-ink-2)" }}>{r.label}</span>}
                        <span className="font-mono tabular-nums">
                          {r.redeemed_at ? `first in ${fmt(r.redeemed_at)}` : "never used"}
                        </span>
                        <span aria-hidden>·</span>
                        <span className="font-mono tabular-nums">
                          {r.uses} {r.uses === 1 ? "use" : "uses"}
                        </span>
                        {r.last_seen_at && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="font-mono tabular-nums">last seen {fmt(r.last_seen_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <form action={setRevoked} className="shrink-0">
                      <input type="hidden" name="code" value={r.code} />
                      <input type="hidden" name="revoked" value={r.revoked ? "0" : "1"} />
                      <AdminButton type="submit" variant={r.revoked ? "positive" : "danger"}>
                        {r.revoked ? "Restore" : "Revoke"}
                      </AdminButton>
                    </form>
                  </div>
                </li>
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Codes are validated against the database at redeem time, then carried in a
        signed cookie the edge middleware verifies with no further DB hit. Revoking
        a code stops new or renewed sessions; an already-unlocked device keeps its
        session for at most 12 hours. For planned signing-key rotation, set the old
        value as <code>BETA_CODE_SECRET_PREVIOUS</code> for a 12-hour grace period.
        For emergency invalidation, rotate <code>BETA_CODE_SECRET</code> without a
        previous value and redeploy.
      </p>
    </AdminShell>
  );
}

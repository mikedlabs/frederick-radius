import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes } from "@/lib/db/schema";
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

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>
        ← Back to Admin
      </Link>

      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Beta access
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Beta codes
        </h1>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Give each tester their own code. Usage is attributed to the code in
          analytics, and you can revoke one person without touching anyone else.
          The shared password still works as your master key.
        </p>
      </header>

      {dbError && (
        <p
          className="mt-4 rounded-[var(--app-radius-md)] border px-3 py-2 text-[12.5px]"
          style={{ borderColor: "var(--app-warning)", color: "var(--app-warning)" }}
        >
          The beta_codes table isn&rsquo;t migrated yet. Run
          <code className="mx-1">drizzle/0016_beta_codes.sql</code> in the Supabase
          SQL editor, then reload.
        </p>
      )}

      {/* Generate */}
      <section className="mt-6">
        <form
          action={generateCodes}
          className="flex flex-wrap items-end gap-3 rounded-[var(--app-radius-lg)] border p-4"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <label className="flex-1 min-w-[180px] text-[12px]" style={{ color: "var(--app-ink-2)" }}>
            Who is it for? (optional)
            <input
              type="text"
              name="label"
              placeholder="Jane from the co-op"
              className="mt-1 w-full rounded-[var(--app-radius-md)] border px-3 py-2 text-[14px]"
              style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }}
            />
          </label>
          <label className="w-20 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
            How many
            <input
              type="number"
              name="count"
              defaultValue={1}
              min={1}
              max={50}
              className="mt-1 w-full rounded-[var(--app-radius-md)] border px-3 py-2 text-[14px] tabular-nums"
              style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }}
            />
          </label>
          <button
            type="submit"
            className="rounded-[var(--app-radius-md)] px-4 py-2 text-[14px] font-semibold"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
          >
            Generate
          </button>
        </form>
      </section>

      {/* Summary */}
      <section className="mt-6 grid grid-cols-3 gap-2">
        <Stat label="Active codes" value={active.length} />
        <Stat label="Redeemed" value={redeemed} tone="positive" />
        <Stat label="Revoked" value={rows.length - active.length} tone="warning" />
      </section>

      {/* List */}
      <section className="mt-6 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          All codes
        </h2>
        {rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            No codes yet. Generate one above to hand to your first tester.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.code}
                className="rounded-[var(--app-radius-md)] border px-3 py-2.5"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                  opacity: r.revoked ? 0.55 : 1,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <code
                    className="font-mono text-[14px] font-semibold"
                    style={{ color: r.revoked ? "var(--app-ink-3)" : "var(--app-brand-press)", textDecoration: r.revoked ? "line-through" : "none" }}
                  >
                    {r.code}
                  </code>
                  <form action={setRevoked}>
                    <input type="hidden" name="code" value={r.code} />
                    <input type="hidden" name="revoked" value={r.revoked ? "0" : "1"} />
                    <button
                      type="submit"
                      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                      style={{
                        borderColor: r.revoked ? "var(--app-positive)" : "var(--app-danger)",
                        color: r.revoked ? "var(--app-positive)" : "var(--app-danger)",
                      }}
                    >
                      {r.revoked ? "Restore" : "Revoke"}
                    </button>
                  </form>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                  {r.label && <span style={{ color: "var(--app-ink-2)" }}>{r.label}</span>}
                  <span>{r.redeemed_at ? `first in ${fmt(r.redeemed_at)}` : "never used"}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{r.uses} {r.uses === 1 ? "unlock" : "unlocks"}</span>
                  {r.last_seen_at && (
                    <>
                      <span aria-hidden>·</span>
                      <span>last seen {fmt(r.last_seen_at)}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Codes are validated against the database at redeem time, then carried in a
        signed cookie the edge middleware verifies with no further DB hit. Revoking
        a code stops new unlocks; an already-unlocked device keeps its 30-day cookie
        until it expires or the master password is rotated.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "positive" | "warning" }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "warning" ? "var(--app-warning)" : "var(--app-ink)";
  return (
    <div className="rounded-[var(--app-radius-md)] border p-3 text-center" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>{label}</p>
    </div>
  );
}

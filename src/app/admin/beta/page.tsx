import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Check, X } from "lucide-react";
import { getDb } from "@/lib/db/client";
import {
  beta_codes,
  beta_emails,
  community_reports,
  follows,
  push_subscriptions,
  saved_events,
  submissions,
} from "@/lib/db/schema";
import { easternDayKey } from "@/lib/tz";
import OwnerAlertsCard from "@/components/admin/OwnerAlertsCard";
import { resolveFeedback } from "./actions";

export const metadata: Metadata = {
  title: "Beta dashboard · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type FeedbackRow = typeof submissions.$inferSelect;
type SignupRow = { email: string; created_at: Date | null };
type CodeRow = {
  code: string;
  label: string | null;
  revoked: boolean;
  uses: number;
  last_seen_at: Date | null;
};

type Data = {
  feedback: FeedbackRow[];
  signups: SignupRow[];
  codes: CodeRow[];
  pushDevices: number;
  followCount: number;
  saveCount: number;
  reportsPending: number;
  /** Load-time epoch ms; components stay pure by reading time from here. */
  now: number;
};

async function load(): Promise<{ ok: true; data: Data } | { ok: false; reason: string }> {
  const now = Date.now();
  const db = getDb();
  if (!db) {
    return { ok: false, reason: "DATABASE_URL is not configured for this environment." };
  }
  const n = sql<number>`count(*)::int`;
  try {
    // Sequential on purpose: getDb() talks to Supavisor transaction pooling
    // with max:1 + prepare:false, and concurrent queries (Promise.all) get
    // pipelined down the one pooled connection, which Supavisor does not
    // answer — the render hangs forever. One-at-a-time always completes,
    // and seven small reads cost well under a second on this admin page.
    const feedback = await db
      .select()
      .from(submissions)
      .where(eq(submissions.kind, "feedback"))
      .orderBy(desc(submissions.created_at))
      .limit(200);
    const signups = await db
      .select({ email: beta_emails.email, created_at: beta_emails.created_at })
      .from(beta_emails)
      .orderBy(desc(beta_emails.created_at))
      .limit(500);
    const codes = await db
      .select({
        code: beta_codes.code,
        label: beta_codes.label,
        revoked: beta_codes.revoked,
        uses: beta_codes.uses,
        last_seen_at: beta_codes.last_seen_at,
      })
      .from(beta_codes)
      .orderBy(desc(beta_codes.last_seen_at));
    const push = await db.select({ n }).from(push_subscriptions);
    const followRows = await db.select({ n }).from(follows);
    const saves = await db.select({ n }).from(saved_events);
    const reports = await db
      .select({ n })
      .from(community_reports)
      .where(eq(community_reports.status, "pending"));
    return {
      ok: true,
      data: {
        feedback,
        signups,
        codes,
        pushDevices: push[0]?.n ?? 0,
        followCount: followRows[0]?.n ?? 0,
        saveCount: saves[0]?.n ?? 0,
        reportsPending: reports[0]?.n ?? 0,
        now,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason:
        "Could not read the beta tables. " + (err instanceof Error ? err.message : String(err)),
    };
  }
}

export default async function BetaDashboard() {
  const result = await load();

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>
        ← Admin
      </Link>

      <header className="mt-4 space-y-1">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Beta program
        </p>
        <h1
          className="font-serif text-[28px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Beta dashboard
        </h1>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Signups, tester feedback, and activity in one place. Notes from the
          in-app widget land here the moment a tester sends them.
        </p>
      </header>

      {!result.ok ? (
        <p
          className="mt-6 rounded-[var(--app-radius-lg)] border p-5 text-[13px] leading-relaxed"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          {result.reason}
        </p>
      ) : (
        <Dashboard data={result.data} />
      )}
    </div>
  );
}

function Dashboard({ data }: { data: Data }) {
  const todayKey = easternDayKey(new Date(data.now));
  const signupsToday = data.signups.filter(
    (s) => s.created_at && easternDayKey(s.created_at) === todayKey,
  ).length;

  const pending = data.feedback.filter((f) => f.status === "pending");
  const resolved = data.feedback.filter((f) => f.status !== "pending");

  return (
    <>
      <section className="mt-6">
        <OwnerAlertsCard />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Signups"
          value={data.signups.length}
          sub={signupsToday > 0 ? `+${signupsToday} today` : undefined}
        />
        <Stat
          label="Feedback waiting"
          value={pending.length}
          tone={pending.length > 0 ? "brand" : undefined}
        />
        <Stat
          label="Reports pending"
          value={data.reportsPending}
          tone={data.reportsPending > 0 ? "warning" : undefined}
        />
        <Stat label="Push devices" value={data.pushDevices} />
      </section>

      <FeedbackInbox pending={pending} resolved={resolved} />
      <Signups signups={data.signups} now={data.now} />
      <Activity
        codes={data.codes}
        followCount={data.followCount}
        saveCount={data.saveCount}
        now={data.now}
      />

      <section className="mt-8 space-y-2">
        <h2
          className="text-xs font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Related tools
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToolLink href="/admin/beta-emails" title="Beta emails" desc="Full signup list + CSV export" />
          <ToolLink href="/admin/beta-codes" title="Beta codes" desc="Per-tester access: generate, track, revoke" />
          <ToolLink href="/admin/claims" title="Submission queue" desc="Places, events, and business claims" />
          <ToolLink href="/admin/reports" title="Community reports" desc="Map-layer moderation queue" />
        </div>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Feedback arrives via the beta widget through POST /api/feedback and is
        stored in the submissions table with kind &ldquo;feedback&rdquo;. Marking a note
        done or dismissed here also clears it from the submission queue.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- feedback */

function FeedbackInbox({ pending, resolved }: { pending: FeedbackRow[]; resolved: FeedbackRow[] }) {
  return (
    <section className="mt-8 space-y-2">
      <h2
        className="text-xs font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Feedback inbox
      </h2>

      {pending.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border p-6 text-center font-serif text-[17px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
        >
          No unread feedback. All caught up.
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map((f) => (
            <li key={f.id}>
              <FeedbackCard row={f} />
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <div className="pt-2">
          <h3
            className="text-[11px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Recently resolved
          </h3>
          <ul className="mt-2 space-y-1">
            {resolved.slice(0, 15).map((f) => {
              const p = feedbackPayload(f);
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2 text-[13px]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span className="truncate" style={{ color: "var(--app-ink-2)" }}>
                    {p.message}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      background: `color-mix(in srgb, ${
                        f.status === "approved" ? "var(--app-positive)" : "var(--app-ink-3)"
                      } 16%, transparent)`,
                      color: f.status === "approved" ? "var(--app-positive)" : "var(--app-ink-3)",
                    }}
                  >
                    {f.status === "approved" ? "done" : "dismissed"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FeedbackCard({ row }: { row: FeedbackRow }) {
  const p = feedbackPayload(row);
  return (
    <article
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p
        className="whitespace-pre-wrap font-serif text-[16px] leading-relaxed"
        style={{ color: "var(--app-ink)" }}
      >
        {p.message}
      </p>

      <div
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <span>{fmt(row.created_at)}</span>
        {p.pathname ? (
          <>
            <span aria-hidden>·</span>
            <a href={p.pathname} className="underline underline-offset-2" style={{ color: "var(--app-cool)" }}>
              {p.pathname}
            </a>
          </>
        ) : null}
        {p.commit ? (
          <>
            <span aria-hidden>·</span>
            <span>build {p.commit.slice(0, 7)}</span>
          </>
        ) : null}
        {row.submitter_email ? (
          <>
            <span aria-hidden>·</span>
            <a
              href={`mailto:${row.submitter_email}?subject=${encodeURIComponent("Re: your Frederick Radius beta note")}`}
              className="underline underline-offset-2"
              style={{ color: "var(--app-cool)" }}
            >
              reply to {row.submitter_email}
            </a>
          </>
        ) : null}
      </div>

      <form action={resolveFeedback} className="mt-4 grid grid-cols-2 gap-2">
        <input type="hidden" name="id" value={row.id} />
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="inline-flex items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border py-2.5 text-[13px] font-semibold active:scale-[0.97]"
          style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink-2)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Dismiss
        </button>
        <button
          type="submit"
          name="decision"
          value="approved"
          className="inline-flex items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] py-2.5 text-[13px] font-semibold text-white active:scale-[0.97]"
          style={{ background: "var(--app-positive)" }}
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Mark done
        </button>
      </form>
    </article>
  );
}

function feedbackPayload(row: FeedbackRow): {
  message: string;
  pathname: string | null;
  commit: string | null;
} {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  return {
    message: typeof p.message === "string" && p.message.trim() ? p.message : "(empty note)",
    pathname: typeof p.pathname === "string" && p.pathname.startsWith("/") ? p.pathname : null,
    commit: typeof p.commit === "string" && p.commit.trim() ? p.commit : null,
  };
}

/* ----------------------------------------------------------------- signups */

const SIGNUP_WINDOW_DAYS = 14;

function Signups({ signups, now }: { signups: SignupRow[]; now: number }) {
  const byDay = new Map<string, number>();
  for (const s of signups) {
    if (!s.created_at) continue;
    const key = easternDayKey(s.created_at);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const days = Array.from({ length: SIGNUP_WINDOW_DAYS }, (_, i) => {
    const key = easternDayKey(new Date(now - (SIGNUP_WINDOW_DAYS - 1 - i) * 86_400_000));
    return { key, n: byDay.get(key) ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.n));
  const windowTotal = days.reduce((sum, d) => sum + d.n, 0);

  return (
    <section className="mt-8 space-y-2">
      <h2
        className="text-xs font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Signups
      </h2>

      <div
        className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex h-14 items-end gap-1" aria-hidden>
          {days.map((d) => (
            <div
              key={d.key}
              title={`${fmtDay(d.key)} · ${d.n}`}
              className="flex-1 rounded-t-[2px]"
              style={{
                height: d.n === 0 ? "2px" : `${Math.max(6, Math.round((d.n / max) * 56))}px`,
                background: d.n === 0 ? "var(--app-border)" : "var(--app-brand)",
              }}
            />
          ))}
        </div>
        <div
          className="mt-1.5 flex items-center justify-between font-mono text-[10.5px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span>{fmtDay(days[0].key)}</span>
          <span>
            {windowTotal} in the last {SIGNUP_WINDOW_DAYS} days
          </span>
          <span>{fmtDay(days[days.length - 1].key)}</span>
        </div>
      </div>

      {signups.length > 0 ? (
        <ul className="space-y-1">
          {signups.slice(0, 8).map((s) => (
            <li
              key={s.email}
              className="flex items-center justify-between gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2 text-[13px]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span className="truncate" style={{ color: "var(--app-ink)" }}>
                {s.email}
              </span>
              <span className="shrink-0 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {fmt(s.created_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          No signups yet. The form on /beta feeds this list.
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- activity */

const ACTIVE_WINDOW_MS = 7 * 86_400_000;

function Activity({
  codes,
  followCount,
  saveCount,
  now,
}: {
  codes: CodeRow[];
  followCount: number;
  saveCount: number;
  now: number;
}) {
  const cutoff = now - ACTIVE_WINDOW_MS;
  const activeCodes = codes.filter(
    (c) => !c.revoked && c.last_seen_at && c.last_seen_at.getTime() >= cutoff,
  );

  return (
    <section className="mt-8 space-y-2">
      <h2
        className="text-xs font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Tester activity
      </h2>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Codes active, 7d" value={activeCodes.length} />
        <Stat label="Follows" value={followCount} />
        <Stat label="Event saves" value={saveCount} />
      </div>

      {codes.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border px-3 py-2.5 text-[12.5px] leading-relaxed"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          Everyone currently comes in through the shared password, so activity
          is not attributable to individual testers.{" "}
          <Link href="/admin/beta-codes" className="underline underline-offset-2" style={{ color: "var(--app-cool)" }}>
            Hand out per-tester codes
          </Link>{" "}
          to see who is actually using the app.
        </p>
      ) : (
        <ul className="space-y-1">
          {codes.slice(0, 10).map((c) => (
            <li
              key={c.code}
              className="flex items-center justify-between gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2 text-[13px]"
              style={{ borderColor: "var(--app-border)", opacity: c.revoked ? 0.55 : 1 }}
            >
              <span className="truncate" style={{ color: "var(--app-ink)" }}>
                {c.label || c.code}
              </span>
              <span className="shrink-0 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {c.last_seen_at ? `last seen ${fmt(c.last_seen_at)}` : "never used"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- shared */

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "brand" | "warning";
}) {
  const color =
    tone === "brand" ? "var(--app-brand)" : tone === "warning" ? "var(--app-warning)" : "var(--app-ink)";
  return (
    <div
      className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-center"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[10px] font-medium" style={{ color: "var(--app-positive)" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function ToolLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
        {title}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
        {desc}
      </p>
    </Link>
  );
}

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

/** "2026-07-09" → "Jul 9" (day keys are already Eastern; render without TZ shift). */
function fmtDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

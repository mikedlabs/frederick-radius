import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Check, X, Mail, KeyRound, Inbox, Flag } from "lucide-react";
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
import {
  AdminShell,
  Section,
  SectionLabel,
  StatCards,
  HairlineList,
  HairlineRow,
  StatusPill,
  EmptyState,
  AllClear,
  Notice,
  AdminButton,
  toneInk,
} from "@/components/admin/kit";
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
    <AdminShell
      eyebrow="Beta program"
      title="Beta dashboard"
      intro="Signups, tester feedback, and activity in one place. Notes from the in-app widget land here the moment a tester sends them."
    >
      {!result.ok ? (
        <div className="mt-6">
          <Notice tone="warning">{result.reason}</Notice>
        </div>
      ) : (
        <Dashboard data={result.data} />
      )}
    </AdminShell>
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

      <section className="mt-6">
        <SectionLabel>The vitals</SectionLabel>
        <div className="stagger-children grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        </div>
      </section>

      <FeedbackInbox pending={pending} resolved={resolved} />
      <Signups signups={data.signups} now={data.now} />
      <Activity
        codes={data.codes}
        followCount={data.followCount}
        saveCount={data.saveCount}
        now={data.now}
      />

      <Section title="Related tools">
        <div className="mt-3">
          <HairlineList>
            <HairlineRow
              index={0}
              href="/admin/beta-emails"
              icon={Mail}
              title="Beta emails"
              subtitle="Full signup list + CSV export"
            />
            <HairlineRow
              index={1}
              href="/admin/beta-codes"
              icon={KeyRound}
              title="Beta codes"
              subtitle="Per-tester access: generate, track, revoke"
            />
            <HairlineRow
              index={2}
              href="/admin/claims"
              icon={Inbox}
              title="Submission queue"
              subtitle="Places, events, and business claims"
            />
            <HairlineRow
              index={3}
              href="/admin/reports"
              icon={Flag}
              title="Community reports"
              subtitle="Map-layer moderation queue"
            />
          </HairlineList>
        </div>
      </Section>

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
    <Section title="Feedback inbox">
      {pending.length === 0 ? (
        <AllClear>No unread feedback. All caught up.</AllClear>
      ) : (
        <ul className="mt-3 space-y-3">
          {pending.map((f) => (
            <li key={f.id}>
              <FeedbackCard row={f} />
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>Recently resolved</SectionLabel>
          <HairlineList>
            {resolved.slice(0, 15).map((f, i) => {
              const p = feedbackPayload(f);
              return (
                <HairlineRow
                  key={f.id}
                  index={i}
                  title={p.message}
                  badge={
                    <StatusPill tone={f.status === "approved" ? "positive" : "neutral"}>
                      {f.status === "approved" ? "done" : "dismissed"}
                    </StatusPill>
                  }
                />
              );
            })}
          </HairlineList>
        </div>
      ) : null}
    </Section>
  );
}

function FeedbackCard({ row }: { row: FeedbackRow }) {
  const p = feedbackPayload(row);
  return (
    <article
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{
        borderColor: "var(--app-border)",
        // The unread-letter mark: a vermilion spine on every note still
        // waiting, so a scroll through the inbox reads state at a glance.
        borderLeft: "3px solid var(--app-brand)",
      }}
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

      <form action={resolveFeedback} className="mt-4 flex items-center justify-end gap-2">
        <input type="hidden" name="id" value={row.id} />
        <AdminButton type="submit" name="decision" value="rejected" variant="ghost" icon={X}>
          Dismiss
        </AdminButton>
        <AdminButton type="submit" name="decision" value="approved" variant="positive" icon={Check}>
          Mark done
        </AdminButton>
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

  const todayKey = days[days.length - 1].key;

  return (
    <Section title="Signups">
      {/* SignupSparkbars: a bespoke 14-day bar strip — nothing in the kit draws
          a per-day chart. Today reads in the brand; history recedes into ink so
          the strip answers "anything today?" before anything else. */}
      <div
        className="mt-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          className="flex h-14 items-end gap-1 border-b pb-px"
          style={{ borderColor: "var(--app-border)" }}
          aria-hidden
        >
          {days.map((d) => (
            <div
              key={d.key}
              title={`${fmtDay(d.key)} · ${d.n}`}
              className="flex-1 rounded-t-[2px]"
              style={{
                height: d.n === 0 ? "2px" : `${Math.max(6, Math.round((d.n / max) * 56))}px`,
                background:
                  d.n === 0
                    ? "var(--app-border)"
                    : d.key === todayKey
                      ? "var(--app-brand)"
                      : "color-mix(in srgb, var(--app-ink) 32%, transparent)",
              }}
            />
          ))}
        </div>
        <div
          className="mt-1.5 flex items-center justify-between font-mono text-[10.5px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span>{fmtDay(days[0].key)}</span>
          <span className="tabular-nums">
            {windowTotal} in the last {SIGNUP_WINDOW_DAYS} days
          </span>
          <span style={{ color: "var(--app-brand)" }}>today</span>
        </div>
      </div>

      {signups.length > 0 ? (
        <div className="mt-3">
          <HairlineList>
            {signups.slice(0, 8).map((s, i) => (
              <HairlineRow
                key={s.email}
                index={i}
                title={<span className="font-mono text-[12.5px]">{s.email}</span>}
                meta={<span className="font-mono">{fmt(s.created_at)}</span>}
              />
            ))}
          </HairlineList>
        </div>
      ) : (
        <EmptyState>No signups yet. The form on /beta feeds this list.</EmptyState>
      )}
    </Section>
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
    <Section title="Tester activity">
      <div className="mt-3">
        <StatCards
          cols={3}
          items={[
            { value: activeCodes.length, label: "Codes active, 7d" },
            { value: followCount, label: "Follows" },
            { value: saveCount, label: "Event saves" },
          ]}
        />
      </div>

      {codes.length === 0 ? (
        <EmptyState>
          Everyone currently comes in through the shared password, so activity is
          not attributable to individual testers.{" "}
          <Link href="/admin/beta-codes" className="underline underline-offset-2" style={{ color: "var(--app-cool)" }}>
            Hand out per-tester codes
          </Link>{" "}
          to see who is actually using the app.
        </EmptyState>
      ) : (
        // Matches the kit HairlineList look, but kept local so revoked rows can
        // dim to 0.55 — a per-row opacity the shared HairlineRow doesn't carry.
        <ul
          className="mt-3 overflow-hidden rounded-[var(--app-radius-md)] border"
          style={{ borderColor: "var(--app-border)" }}
        >
          {codes.slice(0, 10).map((c, i) => (
            <li
              key={c.code}
              className="flex items-center justify-between gap-2 bg-[var(--app-bg-elevated)] px-3 py-2.5"
              style={{
                borderTop: i > 0 ? "1px solid var(--app-border)" : undefined,
                opacity: c.revoked ? 0.55 : 1,
              }}
            >
              <span className="truncate text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>
                {c.label || c.code}
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {c.last_seen_at ? `last seen ${fmt(c.last_seen_at)}` : "never used"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- shared */

/**
 * Beta vital tile. Reads in the kit's stat-card language (serif number, tiny
 * uppercase label, hairline card) so it sits flush with the StatCards used on
 * Tester activity — but keeps two beta-only tells the kit doesn't provide: a
 * "+N today" sub-line and, when something is waiting, a hair-thin accent rule
 * plus a quiet breathing .live-dot so the eye lands there first. Calm tiles
 * stay quiet; the pulse is reduced-motion safe via globals.
 */
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
  const accent = tone ? toneInk(tone) : null;
  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-center"
      style={{ borderColor: "var(--app-border)" }}
    >
      {accent ? (
        <>
          <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: accent }} />
          {/* Wrapper owns the corner position; .live-dot manages its own
              layout for the pulse ring and would fight a position utility. */}
          <span aria-hidden className="absolute right-2.5 top-2.5" style={{ color: accent }}>
            <span className="live-dot" />
          </span>
        </>
      ) : null}
      <div
        className="font-serif text-[22px] font-semibold leading-none tracking-tight tabular-nums"
        style={{ color: accent ?? "var(--app-ink)" }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </div>
      {sub ? (
        <div className="mt-0.5 font-mono text-[10px] font-medium tabular-nums" style={{ color: "var(--app-positive)" }}>
          {sub}
        </div>
      ) : null}
    </div>
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

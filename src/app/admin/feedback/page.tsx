import type { Metadata } from "next";
import { Suspense } from "react";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { Check, X, Inbox, Flag } from "lucide-react";
import { getDb, getSql } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { feedbackSourcePath } from "@/lib/feedback-source-path";
import OwnerAlertsCard from "@/components/admin/OwnerAlertsCard";
import {
  AdminShell,
  Section,
  SectionLabel,
  StatCards,
  HairlineList,
  HairlineRow,
  StatusPill,
  AllClear,
  Notice,
  AdminButton,
} from "@/components/admin/kit";
import { resolveFeedback } from "./actions";

export const metadata: Metadata = {
  title: "Feedback · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type FeedbackRow = typeof submissions.$inferSelect;

/** How many resolved notes the page reads for its "Recently resolved" log. */
const RESOLVED_LOG_LIMIT = 15;

/**
 * The most waiting notes one page load reads. /api/feedback is a public write
 * route, so the read needs a ceiling, but the ceiling must never make the
 * inbox look emptier than it is: the page reads the oldest notes first, counts
 * every waiting note separately, and says so when some are not shown.
 */
const PENDING_PAGE_LIMIT = 500;

type Data = {
  /** The notes still waiting, oldest first, up to PENDING_PAGE_LIMIT. */
  pending: FeedbackRow[];
  /** Every waiting note, including any past the page limit. */
  pendingTotal: number;
  /** The newest resolved notes, for the short log under the inbox. */
  resolved: FeedbackRow[];
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
  const raw = getSql();
  if (!db || !raw) {
    return { ok: false, reason: "DATABASE_URL is not configured for this environment." };
  }
  try {
    // Sequential on purpose: getDb() talks to Supavisor transaction pooling
    // with max:1 + prepare:false, and concurrent queries (Promise.all) get
    // pipelined down the one pooled connection, which Supavisor does not
    // answer, so the render hangs. One-at-a-time always completes. The four
    // counts travel as one statement.
    const pending = await db
      .select()
      .from(submissions)
      .where(and(eq(submissions.kind, "feedback"), eq(submissions.status, "pending")))
      .orderBy(asc(submissions.created_at))
      .limit(PENDING_PAGE_LIMIT);
    const resolved = await db
      .select()
      .from(submissions)
      .where(and(eq(submissions.kind, "feedback"), ne(submissions.status, "pending")))
      .orderBy(desc(submissions.created_at))
      .limit(RESOLVED_LOG_LIMIT);
    const counts = (
      await raw`
        select
          (select count(*)::int from push_subscriptions) as push_devices,
          (select count(*)::int from submissions where kind = 'feedback' and status = 'pending') as feedback_pending,
          (select count(*)::int from follows) as follow_count,
          (select count(*)::int from saved_events) as save_count,
          (select count(*)::int from community_reports where status = 'pending') as reports_pending
      `
    )[0] as Record<string, number>;
    return {
      ok: true,
      data: {
        pending,
        // Never report fewer waiting notes than the page is about to show.
        pendingTotal: Math.max(counts.feedback_pending ?? 0, pending.length),
        resolved,
        pushDevices: counts.push_devices ?? 0,
        followCount: counts.follow_count ?? 0,
        saveCount: counts.save_count ?? 0,
        reportsPending: counts.reports_pending ?? 0,
        now,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason:
        "Could not read the feedback tables. " + (err instanceof Error ? err.message : String(err)),
    };
  }
}

/** The shell paints immediately; the data block streams in behind Suspense
 *  (same speed model as the /admin hub). */
export default function FeedbackDashboard() {
  return (
    <AdminShell
      eyebrow="Visitors"
      title="Feedback"
      intro="Notes from the in-app feedback button land here the moment someone sends them."
    >
      <Suspense fallback={<FeedbackSkeleton />}>
        <FeedbackData />
      </Suspense>
    </AdminShell>
  );
}

async function FeedbackData() {
  const result = await load();
  if (!result.ok) {
    return (
      <div className="mt-6">
        <Notice tone="warning">{result.reason}</Notice>
      </div>
    );
  }
  return <Dashboard data={result.data} />;
}

function FeedbackSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-6" aria-hidden>
      <div className="h-[74px] rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
      {[0, 1].map((i) => (
        <div key={i} className="h-28 rounded-[var(--app-radius-lg)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
      ))}
    </div>
  );
}

function Dashboard({ data }: { data: Data }) {
  // The inbox is a queue: oldest note first, so the person who has waited
  // longest is answered first. The resolved log is newest-first.
  const { pending, pendingTotal, resolved } = data;

  return (
    <>
      <section className="mt-6">
        <OwnerAlertsCard />
      </section>

      <section className="mt-6">
        <SectionLabel>The vitals</SectionLabel>
        <StatCards
          cols={3}
          items={[
            { value: pendingTotal, label: "Feedback waiting", tone: pendingTotal > 0 ? "warning" : "positive" },
            { value: data.reportsPending, label: "Reports pending", tone: data.reportsPending > 0 ? "warning" : "positive" },
            { value: data.pushDevices, label: "Push devices" },
            { value: data.followCount, label: "Follows" },
            { value: data.saveCount, label: "Event saves" },
          ]}
        />
      </section>

      <FeedbackInbox pending={pending} pendingTotal={pendingTotal} resolved={resolved} now={data.now} />

      <Section title="Related tools">
        <div className="mt-3">
          <HairlineList>
            <HairlineRow
              index={0}
              href="/admin/claims"
              icon={Inbox}
              title="Submission queue"
              subtitle="Places, events, and business claims"
            />
            <HairlineRow
              index={1}
              href="/admin/reports"
              icon={Flag}
              title="Community reports"
              subtitle="Map-layer moderation queue"
            />
          </HairlineList>
        </div>
      </Section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Feedback arrives from the in-app feedback button through POST /api/feedback and is
        stored in the submissions table with kind &ldquo;feedback&rdquo;. Marking a note
        done or dismissed here also clears it from the submission queue.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- feedback */

function FeedbackInbox({
  pending,
  pendingTotal,
  resolved,
  now,
}: {
  pending: FeedbackRow[];
  pendingTotal: number;
  resolved: FeedbackRow[];
  now: number;
}) {
  return (
    <Section title="Feedback inbox">
      {pendingTotal > pending.length ? (
        <div className="mt-3">
          <Notice tone="warning">
            Showing the {pending.length.toLocaleString("en-US")} notes that have waited longest, out of{" "}
            {pendingTotal.toLocaleString("en-US")} waiting. The rest appear as you clear these.
          </Notice>
        </div>
      ) : null}
      {pending.length === 0 ? (
        <AllClear>There is no unread feedback.</AllClear>
      ) : (
        <ul className="mt-3 space-y-3">
          {pending.map((f) => (
            <li key={f.id}>
              <FeedbackCard row={f} now={now} />
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>Recently resolved</SectionLabel>
          <HairlineList>
            {resolved.map((f, i) => {
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

function FeedbackCard({ row, now }: { row: FeedbackRow; now: number }) {
  const p = feedbackPayload(row);
  const days = daysWaiting(row.created_at, now);
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
        <StatusPill tone={waitTone(days)}>
          {days >= 1 ? `waiting ${days}d` : "arrived today"}
        </StatusPill>
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
              href={`mailto:${row.submitter_email}?subject=${encodeURIComponent("Re: your Frederick Radius note")}`}
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
    pathname: feedbackSourcePath(p.pathname),
    commit: typeof p.commit === "string" && p.commit.trim() ? p.commit : null,
  };
}

/* ----------------------------------------------------------------- shared */

/** Whole days a note has been waiting, read against the load-time clock. */
function daysWaiting(created: Date | null, now: number): number {
  if (!created) return 0;
  return Math.max(0, Math.floor((now - created.getTime()) / 86_400_000));
}

/** Shared urgency scale for waiting work: calm under 3 days, warning at 3,
 *  danger at 7. Matches /admin/claims and /admin/reports. */
function waitTone(days: number): "neutral" | "warning" | "danger" {
  return days >= 7 ? "danger" : days >= 3 ? "warning" : "neutral";
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

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  MessageSquare, Inbox, Store, Flag, MapPin, CalendarClock, RadioTower,
  Activity, Receipt, Database, MapPinned, ChevronRight, CircleCheck,
  TrendingUp, TrendingDown,
  ListChecks,
} from "lucide-react";
import { getSql } from "@/lib/db/client";
import { plausibleKeys, fetchAggregate } from "@/lib/integrations/plausible-stats";
import { PLACES } from "@/data/places";
import VENUE_EVENTS from "@/data/venue-events.json" with { type: "json" };
import TRANSIT from "@/data/transit.json" with { type: "json" };
import SCORES_RAW from "@/data/copy-scores.json" with { type: "json" };
import { getNeedsReviewPlaces } from "@/lib/loaders/places";
import { getNeedsReviewEvents } from "@/lib/loaders/events";
import { easternDayKey } from "@/lib/tz";

/**
 * The desk's data sections, split out of page.tsx so each can stream
 * behind its own Suspense boundary while the static shell paints
 * immediately.
 *
 * Two boundaries, two backends, on purpose:
 *
 *   DeskSections   — everything that reads Postgres. ONE component so all
 *                    DB awaits stay strictly sequential over the single
 *                    Supavisor pooled connection (max:1 — concurrent
 *                    queries deadlock; the lesson of #1024). The old desk
 *                    made seven round trips here; these are folded into
 *                    three statements (core counts, health, spend), which
 *                    is where the actual speedup comes from.
 *   TrafficGlance  — Plausible's Stats API. External HTTP, no pooled
 *                    connection involved, so it streams in parallel with
 *                    the database work instead of after it.
 */

const SCORES = SCORES_RAW as { computed_at: string; counts: Record<string, number> };

// ── Shared view atoms (used by page.tsx skeletons too) ──────────────────

/** Hours → "17h" / "2d" for the pipeline heartbeat. */
function fmtAge(hours: number): string {
  if (hours < 1) return "under 1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** A hairline divider between vitals. */
function VDiv() {
  return <div aria-hidden className="w-px shrink-0 self-stretch" style={{ background: "var(--app-border)" }} />;
}

/** One vital in a glance strip: a big serif number, a label, and an optional
 *  week-over-week delta (green when growing). */
function Vital({ value, label, tone, delta }: { value: number | string; label: string; tone?: "positive" | "warning"; delta?: number }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "warning" ? "var(--app-warning-press)" : "var(--app-ink)";
  return (
    <div className="flex-1 px-1 text-center">
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="mt-1.5 text-[10px] leading-tight" style={{ color: "var(--app-ink-3)" }}>{label}</p>
      {typeof delta === "number" && delta !== 0 && (
        <p className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium" style={{ color: delta > 0 ? "var(--app-positive)" : "var(--app-ink-3)" }}>
          {delta > 0 ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : <TrendingDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
          {delta > 0 ? "+" : ""}{delta} wk
        </p>
      )}
    </div>
  );
}

function SectionHead({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>{children}</h2>
      {aside}
    </div>
  );
}

function SystemLine({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-2.5 no-underline">
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      <span className="flex-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>{children}</span>
      <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
    </Link>
  );
}

// ── Skeleton fallbacks (what streams in gets a stand-in of its height) ──

export function DeskSkeleton() {
  return (
    <div className="mt-5 animate-pulse space-y-6" aria-hidden>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
        ))}
      </div>
      <div className="h-[74px] rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded" style={{ background: "var(--app-bg-elevated)" }} />
        ))}
      </div>
    </div>
  );
}

export function GlanceSkeleton() {
  return (
    <div className="mt-6 animate-pulse" aria-hidden>
      <div className="h-[74px] rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
    </div>
  );
}

// ── Postgres data ───────────────────────────────────────────────────────

type Core = {
  feedbackPending: number;
  submissionsPending: number;
  claimsPending: number;
  reportsPending: number;
  codesActive: number;
  codesTotal: number;
  codesSeen7d: number;
  signupsTotal: number;
  signups1w: number;
  signupsPrev1w: number;
  new24h: { signups: number; feedback: number; claims: number; subs: number };
  fieldPoints: number;
  fieldPoints7d: number;
  sourceCandidatesPending: number;
};

type Health = {
  quietFeeds: number;
  feedsLive: number;
  pipeline: { src: string; ageH: number; status: string }[];
};

type CostRow = { upstream: string; today: number; median7: number; spike: boolean };

async function loadDesk(): Promise<{
  core: Core | null;
  health: Health | null;
  costs: CostRow[] | null;
  dbReason?: string;
}> {
  const raw = getSql();
  if (!raw) return { core: null, health: null, costs: null, dbReason: "no database configured" };

  // Statement 1 — every count on the always-migrated tables, one round trip.
  let core: Core | null = null;
  try {
    const r = (
      await raw`
        select
          (select count(*)::int from submissions where status = 'pending' and kind = 'feedback') as feedback_pending,
          -- Claims are inserted with kind "business_claim" (submit/actions.ts),
          -- NOT "claim": the old key read 0 always and hid waiting claims.
          (select count(*)::int from submissions where status = 'pending' and kind = 'business_claim') as claims_pending,
          (select count(*)::int from submissions where status = 'pending' and kind not in ('feedback', 'business_claim')) as submissions_pending,
          (select count(*)::int from community_reports where status = 'pending') as reports_pending,
          (select count(*)::int from beta_codes) as codes_total,
          (select count(*)::int from beta_codes where not revoked) as codes_active,
          (select count(*)::int from beta_codes where last_seen_at > now() - interval '7 days') as codes_seen_7d,
          (select count(*)::int from beta_emails) as signups_total,
          (select count(*)::int from beta_emails where created_at > now() - interval '7 days') as signups_1w,
          (select count(*)::int from beta_emails where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days') as signups_prev_1w,
          (select count(*)::int from beta_emails where created_at > now() - interval '24 hours') as new_signups_24h,
          (select count(*)::int from submissions where kind = 'feedback' and created_at > now() - interval '24 hours') as new_feedback_24h,
          (select count(*)::int from submissions where kind = 'business_claim' and created_at > now() - interval '24 hours') as new_claims_24h,
          (select count(*)::int from submissions where kind in ('place', 'event') and created_at > now() - interval '24 hours') as new_subs_24h,
          (select count(*)::int from field_amenities where status = 'approved') as field_points,
          (select count(*)::int from field_amenities where status = 'approved' and created_at > now() - interval '7 days') as field_points_7d,
          0::int as source_candidates_pending
      `
    )[0] as Record<string, number>;
    core = {
      feedbackPending: r.feedback_pending ?? 0,
      claimsPending: r.claims_pending ?? 0,
      submissionsPending: r.submissions_pending ?? 0,
      reportsPending: r.reports_pending ?? 0,
      codesTotal: r.codes_total ?? 0,
      codesActive: r.codes_active ?? 0,
      codesSeen7d: r.codes_seen_7d ?? 0,
      signupsTotal: r.signups_total ?? 0,
      signups1w: r.signups_1w ?? 0,
      signupsPrev1w: r.signups_prev_1w ?? 0,
      new24h: {
        signups: r.new_signups_24h ?? 0,
        feedback: r.new_feedback_24h ?? 0,
        claims: r.new_claims_24h ?? 0,
        subs: r.new_subs_24h ?? 0,
      },
      fieldPoints: r.field_points ?? 0,
      fieldPoints7d: r.field_points_7d ?? 0,
      sourceCandidatesPending: r.source_candidates_pending ?? 0,
    };
  } catch (e) {
    return { core: null, health: null, costs: null, dbReason: e instanceof Error ? e.message.slice(0, 80) : "query failed" };
  }

  // The evidence tables are newer and optional to the rest of the admin desk.
  // A missing migration or permission must not erase submissions, reports,
  // codes, signups, and every other core queue.
  try {
    const row = (await raw`
      select count(*)::int as pending
      from (
        select distinct on (fo.entity_key)
          fo.observation_key,
          coalesce(
            nullif(fo.observed_value ->> 'decisionKey', ''),
            fo.observation_key
          ) as decision_key,
          fo.valid_until
        from field_observations fo
        where fo.entity_kind = 'source-candidate'
          and fo.field_name = 'discovery'
        order by fo.entity_key, fo.observed_at desc, fo.id desc
      ) latest
      left join curation_decisions cd
        on cd.tool = 'source-candidate'
       and cd.target_id = latest.decision_key
       and cd.field = ''
      where latest.valid_until > now()
        and cd.decision is null
    `)[0] as { pending?: number } | undefined;
    core.sourceCandidatesPending = row?.pending ?? 0;
  } catch {
    core.sourceCandidatesPending = 0;
  }

  // Statement 2 — feed/ingest health. These tables ship in a later migration,
  // so this fails soft on its own: a not-yet-migrated deploy still gets the
  // queue and vitals above.
  let health: Health | null = null;
  try {
    const r = (
      await raw`
        select
          (select count(*)::int
           from feed_source_health
           where count = 0
             and recent_mean_count >= 1
             and taken_at > now() - interval '36 hours') as quiet_feeds,
          (select count(*)::int
           from feed_source_health
           where taken_at > now() - interval '36 hours') as feeds_live,
          (select coalesce(json_agg(t order by t.ended_at desc nulls last), '[]'::json)
           from (
             select distinct on (source_slug) source_slug as src, ended_at,
                    round(extract(epoch from now() - ended_at) / 3600)::int as age_h,
                    status
             from ingest_runs order by source_slug, ended_at desc nulls last
           ) t) as runs
      `
    )[0] as { quiet_feeds: number; feeds_live: number; runs: { src: string; age_h: number; status: string }[] };
    health = {
      quietFeeds: r.quiet_feeds ?? 0,
      feedsLive: r.feeds_live ?? 0,
      pipeline: (r.runs ?? []).map((x) => ({ src: x.src, ageH: x.age_h, status: x.status })),
    };
  } catch {
    health = null;
  }

  // Statement 3 — the cost sentinel (usage_counters may also postdate a
  // deploy). Today vs the median of the prior seven days, per upstream.
  let costs: CostRow[] | null = null;
  try {
    const rows = (await raw`
      select upstream, day, count from usage_counters
      where day > (now() at time zone 'America/New_York')::date - 8
    `) as unknown as { upstream: string; day: string; count: number }[];
    const today = easternDayKey(new Date());
    const byUpstream = new Map<string, { today: number; prior: number[] }>();
    for (const r of rows) {
      const u = byUpstream.get(r.upstream) ?? { today: 0, prior: [] };
      if (String(r.day) === today) u.today = r.count;
      else u.prior.push(r.count);
      byUpstream.set(r.upstream, u);
    }
    costs = [...byUpstream.entries()]
      .map(([upstream, v]) => {
        const sorted = [...v.prior].sort((a, b) => a - b);
        const median7 = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
        return { upstream, today: v.today, median7, spike: v.today >= 50 && v.today > 3 * Math.max(1, median7) };
      })
      .sort((a, b) => b.today - a.today);
  } catch {
    costs = null;
  }

  return { core, health, costs };
}

// ── Dataset freshness (local JSON, computed alongside the DB sections
//    because it renders inside the same System block) ────────────────────

type AgeTone = "fresh" | "aging" | "stale" | "none";

function ageOf(iso: string | undefined, agingDays: number, staleDays: number): { tone: AgeTone } {
  if (!iso) return { tone: "none" };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { tone: "none" };
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return { tone: days >= staleDays ? "stale" : days >= agingDays ? "aging" : "fresh" };
}

function datasetTones(): { total: number; fresh: number; aging: number; stale: number } {
  const venueRows = VENUE_EVENTS as Array<{ source: { fetchedAt: string } }>;
  const venueLatest = venueRows.map((r) => r.source.fetchedAt).sort().at(-1);
  const transit = TRANSIT as { generatedAt: string };
  const needsVerify = PLACES.filter((p) => !p.is_operational || p.is_operational === "needs_verification").length;
  // Same active datasets the old desk table tracked; the hub needs only the
  // tone rollup (the full table lives on /admin/data-health).
  const tones: AgeTone[] = [
    needsVerify > 0 ? "aging" : "fresh", // curated places
    "none", // client dataset (rebuilt with each edit)
    ageOf(venueLatest, 7, 14).tone,
    ageOf(transit.generatedAt, 60, 120).tone,
    ageOf(SCORES.computed_at, 7, 21).tone,
    "none", // human corrections
    "fresh", // event seeds (dates audited Jul 2026)
    "none", // collections
  ];
  return {
    total: tones.length,
    fresh: tones.filter((t) => t === "fresh").length,
    aging: tones.filter((t) => t === "aging").length,
    stale: tones.filter((t) => t === "stale").length,
  };
}

// ── The streamed DB block: queue + vitals + system ──────────────────────

export async function DeskSections() {
  const desk = await loadDesk();
  const reviewPlaces = getNeedsReviewPlaces().length;
  const reviewEvents = getNeedsReviewEvents().length;
  const datasets = datasetTones();

  // Ingests that errored on their most recent run in the last 2 days (a dead
  // cron silently stops data flowing — surface it as an action item).
  const pipeline = desk.health?.pipeline ?? [];
  const ingestErrors = pipeline.filter((r) => r.status !== "ok" && r.ageH <= 48).length;

  const queueRows: Array<{ label: string; n: number; href: string; icon: LucideIcon }> = desk.core
    ? [
        { label: "Feedback waiting", n: desk.core.feedbackPending, href: "/admin/beta", icon: MessageSquare },
        { label: "Submissions", n: desk.core.submissionsPending, href: "/admin/claims", icon: Inbox },
        { label: "Business claims", n: desk.core.claimsPending, href: "/admin/claims", icon: Store },
        { label: "Community reports", n: desk.core.reportsPending, href: "/admin/reports", icon: Flag },
        { label: "Places need coordinate review", n: reviewPlaces, href: "/admin/data-health", icon: MapPin },
        { label: "Events need review", n: reviewEvents, href: "/admin/data-health", icon: CalendarClock },
        { label: "Source candidates", n: desk.core.sourceCandidatesPending, href: "/admin/source-candidates", icon: ListChecks },
        // Real feed health from feed_snapshots: feeds that usually carry events
        // but parsed 0 today (NOT the key-missing count, which is intentional).
        { label: "Feeds went quiet today", n: desk.health?.quietFeeds ?? 0, href: "/admin/data-health", icon: RadioTower },
        { label: "Ingests erroring", n: ingestErrors, href: "/admin/data-health", icon: Activity },
      ].filter((r) => r.n > 0)
    : [];

  // "New in 24h" momentum line.
  const n24 = desk.core?.new24h;
  const new24hTotal = n24 ? n24.signups + n24.feedback + n24.claims + n24.subs : 0;
  const new24hParts = n24
    ? [
        n24.signups ? `${n24.signups} signup${n24.signups === 1 ? "" : "s"}` : null,
        n24.feedback ? `${n24.feedback} feedback` : null,
        n24.claims ? `${n24.claims} claim${n24.claims === 1 ? "" : "s"}` : null,
        n24.subs ? `${n24.subs} submission${n24.subs === 1 ? "" : "s"}` : null,
      ].filter((x): x is string => x !== null)
    : [];

  const signupsDelta = desk.core ? desk.core.signups1w - desk.core.signupsPrev1w : 0;
  const spendSpike = (desk.costs ?? []).some((c) => c.spike);
  const okRun = pipeline.filter((r) => r.status === "ok").sort((a, b) => a.ageH - b.ageH)[0];

  return (
    <>
      {/* ── The queue: a light list, hairlines not cards. Rows exist only when
          something is waiting; otherwise a clean all-clear. ── */}
      <section className="mt-5">
        {desk.core === null ? (
          <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>Queue unavailable: {desk.dbReason}.</p>
        ) : queueRows.length === 0 ? (
          <div
            className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] border px-4 py-3.5"
            style={{
              borderColor: "color-mix(in srgb, var(--app-positive) 28%, var(--app-border))",
              background: "color-mix(in srgb, var(--app-positive) 6%, var(--app-bg-elevated))",
            }}
          >
            <CircleCheck className="h-5 w-5 shrink-0" strokeWidth={2} style={{ color: "var(--app-positive)" }} aria-hidden />
            <span className="text-[14px] font-medium" style={{ color: "var(--app-positive)" }}>All clear. Nothing is waiting on you.</span>
          </div>
        ) : (
          <>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              {queueRows.reduce((a, r) => a + r.n, 0)} waiting
            </p>
            <ul className="overflow-hidden rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
              {queueRows.map((r, i) => (
                <li key={r.label} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                  <Link href={r.href} className="flex min-h-11 items-center gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5 transition hover:bg-[var(--app-bg-sunken)]">
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)" }}>
                      <r.icon className="h-[17px] w-[17px]" strokeWidth={2} style={{ color: "var(--app-brand-press)" }} />
                    </span>
                    <span className="flex-1 text-[14px] font-medium leading-tight" style={{ color: "var(--app-ink)" }}>{r.label}</span>
                    <span className="grid h-6 min-w-[24px] shrink-0 place-items-center rounded-full px-1.5 font-mono text-[12.5px] font-bold tabular-nums" style={{ background: "var(--app-brand)", color: "var(--app-on-brand, #fff)" }}>{r.n}</span>
                    <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {new24hTotal > 0 && (
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
            <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{new24hTotal} new in 24h</span>
            {new24hParts.length > 0 && <> · {new24hParts.join(", ")}</>}
          </p>
        )}
      </section>

      {/* ── The vitals: one glanceable strip, with a week trend on signups. ── */}
      <section className="mt-6">
        <SectionHead
          aside={<Link href="/admin/beta" className="tap-44 inline-flex items-center text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>Beta →</Link>}
        >
          The vitals
        </SectionHead>
        {desk.core === null ? (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>Needs the database ({desk.dbReason}).</p>
        ) : (
          <div className="flex items-stretch justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3" style={{ borderColor: "var(--app-border)" }}>
            <Vital value={desk.core.codesSeen7d} label="active · 7d" tone="positive" />
            <VDiv />
            <Vital value={desk.core.signupsTotal} label="signups" delta={signupsDelta} />
            <VDiv />
            <Vital value={`${desk.core.codesActive}/${desk.core.codesTotal}`} label="codes live" />
            <VDiv />
            <div className="flex-1 px-1 text-center">
              {spendSpike ? (
                <p className="font-serif text-2xl font-semibold leading-none" style={{ color: "var(--app-danger)" }}>!</p>
              ) : (
                <CircleCheck className="mx-auto h-[26px] w-[26px]" strokeWidth={2} aria-hidden style={{ color: "var(--app-positive)" }} />
              )}
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>spend {spendSpike ? "spike" : "ok"}</p>
            </div>
          </div>
        )}
      </section>

      {/* ── System: demoted reference — pipeline heartbeat, dataset freshness,
          spend, the field-collection layer. One quiet line each, full detail
          one tap away. ── */}
      <section className="mt-7 space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>System</h2>

        <SystemLine href="/admin/data-health" icon={Activity}>
          {okRun ? `Last ingest ${fmtAge(okRun.ageH)} ago` : "No successful ingest logged"}
          {ingestErrors > 0 && <span style={{ color: "var(--app-warning-press)", fontWeight: 600 }}> · {ingestErrors} erroring</span>}
        </SystemLine>

        <SystemLine href="/admin/data-health" icon={Database}>
          {datasets.total} datasets · <span style={{ color: "var(--app-positive)" }}>{datasets.fresh} fresh</span>
          {datasets.aging > 0 && <>, <span style={{ color: "var(--app-warning-press)" }}>{datasets.aging} aging</span></>}
          {datasets.stale > 0 && <>, <span style={{ color: "var(--app-danger)" }}>{datasets.stale} stale</span></>}
        </SystemLine>

        <SystemLine href="/admin/costs" icon={Receipt}>
          {desk.costs === null
            ? "Spend not metered yet"
            : desk.costs.length === 0
              ? "No paid calls in 8 days"
              : spendSpike
                ? <span style={{ color: "var(--app-danger)", fontWeight: 600 }}>Cost spike today</span>
                : "Spend normal today"}
        </SystemLine>

        {desk.core !== null && (
          <SystemLine href="/collect" icon={MapPinned}>
            {desk.core.fieldPoints} field-collected points on the map
            {desk.core.fieldPoints7d > 0 && (
              <span style={{ color: "var(--app-positive)", fontWeight: 600 }}> · +{desk.core.fieldPoints7d} this week</span>
            )}
          </SystemLine>
        )}
      </section>
    </>
  );
}

// ── The streamed traffic block (Plausible) ──────────────────────────────

export async function TrafficGlance() {
  const keys = plausibleKeys();

  if (!keys) {
    return (
      <section className="mt-6">
        <SectionHead
          aside={<Link href="/admin/traffic" className="tap-44 inline-flex items-center text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>Traffic →</Link>}
        >
          Traffic
        </SectionHead>
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Starter is collecting in Plausible. Embedded numbers require its Business Stats API; use the traffic page for the right dashboard link.
        </p>
      </section>
    );
  }

  // External API — Promise.all is fine here; the sequential-await rule is
  // about the Supavisor pooled connection, which this never touches.
  const [today, week, month] = await Promise.all([
    fetchAggregate(keys, "day"),
    fetchAggregate(keys, "7d"),
    fetchAggregate(keys, "30d"),
  ]);

  return (
    <section className="mt-6">
      <SectionHead
        aside={<Link href="/admin/traffic" className="tap-44 inline-flex items-center text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>Traffic →</Link>}
      >
        Traffic
      </SectionHead>
      {today === null && week === null && month === null ? (
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Plausible did not answer just now. The keys are set, so this is likely transient.
        </p>
      ) : (
        <>
          <div className="flex items-stretch justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3" style={{ borderColor: "var(--app-border)" }}>
            <Vital value={today?.visitors ?? "–"} label="visitors today" />
            <VDiv />
            <Vital value={week?.visitors ?? "–"} label="visitors · 7d" />
            <VDiv />
            <Vital value={month?.visitors ?? "–"} label="visitors · 30d" />
            <VDiv />
            <Vital value={week?.pageviews ?? "–"} label="views · 7d" />
          </div>
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
            Search and Ask misses live in the private data-gap queue, not in third-party custom properties.
          </p>
        </>
      )}
    </section>
  );
}

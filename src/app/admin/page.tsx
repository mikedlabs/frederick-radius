import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  MessageSquare, Inbox, Store, Flag, MapPin, CalendarClock, RadioTower,
  LayoutDashboard, KeyRound, StickyNote, Receipt, Activity, MapPinned, Mail,
  PenLine, Copy, GitCompare, Sparkles, Database, Megaphone,
  ChevronRight, CircleCheck, TrendingUp, TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import { submissions, community_reports, beta_codes, beta_emails, push_subscriptions, usage_counters } from "@/lib/db/schema";
import { PLACES } from "@/data/places";
import { EVENTS } from "@/data/events";
import { COLLECTIONS } from "@/data/collections";
import VENUE_EVENTS from "@/data/venue-events.json" with { type: "json" };
import TRANSIT from "@/data/transit.json" with { type: "json" };
import SCORES_RAW from "@/data/copy-scores.json" with { type: "json" };
import PHOTOS_RAW from "@/data/places-photos.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import { clientPlaces } from "@/lib/loaders/places-client";
import { getNeedsReviewPlaces } from "@/lib/loaders/places";
import { getNeedsReviewEvents } from "@/lib/loaders/events";
import { easternDayKey } from "@/lib/tz";

/**
 * /admin — the operations desk.
 *
 * The old home was an inventory (stats, a 300-row place list, a duplicate
 * of the feed board). A solo operator at 7 AM needs one answer: what needs
 * me today? So the desk leads with an action QUEUE (rows exist only when
 * something is actually waiting), then the beta pulse, a cost sentinel
 * that compares today against the week's median instead of printing raw
 * numbers, and a DATASET board that watches the freshness of every
 * shipped data file - the layer nothing else was watching (owner ask,
 * Jul 2026). Deep inventories still live one tap away (data-health, beta,
 * costs, claims).
 *
 * Every DB read fails soft: without a database (or before a migration is
 * applied) the section says so quietly and the rest of the desk stands.
 */

export const metadata: Metadata = {
  // Root layout's metadata.title.template adds " · Frederick Radius";
  // including it here would double-suffix.
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SCORES = SCORES_RAW as { computed_at: string; counts: Record<string, number> };

// ── Desk data ───────────────────────────────────────────────────────────

type Queue = {
  feedbackPending: number;
  submissionsPending: number;
  claimsPending: number;
  reportsPending: number;
};

type BetaPulse = {
  codesActive: number;
  codesTotal: number;
  codesSeen7d: number;
  signupsTotal: number;
  signups7d: number;
  pushDevices: number;
};

type CostRow = { upstream: string; today: number; median7: number; spike: boolean };

type Signals = {
  signups1w: number;
  signupsPrev1w: number;
  new24h: { signups: number; feedback: number; claims: number; subs: number };
  quietFeeds: number;
  feedsLive: number;
};

type PipelineRun = { src: string; ageH: number; status: string };

async function loadDesk(): Promise<{
  queue: Queue | null;
  pulse: BetaPulse | null;
  costs: CostRow[] | null;
  signals: Signals | null;
  pipeline: PipelineRun[];
  dbReason?: string;
}> {
  const db = getDb();
  if (!db) return { queue: null, pulse: null, costs: null, signals: null, pipeline: [], dbReason: "no database configured" };
  try {
    const n = sql<number>`count(*)::int`;
    // Await SEQUENTIALLY, never Promise.all: the prod pool is Supavisor
    // transaction mode (max:1 per instance), so concurrent queries over the one
    // connection deadlock and the page hangs forever (the lesson of #1024 — the
    // /admin/beta desk was fixed then, but this hub kept the Promise.all and
    // hung the moment someone actually authenticated in).
    const subRows = await db
      .select({ kind: submissions.kind, n })
      .from(submissions)
      .where(sql`${submissions.status} = 'pending'`)
      .groupBy(submissions.kind);
    const codeRows = await db
      .select({
        total: n,
        active: sql<number>`count(*) filter (where not ${beta_codes.revoked})::int`,
        seen7d: sql<number>`count(*) filter (where ${beta_codes.last_seen_at} > now() - interval '7 days')::int`,
      })
      .from(beta_codes);
    const emailRows = await db
      .select({
        total: n,
        recent: sql<number>`count(*) filter (where ${beta_emails.created_at} > now() - interval '7 days')::int`,
      })
      .from(beta_emails);
    const pushRows = await db.select({ n }).from(push_subscriptions);
    const reportRows = await db
      .select({ n })
      .from(community_reports)
      .where(sql`${community_reports.status} = 'pending'`);

    const byKind = Object.fromEntries(subRows.map((r) => [r.kind, r.n]));
    const feedbackPending = byKind["feedback"] ?? 0;
    // Claims are inserted with kind "business_claim" (submit/actions.ts), NOT
    // "claim" — the old key read 0 always, so the owner was blind to waiting
    // claims and they were silently folded into the submissions count.
    const claimsPending = byKind["business_claim"] ?? 0;
    const submissionsPending = subRows.reduce((a, r) => a + r.n, 0) - feedbackPending - claimsPending;

    // Cost sentinel: today vs the median of the prior seven days, per
    // upstream. A spike is 3x the median with real volume - the signal
    // that saves money, vs a raw count that means nothing at a glance.
    let costs: CostRow[] | null = null;
    try {
      const rows = await db
        .select({ upstream: usage_counters.upstream, day: usage_counters.day, count: usage_counters.count })
        .from(usage_counters)
        .where(sql`${usage_counters.day} > (now() at time zone 'America/New_York')::date - 8`);
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
      costs = null; // usage_counters not migrated yet - the sentinel says so below
    }

    // Momentum + system-health signals. Raw SQL via getSql (same pooled
    // connection as db — still SEQUENTIAL, never concurrent). Fail-soft.
    let signals: Signals | null = null;
    let pipeline: PipelineRun[] = [];
    const raw = getSql();
    if (raw) {
      try {
        const sig = (
          await raw`
            select
              (select count(*)::int from beta_emails where created_at > now() - interval '7 days') as signups_1w,
              (select count(*)::int from beta_emails where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days') as signups_prev_1w,
              (select count(*)::int from beta_emails where created_at > now() - interval '24 hours') as new_signups_24h,
              (select count(*)::int from submissions where kind='feedback' and created_at > now() - interval '24 hours') as new_feedback_24h,
              (select count(*)::int from submissions where kind='business_claim' and created_at > now() - interval '24 hours') as new_claims_24h,
              (select count(*)::int from submissions where kind in ('place','event') and created_at > now() - interval '24 hours') as new_subs_24h,
              (with latest as (select distinct on (source) source, count, taken_at from feed_snapshots order by source, taken_at desc),
                    avg7 as (select source, avg(count) avg_count from feed_snapshots where taken_at > now() - interval '7 days' group by source)
               select count(*)::int from latest l join avg7 a using (source)
               where l.count = 0 and a.avg_count >= 1 and l.taken_at > now() - interval '36 hours') as quiet_feeds,
              (select count(distinct source)::int from feed_snapshots where taken_at > now() - interval '36 hours') as feeds_live
          `
        )[0] as Record<string, number>;
        signals = {
          signups1w: sig.signups_1w ?? 0,
          signupsPrev1w: sig.signups_prev_1w ?? 0,
          new24h: {
            signups: sig.new_signups_24h ?? 0,
            feedback: sig.new_feedback_24h ?? 0,
            claims: sig.new_claims_24h ?? 0,
            subs: sig.new_subs_24h ?? 0,
          },
          quietFeeds: sig.quiet_feeds ?? 0,
          feedsLive: sig.feeds_live ?? 0,
        };
        const runs = (await raw`
          select source_slug as src,
                 round(extract(epoch from now() - ended_at) / 3600)::int as age_h,
                 status
          from (
            select distinct on (source_slug) source_slug, ended_at, status
            from ingest_runs order by source_slug, ended_at desc nulls last
          ) t
          order by ended_at desc nulls last
        `) as { src: string; age_h: number; status: string }[];
        pipeline = runs.map((r) => ({ src: r.src, ageH: r.age_h, status: r.status }));
      } catch {
        signals = null;
        pipeline = [];
      }
    }

    return {
      queue: {
        feedbackPending,
        submissionsPending,
        claimsPending,
        reportsPending: reportRows[0]?.n ?? 0,
      },
      pulse: {
        codesActive: codeRows[0]?.active ?? 0,
        codesTotal: codeRows[0]?.total ?? 0,
        codesSeen7d: codeRows[0]?.seen7d ?? 0,
        signupsTotal: emailRows[0]?.total ?? 0,
        signups7d: emailRows[0]?.recent ?? 0,
        pushDevices: pushRows[0]?.n ?? 0,
      },
      costs,
      signals,
      pipeline,
    };
  } catch (e) {
    return { queue: null, pulse: null, costs: null, signals: null, pipeline: [], dbReason: e instanceof Error ? e.message.slice(0, 80) : "query failed" };
  }
}

// ── Dataset freshness ───────────────────────────────────────────────────

type AgeTone = "fresh" | "aging" | "stale" | "none";

function ageOf(iso: string | undefined, agingDays: number, staleDays: number): { label: string; tone: AgeTone } {
  if (!iso) return { label: "no stamp", tone: "none" };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { label: "no stamp", tone: "none" };
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  const label = days <= 0 ? "today" : days === 1 ? "1 day old" : `${days} days old`;
  return { label, tone: days >= staleDays ? "stale" : days >= agingDays ? "aging" : "fresh" };
}


export default async function AdminDesk() {
  // eslint-disable-next-line react-hooks/purity -- force-dynamic operations desk; the render clock is the point
  const now = Date.now();
  const desk = await loadDesk();
  const reviewPlaces = getNeedsReviewPlaces().length;
  const reviewEvents = getNeedsReviewEvents().length;

  const venueRows = VENUE_EVENTS as Array<{ source: { fetchedAt: string } }>;
  const venueLatest = venueRows.map((r) => r.source.fetchedAt).sort().at(-1);
  const transit = TRANSIT as { generatedAt: string; routes: unknown[]; stops: unknown[] };
  const needsVerify = PLACES.filter((p) => !p.is_operational || p.is_operational === "needs_verification").length;
  const overrides = OVERRIDES_RAW as Record<string, unknown>;

  const datasets: Array<{
    name: string;
    rows: string;
    stamp: { label: string; tone: AgeTone };
    note: string;
  }> = [
    {
      name: "Curated places",
      rows: String(PLACES.length),
      stamp: { label: `${needsVerify} need verification`, tone: needsVerify > 0 ? "aging" : "fresh" },
      note: "places.ts · after edits run build:client-places",
    },
    {
      name: "Client dataset",
      rows: String(clientPlaces().length),
      stamp: { label: "rebuilt with each place edit", tone: "none" },
      note: "places-client.json · what search, map, and cards actually read",
    },
    {
      name: "Venue event lineups",
      rows: String(venueRows.length),
      stamp: ageOf(venueLatest, 7, 14),
      note: "venue-events.json · npm run ingest:venues refreshes",
    },
    {
      name: "Transit GTFS snapshot",
      rows: `${transit.routes.length} routes · ${transit.stops.length} stops`,
      stamp: ageOf(transit.generatedAt, 60, 120),
      note: "transit.json · route shapes + stops behind the pearls board",
    },
    {
      name: "Copy quality scores",
      rows: `${SCORES.counts.scraped} scraped`,
      stamp: ageOf(SCORES.computed_at, 7, 21),
      note: "copy-scores.json · nightly cron recomputes",
    },
    {
      name: "Photo mirror",
      rows: String(Object.keys(PHOTOS_RAW as Record<string, unknown>).length),
      stamp: { label: "billed once, then blob-cached", tone: "none" },
      note: "places-photos.json · hero photos on the blob CDN",
    },
    {
      name: "Human corrections",
      rows: String(Object.keys(overrides).length),
      stamp: { label: "wins over every normalizer", tone: "none" },
      note: "places-overrides.json · fold / remove / patch",
    },
    {
      name: "Event seeds",
      rows: String(EVENTS.length),
      stamp: { label: "dates audited Jul 2026", tone: "fresh" },
      note: "events.ts · tentpoles the live feeds don't carry",
    },
    {
      name: "Collections",
      rows: String(COLLECTIONS.length),
      stamp: { label: "hand-curated", tone: "none" },
      note: "collections.ts · never auto-detected",
    },
  ];

  // Ingests that errored on their most recent run in the last 2 days (a dead
  // cron silently stops data flowing — surface it as an action item).
  const ingestErrors = desk.pipeline.filter((r) => r.status !== "ok" && r.ageH <= 48).length;

  const queueRows: Array<{ label: string; n: number; href: string; icon: LucideIcon }> = desk.queue
    ? [
        { label: "Feedback waiting", n: desk.queue.feedbackPending, href: "/admin/beta", icon: MessageSquare },
        { label: "Submissions", n: desk.queue.submissionsPending, href: "/admin/claims", icon: Inbox },
        { label: "Business claims", n: desk.queue.claimsPending, href: "/admin/claims", icon: Store },
        { label: "Community reports", n: desk.queue.reportsPending, href: "/admin/reports", icon: Flag },
        { label: "Places need coordinate review", n: reviewPlaces, href: "/admin/data-health", icon: MapPin },
        { label: "Events need review", n: reviewEvents, href: "/admin/data-health", icon: CalendarClock },
        // Real feed health from feed_snapshots: feeds that usually carry events
        // but parsed 0 today (NOT the key-missing count, which is intentional).
        { label: "Feeds went quiet today", n: desk.signals?.quietFeeds ?? 0, href: "/admin/data-health", icon: RadioTower },
        { label: "Ingests erroring", n: ingestErrors, href: "/admin/data-health", icon: Activity },
      ].filter((r) => r.n > 0)
    : [];

  // "New in 24h" momentum line.
  const n24 = desk.signals?.new24h;
  const new24hTotal = n24 ? n24.signups + n24.feedback + n24.claims + n24.subs : 0;
  const new24hParts = n24
    ? [
        n24.signups ? `${n24.signups} signup${n24.signups === 1 ? "" : "s"}` : null,
        n24.feedback ? `${n24.feedback} feedback` : null,
        n24.claims ? `${n24.claims} claim${n24.claims === 1 ? "" : "s"}` : null,
        n24.subs ? `${n24.subs} submission${n24.subs === 1 ? "" : "s"}` : null,
      ].filter((x): x is string => x !== null)
    : [];

  // Signups week-over-week trend + a quiet spend-status derived from the cost
  // sentinel (loud only on a spike).
  const signupsDelta = desk.signals ? desk.signals.signups1w - desk.signals.signupsPrev1w : 0;
  const spendSpike = (desk.costs ?? []).some((c) => c.spike);
  // Freshest successful ingest + demoted dataset freshness summary.
  const okRun = desk.pipeline.filter((r) => r.status === "ok").sort((a, b) => a.ageH - b.ageH)[0];
  const freshCount = datasets.filter((d) => d.stamp.tone === "fresh").length;
  const agingCount = datasets.filter((d) => d.stamp.tone === "aging").length;
  const staleCount = datasets.filter((d) => d.stamp.tone === "stale").length;

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/" className="text-xs" style={{ color: "var(--app-cool)" }}>← Back to Frederick Radius</Link>

      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Operations desk
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          What needs you
        </h1>
      </header>

      <BuildStamp />

      {/* ── The queue: a light list, hairlines not cards. Rows exist only when
          something is waiting; otherwise a clean all-clear. ── */}
      <section className="mt-5">
        {desk.queue === null ? (
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
                  <Link href={r.href} className="flex items-center gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5 transition hover:bg-[var(--app-bg-sunken)]">
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
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>The vitals</h2>
          <Link href="/admin/beta" className="text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>Beta →</Link>
        </div>
        {desk.pulse === null ? (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>Needs the database ({desk.dbReason}).</p>
        ) : (
          <div className="flex items-stretch justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3" style={{ borderColor: "var(--app-border)" }}>
            <Vital value={desk.pulse.codesSeen7d} label="active · 7d" tone="positive" />
            <VDiv />
            <Vital value={desk.pulse.signupsTotal} label="signups" delta={signupsDelta} />
            <VDiv />
            <Vital value={`${desk.pulse.codesActive}/${desk.pulse.codesTotal}`} label="codes live" />
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
          spend detail. One quiet line each, full detail one tap away. ── */}
      <section className="mt-7 space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>System</h2>

        <Link href="/admin/data-health" className="flex items-center gap-2.5 no-underline">
          <Activity className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <span className="flex-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            {okRun ? `Last ingest ${fmtAge(okRun.ageH)} ago` : "No successful ingest logged"}
            {ingestErrors > 0 && <span style={{ color: "var(--app-warning)", fontWeight: 600 }}> · {ingestErrors} erroring</span>}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        </Link>

        <Link href="/admin/data-health" className="flex items-center gap-2.5 no-underline">
          <Database className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <span className="flex-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            {datasets.length} datasets · <span style={{ color: "var(--app-positive)" }}>{freshCount} fresh</span>
            {agingCount > 0 && <>, <span style={{ color: "var(--app-warning)" }}>{agingCount} aging</span></>}
            {staleCount > 0 && <>, <span style={{ color: "var(--app-danger)" }}>{staleCount} stale</span></>}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        </Link>

        <Link href="/admin/costs" className="flex items-center gap-2.5 no-underline">
          <Receipt className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <span className="flex-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            {desk.costs === null
              ? "Spend not metered yet"
              : desk.costs.length === 0
                ? "No paid calls in 8 days"
                : spendSpike
                  ? <span style={{ color: "var(--app-danger)", fontWeight: 600 }}>Cost spike today</span>
                  : "Spend normal today"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        </Link>
      </section>

      {/* ── Keys & switches — what's wired in THIS deployment. ── */}
      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Keys & switches</h2>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          <KeyChip label="Database" on={Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL)} />
          <KeyChip label="Rate limits (KV)" on={Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)} />
          <KeyChip label="Google Places" on={Boolean(process.env.GOOGLE_PLACES_API_KEY)} />
          <KeyChip label="Anthropic" on={Boolean(process.env.ANTHROPIC_API_KEY)} />
          <KeyChip label="Eventbrite" on={Boolean(process.env.EVENTBRITE_TOKEN)} />
          <KeyChip label="Ticketmaster" on={Boolean(process.env.TICKETMASTER_API_KEY)} />
          <KeyChip label="Blob storage" on={Boolean(process.env.BLOB_READ_WRITE_TOKEN)} />
          <KeyChip label="Resend email" on={Boolean(process.env.RESEND_API_KEY)} />
          <KeyChip label="Beta wall" on={Boolean(process.env.BETA_PASSWORD)} />
        </div>
      </section>

      {/* ── Doors ── */}
      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Doors</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <ActionTile href="/admin/beta" title="Beta" icon={LayoutDashboard} />
          <ActionTile href="/admin/beta-codes" title="Codes" icon={KeyRound} />
          <ActionTile href="/admin/claims" title="Submissions" icon={Inbox} />
          <ActionTile href="/admin/field-notes" title="Field notes" icon={StickyNote} />
          <ActionTile href="/admin/costs" title="Costs" icon={Receipt} />
          <ActionTile href="/admin/data-health" title="Data health" icon={Activity} />
          <ActionTile href="/admin/coverage" title="Coverage" icon={MapPinned} />
          <ActionTile href="/admin/beta-emails" title="Emails" icon={Mail} />
          <ActionTile href="/admin/reports" title="Reports" icon={Flag} />
          <ActionTile href="/admin/notify" title="Broadcast" icon={Megaphone} />
          <ActionTile href="/admin/copy-review" title="Copy" icon={PenLine} />
          <ActionTile href="/admin/dedup-review" title="Dedup" icon={Copy} />
          <ActionTile href="/admin/drift-review" title="Drift" icon={GitCompare} />
          <ActionTile href="/admin/discovered-review" title="Discovered" icon={Sparkles} />
        </div>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Rendered fresh on every request ({new Date(now).toISOString()}). Gated by HTTP Basic Auth in
        middleware; unreachable unless ADMIN_USER and ADMIN_PASSWORD are set.
      </p>
    </div>
  );
}

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

/** One vital in the glance strip: a big serif number, a label, and an optional
 *  week-over-week delta (green when growing). */
function Vital({ value, label, tone, delta }: { value: number | string; label: string; tone?: "positive" | "warning"; delta?: number }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "warning" ? "var(--app-warning)" : "var(--app-ink)";
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

function KeyChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-between rounded-full border px-3 py-1.5 text-[11.5px] font-medium"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
    >
      {label}
      <span
        aria-hidden
        className="ml-2 inline-block h-2 w-2 rounded-full"
        style={{ background: on ? "var(--app-positive)" : "var(--app-warning)" }}
      />
    </span>
  );
}

/**
 * BuildStamp — which build is live, and what the server thinks "today" is.
 * Force-dynamic, so a stale prod build or a wrong server clock is visible
 * on sight (this page's oldest and still most-used trick).
 */
function BuildStamp() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const renderedAt = new Date();
  const easternDay = easternDayKey(renderedAt);
  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--app-radius-md)] border px-3 py-2 text-[11px]"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-3)" }}
    >
      <span>
        <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Build</span>{" "}
        <code>{sha ? sha.slice(0, 12) : "dev (local / no Vercel SHA)"}</code>
        {ref ? <span> · {ref}</span> : null}
      </span>
      <span aria-hidden>·</span>
      <span>
        <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Eastern day</span> {easternDay}
      </span>
    </div>
  );
}

function ActionTile({ href, title, icon: Icon }: { href: string; title: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="tap-44 flex flex-col items-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-2 py-3.5 text-center transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--app-brand-2) 12%, transparent)" }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} />
      </span>
      <span className="text-[12px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{title}</span>
    </Link>
  );
}

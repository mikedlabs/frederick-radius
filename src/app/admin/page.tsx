import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
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
import { darkFeedCount } from "@/lib/integrations/feed-registry";
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

async function loadDesk(): Promise<{
  queue: Queue | null;
  pulse: BetaPulse | null;
  costs: CostRow[] | null;
  dbReason?: string;
}> {
  const db = getDb();
  if (!db) return { queue: null, pulse: null, costs: null, dbReason: "no database configured" };
  try {
    const n = sql<number>`count(*)::int`;
    const [subRows, codeRows, emailRows, pushRows] = await Promise.all([
      db
        .select({ kind: submissions.kind, n })
        .from(submissions)
        .where(sql`${submissions.status} = 'pending'`)
        .groupBy(submissions.kind),
      db
        .select({
          total: n,
          active: sql<number>`count(*) filter (where not ${beta_codes.revoked})::int`,
          seen7d: sql<number>`count(*) filter (where ${beta_codes.last_seen_at} > now() - interval '7 days')::int`,
        })
        .from(beta_codes),
      db
        .select({
          total: n,
          recent: sql<number>`count(*) filter (where ${beta_emails.created_at} > now() - interval '7 days')::int`,
        })
        .from(beta_emails),
      db.select({ n }).from(push_subscriptions),
    ]);
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
    };
  } catch (e) {
    return { queue: null, pulse: null, costs: null, dbReason: e instanceof Error ? e.message.slice(0, 80) : "query failed" };
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

const TONE_COLOR: Record<AgeTone, string> = {
  fresh: "var(--app-positive)",
  aging: "var(--app-warning)",
  stale: "var(--app-danger)",
  none: "var(--app-ink-3)",
};

export default async function AdminDesk() {
  // eslint-disable-next-line react-hooks/purity -- force-dynamic operations desk; the render clock is the point
  const now = Date.now();
  const desk = await loadDesk();
  const reviewPlaces = getNeedsReviewPlaces().length;
  const reviewEvents = getNeedsReviewEvents().length;
  const dark = darkFeedCount();

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

  const queueRows: Array<{ label: string; n: number; href: string }> = desk.queue
    ? [
        { label: "Feedback waiting", n: desk.queue.feedbackPending, href: "/admin/beta" },
        { label: "Place & event submissions", n: desk.queue.submissionsPending, href: "/admin/claims" },
        { label: "Business claims", n: desk.queue.claimsPending, href: "/admin/claims" },
        { label: "Community reports", n: desk.queue.reportsPending, href: "/admin/reports" },
        { label: "Places needing coordinate review", n: reviewPlaces, href: "/admin/data-health" },
        { label: "Events needing review", n: reviewEvents, href: "/admin/data-health" },
        { label: "Feeds dark (key missing)", n: dark, href: "/admin/data-health" },
      ].filter((r) => r.n > 0)
    : [];

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

      {/* ── The queue — rows exist only when something is waiting. ── */}
      <section className="mt-6">
        {desk.queue === null ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-4 text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            Queue unavailable: {desk.dbReason}. Static checks below still run.
          </p>
        ) : queueRows.length === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border px-4 py-4 text-[14px] font-medium" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-positive)" }}>
            All clear. Nothing is waiting on you.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {queueRows.map((r) => (
              <li key={r.label}>
                <Link
                  href={r.href}
                  className="flex items-center justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-3 transition hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span className="text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>{r.label}</span>
                  <span className="font-mono text-[15px] font-bold tabular-nums" style={{ color: "var(--app-brand-press)" }}>{r.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Beta pulse ── */}
      <section className="mt-7 space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Beta pulse</h2>
          <Link href="/admin/beta" className="text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>Full dashboard →</Link>
        </div>
        {desk.pulse === null ? (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>Needs the database ({desk.dbReason}).</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Testers active · 7d" value={desk.pulse.codesSeen7d} tone="positive" />
            <Stat label="Codes live / issued" value={`${desk.pulse.codesActive}/${desk.pulse.codesTotal}`} />
            <Stat label="Push devices" value={desk.pulse.pushDevices} />
            <Stat label="Signups · 7d" value={desk.pulse.signups7d} tone={desk.pulse.signups7d > 0 ? "positive" : undefined} />
            <Stat label="Signups · all" value={desk.pulse.signupsTotal} />
            <Stat label="Feeds dark" value={dark} tone={dark > 0 ? "warning" : "positive"} />
          </div>
        )}
      </section>

      {/* ── Cost sentinel ── */}
      <section className="mt-7 space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Cost sentinel · today vs 7-day median</h2>
          <Link href="/admin/costs" className="text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>Costs →</Link>
        </div>
        {desk.costs === null ? (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Waiting on the usage_counters migration (drizzle/0017). Until it runs, paid calls are unmetered here.
          </p>
        ) : desk.costs.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>No metered calls in the last 8 days.</p>
        ) : (
          <ul className="space-y-1">
            {desk.costs.map((c) => (
              <li
                key={c.upstream}
                className="flex items-center justify-between rounded-[var(--app-radius-md)] border px-3 py-2 font-mono text-[12px] tabular-nums"
                style={{
                  borderColor: c.spike ? "color-mix(in srgb, var(--app-danger) 50%, var(--app-border))" : "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                  color: "var(--app-ink-2)",
                }}
              >
                <span>{c.upstream}</span>
                <span>
                  {c.today} today · median {c.median7}
                  {c.spike && <span className="ml-2 font-sans font-bold" style={{ color: "var(--app-danger)" }}>~{Math.round(c.today / Math.max(1, c.median7))}x SPIKE</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Dataset board — the freshness layer nothing else watched. ── */}
      <section className="mt-7 space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Datasets on board</h2>
          <Link href="/admin/data-health" className="text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>Deep health →</Link>
        </div>
        <ul className="space-y-1.5">
          {datasets.map((d) => (
            <li
              key={d.name}
              className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-2.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{d.name}</span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>{d.rows}</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{d.note}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium" style={{ color: TONE_COLOR[d.stamp.tone] }}>
                  {d.stamp.tone !== "none" && (
                    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: TONE_COLOR[d.stamp.tone] }} />
                  )}
                  {d.stamp.label}
                </span>
              </div>
            </li>
          ))}
        </ul>
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ActionTile href="/admin/beta" title="Beta dashboard" desc="Signups, feedback inbox, tester activity" />
          <ActionTile href="/admin/beta-codes" title="Beta codes" desc="Generate, track, revoke per-tester codes" />
          <ActionTile href="/admin/claims" title="Review submissions" desc="Places, events, business claims" />
          <ActionTile href="/admin/costs" title="Usage costs" desc="Meter, rates, cost-control checklist" />
          <ActionTile href="/admin/data-health" title="Data health" desc="Feeds, trust ladder, review queues, ingest runs" />
          <ActionTile href="/admin/beta-emails" title="Beta emails" desc="Launch list + CSV export" />
        </div>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Rendered fresh on every request ({new Date(now).toISOString()}). Gated by HTTP Basic Auth in
        middleware; unreachable unless ADMIN_USER and ADMIN_PASSWORD are set.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "positive" | "warning" }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "warning" ? "var(--app-warning)" : "var(--app-ink)";
  return (
    <div className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-center" style={{ borderColor: "var(--app-border)" }}>
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>{label}</p>
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

function ActionTile({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="font-semibold" style={{ color: "var(--app-ink)" }}>{title}</p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>{desc}</p>
    </Link>
  );
}

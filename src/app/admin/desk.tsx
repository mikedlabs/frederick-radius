import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  MessageSquare, Inbox, Store, Flag, MapPin, CalendarClock, RadioTower,
  Activity, Receipt, Database, MapPinned, ChevronRight, CircleCheck,
  TrendingUp, TrendingDown, BellRing, Mail, ShieldCheck, Webhook, Github,
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
import {
  getCachedPublicHealthSnapshot,
  type PublicHealthSnapshot,
} from "@/lib/public-health";
import {
  publicDataSnapshot,
  publicHoursProductHealth,
  type PublicHoursProductHealth,
} from "@/lib/public-data-snapshot";
import { hasCompleteVapidConfiguration } from "@/lib/push";
import { OWNER_ALERTS_TOPIC } from "@/lib/push-topics";
import {
  HairlineList,
  HairlineRow,
  StatusPill,
  toneInk,
  toneTint,
  type Tone,
} from "@/components/admin/kit";
import {
  operationsHealthLevel,
  ownerPushReadiness,
  sentryReadiness,
  type OperationsHealthLevel,
} from "./operations-status";

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
      <div className="h-32 rounded-[var(--app-radius-md)]" style={{ background: "var(--app-bg-elevated)" }} />
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
  ownerAlertDevices: number;
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
          (select count(*)::int from push_subscriptions where topics ? ${OWNER_ALERTS_TOPIC}) as owner_alert_devices
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
      ownerAlertDevices: r.owner_alert_devices ?? 0,
    };
  } catch (e) {
    return { core: null, health: null, costs: null, dbReason: e instanceof Error ? e.message.slice(0, 80) : "query failed" };
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
        and upstream not like 'idempotency:%'
        and upstream not like 'lease:%'
        and upstream not like 'daily-cap:%'
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

type DeploymentHealth = {
  snapshot: PublicHealthSnapshot;
  hours: PublicHoursProductHealth;
};

async function loadDeploymentHealth(): Promise<DeploymentHealth | null> {
  try {
    const snapshot = await getCachedPublicHealthSnapshot();
    const hours = publicHoursProductHealth(publicDataSnapshot());
    return { snapshot, hours };
  } catch {
    // Keep the owner surface standing if a future health dependency escapes
    // its own fail-soft boundary. Unknown is intentionally not rendered green.
    console.warn("[admin] deployment health was unavailable");
    return null;
  }
}

const LEVEL_PRESENTATION: Record<
  OperationsHealthLevel,
  { tone: Tone; label: string; title: string; summary: string }
> = {
  operational: {
    tone: "positive",
    label: "Operational",
    title: "The public experience is ready",
    summary: "The public health checks and Open Now coverage are ready.",
  },
  "policy-hold": {
    tone: "cool",
    label: "Operational",
    title: "Core production checks are ready",
    summary: "Current-hours refresh is intentionally paused. This is a known product limit, not a production incident.",
  },
  degraded: {
    tone: "warning",
    label: "Degraded",
    title: "Current data needs attention",
    summary: "The app is answering, but at least one current-data check needs attention.",
  },
  blocked: {
    tone: "danger",
    label: "Action required",
    title: "A required public check is on hold",
    summary: "A required dependency or public surface is not ready. Review the details before treating the site as healthy.",
  },
  unknown: {
    tone: "warning",
    label: "Unknown",
    title: "Production status is unavailable",
    summary: "The health check did not answer, so this page will not assume the site is healthy.",
  },
};

const SURFACE_LABELS = {
  today: "Today",
  ask: "Ask",
  map: "Map",
  events: "Events",
} as const;

function checkedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Check time unavailable";
  return `Checked ${date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET`;
}

function countLine(
  current: number | null,
  total: number | null,
  noun: string,
): string {
  if (current === null || total === null) return `${noun} count unavailable.`;
  return `${current.toLocaleString()} of ${total.toLocaleString()} ${noun} are current.`;
}

function ProductionStatus({ health }: { health: DeploymentHealth | null }) {
  const snapshot = health?.snapshot ?? null;
  const hours = health?.hours ?? null;
  const level = operationsHealthLevel(snapshot, hours);
  const presentation = LEVEL_PRESENTATION[level];
  const environment = snapshot?.deployment.environment;
  const environmentLabel =
    environment === "production"
      ? "Production"
      : environment === "preview"
        ? "Preview deployment"
        : environment === "development"
          ? "Development"
          : "Deployment";
  const databaseTone: Tone =
    snapshot?.database.status === "reachable" ? "positive" : "danger";
  const dataTone: Tone =
    snapshot?.data.status === "current"
      ? "positive"
      : snapshot?.data.status === "unavailable"
        ? "danger"
        : "warning";
  const hoursTone: Tone =
    hours?.status === "current"
      ? "positive"
      : hours?.status === "policy_hold"
        ? "cool"
        : "warning";
  const hoursDetail =
    hours?.status === "policy_hold"
      ? hours.operatorMessage ?? "Current-hours refresh is intentionally paused."
      : hours
        ? countLine(hours.current, hours.expected, "places")
        : "Current-hours coverage did not answer.";
  const hoursLabel =
    hours?.status === "policy_hold"
      ? "Policy hold"
      : hours?.coveragePct !== null && hours?.coveragePct !== undefined
        ? `${hours.coveragePct}%`
        : "Unknown";
  const surfaces = snapshot
    ? Object.entries(snapshot.readiness.surfaces).map(([key, value]) => ({
        label: SURFACE_LABELS[key as keyof typeof SURFACE_LABELS],
        status: value.status,
      }))
    : [];
  const held = surfaces.filter((surface) => surface.status === "hold");
  const partial = surfaces.filter((surface) => surface.status === "partial");
  const surfaceTone: Tone = held.length > 0 ? "danger" : partial.length > 0 ? "warning" : snapshot ? "positive" : "warning";
  const surfaceLabel = held.length > 0 ? "On hold" : partial.length > 0 ? "Partial" : snapshot ? "Ready" : "Unknown";
  const surfaceDetail = held.length > 0
    ? `${held.map((surface) => surface.label).join(", ")} ${held.length === 1 ? "is" : "are"} on hold.`
    : partial.length > 0
      ? `${partial.map((surface) => surface.label).join(", ")} ${partial.length === 1 ? "has" : "have"} partial data.`
      : snapshot
        ? "Today, Ask, Map, and Events passed their readiness checks."
        : "Surface readiness did not answer.";

  return (
    <section className="mt-5" aria-labelledby="production-status-heading">
      <div
        className="rounded-[var(--app-radius-md)] border-l-4 px-4 py-4"
        style={{
          borderColor: toneInk(presentation.tone),
          background: toneTint(presentation.tone, 8),
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
              {environmentLabel} status
            </p>
            <h2 id="production-status-heading" className="mt-1 text-[20px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
              {presentation.title}
            </h2>
          </div>
          <span className="shrink-0">
            <StatusPill tone={presentation.tone}>{presentation.label}</StatusPill>
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {presentation.summary}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
          <span>
            {snapshot ? checkedAt(snapshot.generatedAt) : "No completed health check"}
            {snapshot?.deployment.revision ? ` · Revision ${snapshot.deployment.revision.slice(0, 7)}` : ""}
          </span>
          <Link href="/admin/data-health" className="tap-44 inline-flex items-center font-semibold" style={{ color: "var(--app-cool)" }}>
            Open data health →
          </Link>
        </div>
      </div>

      <div className="mt-2">
        <HairlineList>
          <HairlineRow
            index={0}
            dot={databaseTone}
            title="Database"
            subtitle={
              snapshot?.database.status === "reachable"
                ? `Answered in ${snapshot.database.latencyMs ?? "unknown"} ms.`
                : "The database check did not answer."
            }
            badge={<StatusPill tone={databaseTone}>{snapshot?.database.status === "reachable" ? "Reachable" : snapshot?.database.status ?? "Unknown"}</StatusPill>}
          />
          <HairlineRow
            index={1}
            dot={dataTone}
            title="Current sources"
            subtitle={snapshot ? countLine(snapshot.data.current, snapshot.data.tracked, "sources") : "Source health did not answer."}
            badge={<StatusPill tone={dataTone}>{snapshot?.data.status ?? "Unknown"}</StatusPill>}
          />
          <HairlineRow
            index={2}
            dot={hoursTone}
            title="Open Now coverage"
            subtitle={hoursDetail}
            badge={<StatusPill tone={hoursTone}>{hoursLabel}</StatusPill>}
          />
          <HairlineRow
            index={3}
            dot={surfaceTone}
            title="Public surfaces"
            subtitle={surfaceDetail}
            badge={<StatusPill tone={surfaceTone}>{surfaceLabel}</StatusPill>}
          />
        </HairlineList>
      </div>
    </section>
  );
}

function AlertReadiness({ ownerDevices }: { ownerDevices: number | null }) {
  const configured = (value: string | undefined) => Boolean(value?.trim());
  const vapidConfigured = hasCompleteVapidConfiguration();
  const ownerPush = ownerPushReadiness(vapidConfigured, ownerDevices);
  const serverSentryConfigured =
    configured(process.env.SENTRY_DSN) ||
    configured(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const browserSentryConfigured = configured(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const sentry = sentryReadiness(
    serverSentryConfigured,
    browserSentryConfigured,
  );
  const resendConfigured = configured(process.env.RESEND_API_KEY);
  const slackConfigured = configured(process.env.SLACK_WEBHOOK_URL);

  const ownerTone: Tone = ownerPush === "ready" ? "positive" : ownerPush === "unconfigured" ? "danger" : "warning";
  const ownerLabel = ownerPush === "ready"
    ? `${ownerDevices} device${ownerDevices === 1 ? "" : "s"}`
    : ownerPush === "no-device"
      ? "No device"
      : ownerPush === "unconfigured"
        ? "Not configured"
        : "Unknown";
  const ownerDetail = ownerPush === "ready"
    ? "Subscribed owner devices are targeted for feedback and signup alerts, including during quiet hours. Use the test control to verify delivery."
    : ownerPush === "no-device"
      ? "Push is configured, but no owner device is subscribed."
      : ownerPush === "unconfigured"
        ? "The VAPID set is incomplete. All three values are required."
        : "Push is configured, but the owner subscription count did not answer.";
  const sentryTone: Tone = sentry === "ready" ? "positive" : "warning";
  const sentryLabel = sentry === "ready"
    ? "Server + browser"
    : sentry === "server-only"
      ? "Server only"
      : sentry === "browser-only"
        ? "Browser only"
        : "Not configured";
  const sentryDetail = sentry === "ready"
    ? "Server and browser errors can be captured."
    : sentry === "server-only"
      ? "Browser error capture is not configured."
      : sentry === "browser-only"
        ? "Server error capture is not configured."
        : "Sentry error capture is not configured.";

  return (
    <section className="mt-6" aria-labelledby="alert-readiness-heading">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <h2 id="alert-readiness-heading" className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Alert coverage
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            These checks confirm the wiring on this deployment, not delivery to an inbox or device.
          </p>
        </div>
        <Link href="/admin/notify" className="tap-44 inline-flex shrink-0 items-center text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>
          Broadcast →
        </Link>
      </div>
      <HairlineList>
        <HairlineRow
          index={0}
          href="/admin/beta"
          icon={BellRing}
          iconTone={ownerTone}
          title="Owner push"
          subtitle={ownerDetail}
          badge={<StatusPill tone={ownerTone}>{ownerLabel}</StatusPill>}
        />
        <HairlineRow
          index={1}
          href="/admin/beta-emails"
          icon={Mail}
          iconTone={resendConfigured ? "positive" : "warning"}
          title="Owner email"
          subtitle={resendConfigured ? "Submission and claim emails can leave the app." : "Resend is not configured for owner email."}
          badge={<StatusPill tone={resendConfigured ? "positive" : "warning"}>{resendConfigured ? "Configured" : "Not configured"}</StatusPill>}
        />
        <HairlineRow
          index={2}
          icon={ShieldCheck}
          iconTone={sentryTone}
          title="Error capture"
          subtitle={sentryDetail}
          badge={<StatusPill tone={sentryTone}>{sentryLabel}</StatusPill>}
        />
        <HairlineRow
          index={3}
          icon={Webhook}
          iconTone={slackConfigured ? "positive" : "warning"}
          title="Health escalation"
          subtitle={slackConfigured ? "Data-health anomalies can request a Slack alert." : "No Slack webhook is configured for data-health anomalies."}
          badge={<StatusPill tone={slackConfigured ? "positive" : "warning"}>{slackConfigured ? "Configured" : "Not configured"}</StatusPill>}
        />
        <HairlineRow
          index={4}
          href="https://github.com/mikedlabs/frederick-radius/actions/workflows/production-health-alert.yml"
          icon={Github}
          iconTone="cool"
          title="Daily health issue"
          subtitle="The workflow is in this release. Confirm its latest run in GitHub."
          badge={<StatusPill tone="cool">Verify run</StatusPill>}
        />
      </HairlineList>
    </section>
  );
}

// ── The streamed DB block: queue + vitals + system ──────────────────────

export async function DeskSections() {
  // Keep the database work sequential. Both loaders touch the production pool,
  // whose max:1 constraint makes parallel reads look like outages.
  const deploymentHealth = await loadDeploymentHealth();
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
      <ProductionStatus health={deploymentHealth} />
      <AlertReadiness ownerDevices={desk.core?.ownerAlertDevices ?? null} />

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
            <span className="text-[14px] font-medium" style={{ color: "var(--app-positive)" }}>The review queue is clear. No submissions or data reviews are waiting.</span>
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

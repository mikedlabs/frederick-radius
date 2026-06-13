/**
 * Live Pulse — the one-screen civic snapshot for Frederick County.
 *
 * Mobile-first redesign. The previous version stacked seven dashboard
 * cards in a flat row regardless of state — even when nothing was
 * happening, the user scrolled through five "no active incidents"
 * cards before finding their answer. That's a directory of feeds,
 * not a live pulse.
 *
 * New architecture:
 *
 *   1. Hero — one editorial line whose verb changes with state:
 *      "All clear across the county", "3 situations across the
 *      county", "Heads-up across the county". A pulsing live dot
 *      (sage when calm, brick when active) makes it obviously live.
 *
 *   2. Status grid — 2×3 mobile, 3×2 tablet+, six tiles (Traffic,
 *      Power, Schools, 311, Safety, Police). Each tile shows icon,
 *      label, ONE big serif number, and a one-word status. The
 *      tile background tints with its accent color when active so
 *      the grid reads as a heat-map of where attention is needed.
 *      Tiles anchor-link to their sections below; Police opens the
 *      external CFS map.
 *
 *   3. Active sections — only sections with current data render
 *      below. Each card carries its accent color as a left-edge
 *      band, a serif title, a count chip, the rows, and a quiet
 *      source attribution at the bottom. No more empty cards.
 *
 *   4. Footer — last-updated line + disclaimer + the full source
 *      list with timestamps, so the data trail is honest.
 *
 * Every feed is fetched server-side, normalized, and rendered IN-
 * APP. The only outbound links are small "source" attributions —
 * the data itself lives here.
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity, Construction, Zap, School, AlertTriangle, Siren,
  CheckCircle2, ExternalLink, MapPin, Clock, ChevronRight,
  CloudAlert, Newspaper, Radio, Waves,
} from "lucide-react";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFrederickOutages } from "@/lib/integrations/firstenergy";
import { getFcpsAlerts } from "@/lib/integrations/fcps";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { getPulsePointIncidents } from "@/lib/integrations/pulsepoint";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { getLocalHeadlines } from "@/lib/integrations/news";
import PageBloom from "@/components/ui/PageBloom";
import CollapsibleDashSection from "@/components/pulse/CollapsibleDashSection";
import ScannerTimeline from "@/components/pulse/ScannerTimeline";
import LiveTransitPill from "@/components/transit/LiveTransitPill";

export const metadata: Metadata = {
  alternates: { canonical: "/alerts" },
  // Reached as a behavior, not a tab (Decision 3): the conditional
  // alert strip on Today links here, /pulse permanently redirects
  // here, and the header pulse indicator points here. No primary-nav
  // link, so it stays out of the focused-surface sitemap competition.
  robots: { index: false, follow: true },
  title: "Alerts",
  description:
    "Active alerts across Frederick County — weather, traffic, power, schools, and 311 — one screen instead of four government websites.",
};

export const revalidate = 120;

function timeAgo(iso: string): string {
  const d = Date.now() - +new Date(iso);
  if (!Number.isFinite(d) || d < 0) return "";
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function nowClock(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

export default async function PulsePage() {
  const [incidents, outages, fcps, fixit, safety, alerts, news] = await Promise.all([
    getChartIncidentsFrederick(),
    getFrederickOutages(),
    getFcpsAlerts(),
    getFixItIssues(15),
    getPulsePointIncidents(),
    // NWS active alerts for Frederick County, MD. When something's
    // up (severe storm, flood, heat advisory) this is the most
    // actionable feed in the dashboard and rides at the top.
    getNwsAlerts().catch(() => []),
    // Local headlines from Google News RSS — always-on city signal
    // even when the operational feeds are quiet.
    getLocalHeadlines().catch(() => []),
  ]);

  const sevRank = { High: 0, Medium: 1, Low: 2 } as const;
  const traffic = [...incidents].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity]
  );
  const schoolAlerts = fcps.filter((a) => a.status !== "unknown");

  // Power outages are "active" only when 25+ customers are out — below
  // that threshold the data is noise (a single transformer trip).
  const outagesActive = outages.total_out >= 25;
  const outagesCount = outagesActive ? outages.munis.length || 1 : 0;

  // Only count NWS alerts that haven't already expired. The feed
  // includes alerts with `ends_at` in the past until the cache cycles,
  // so we filter here to avoid double-counting a tornado watch the
  // page still knows about but the weather has moved past.
  // eslint-disable-next-line react-hooks/purity -- per-request expiry filter; hoisting Date.now would defeat the freshness check
  const nowMs = Date.now();
  const activeAlerts = alerts.filter(
    (a) => !a.ends_at || Date.parse(a.ends_at) > nowMs,
  );

  const totals = {
    alerts: activeAlerts.length,
    safety: safety.length,
    traffic: traffic.length,
    power: outagesCount,
    schools: schoolAlerts.length,
    fixit: fixit.length,
  };
  // totalActive rolls up every urgent feed — alerts included — so the
  // hero line reads truthfully when an NWS alert is up but the
  // operational feeds are calm. 311 reports are excluded: they're
  // collapsed by default and don't count as "situations" — most are
  // potholes and tree-limb requests, not emergencies.
  const totalActive =
    totals.alerts +
    totals.safety +
    totals.traffic +
    totals.power +
    totals.schools;
  const allClear = totalActive === 0;

  // Hero copy varies with state. The verb is the read.
  const heroLine = allClear
    ? "All clear across the county"
    : totalActive === 1
      ? "1 situation across the county"
      : `${totalActive} situations across the county`;
  const heroSub = allClear
    ? "No weather alerts, traffic, outages, or school alerts right now."
    : "Weather alerts, traffic, power, schools, fire & rescue — combined from six county and state feeds.";

  const pct =
    outages.total_served > 0
      ? ((outages.total_out / outages.total_served) * 100).toFixed(2)
      : "0";

  return (
    <div className="relative space-y-6 pb-4">
      <PageBloom variant={allClear ? "warm-cool" : "single"} />

      {/* ── Hero ───────────────────────────────────────────────── */}
      {/* The hero is a card-with-edge-tint when there's active data,
          so the page itself signals "something is up" before the user
          reads the headline. Calm states keep the standard paper-cream
          look so the page doesn't yell at users on quiet days. */}
      <header
        className="relative -mx-4 overflow-hidden border-b sm:mx-0 sm:rounded-[var(--app-radius-lg)] sm:border"
        style={{
          borderColor: "var(--app-border)",
          background: allClear
            ? "var(--app-bg-elevated)"
            : "linear-gradient(155deg, color-mix(in srgb, var(--app-danger) 7%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 70%)",
        }}
      >
        {/* Top accent bar — sage when all clear, danger when active. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: allClear ? "var(--app-positive)" : "var(--app-danger)",
            opacity: allClear ? 0.6 : 1,
          }}
        />
        <div className="space-y-2.5 px-4 py-5 sm:px-5">
          <p
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <span
              aria-hidden
              className="pulse-dot inline-block h-2 w-2 rounded-full"
              style={{
                background: allClear ? "var(--app-positive)" : "var(--app-danger)",
              }}
            />
            Live Pulse · Frederick County
          </p>
          <h1
            className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {heroLine}
          </h1>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            {heroSub}
          </p>
          <p
            className="flex items-center gap-1.5 pt-0.5 text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
            Refreshed {nowClock()} · auto-updates every couple of minutes
          </p>
          {/* Live "what's moving" — TransIT buses on the road right now. */}
          <div className="pt-1.5"><LiveTransitPill /></div>
        </div>
      </header>

      {/* ── Status tile grid ───────────────────────────────────── */}
      <section
        aria-label="At-a-glance county status"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
      >
        <StatusTile
          href="#safety"
          icon={Siren}
          label="Fire & rescue"
          count={totals.safety}
          activeCopy={totals.safety === 1 ? "Active call" : "Active calls"}
          accent="var(--app-danger)"
          show={safety.length > 0}
        />
        <StatusTile
          href="#traffic"
          icon={Construction}
          label="Traffic"
          count={totals.traffic}
          activeCopy={totals.traffic === 1 ? "Incident" : "Incidents"}
          accent="var(--app-warning)"
        />
        <StatusTile
          href="#power"
          icon={Zap}
          label="Power"
          count={outagesActive ? outages.total_out : 0}
          activeCopy={outagesActive ? "Customers out" : "Customers out"}
          formatNumber={outagesActive}
          accent="var(--app-danger)"
        />
        <StatusTile
          href="#schools"
          icon={School}
          label="Schools"
          count={totals.schools}
          activeCopy={totals.schools === 1 ? "Alert" : "Alerts"}
          accent="var(--app-warning)"
        />
        <StatusTile
          href="#fixit"
          icon={AlertTriangle}
          label="311 reports"
          count={totals.fixit}
          activeCopy={totals.fixit === 1 ? "Open report" : "Open reports"}
          accent="var(--app-cool)"
        />
        {/* Sixth tile: alerts beat police when something's up — a
            tornado watch is more actionable than yesterday's CFS map.
            Falls back to Police (external CFS map) when no alerts. */}
        {totals.alerts > 0 ? (
          <StatusTile
            href="#alerts"
            icon={CloudAlert}
            label="Weather alerts"
            count={totals.alerts}
            activeCopy={totals.alerts === 1 ? "Active alert" : "Active alerts"}
            accent="var(--app-danger)"
          />
        ) : (
          <StatusTile
            href="https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map"
            external
            icon={Siren}
            label="Police"
            accent="var(--app-cool)"
            subtitle="Daily CFS map"
          />
        )}
      </section>

      {/* ── Active sections only ──────────────────────────────── */}
      {/* Desktop multi-column: at lg+ the operational sections fall
          into a 2-col grid so traffic, power, schools, alerts, news
          read side-by-side instead of as long single-column rows.
          Mobile keeps the natural vertical stack. The grid is on the
          parent <div>; conditional children populate cells in source
          order so urgency stays top-left. */}
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
      {/* Weather alerts — NWS active alerts for Frederick County, MD.
          Top-of-page placement when active: a flood warning or severe
          thunderstorm watch beats every other feed for urgency. */}
      {activeAlerts.length > 0 && (
        <DashSection
          id="alerts"
          icon={CloudAlert}
          title="Weather alerts"
          count={activeAlerts.length}
          accent="var(--app-danger)"
          source={{ label: "NWS · weather.gov", href: "https://www.weather.gov/" }}
        >
          {activeAlerts.slice(0, 6).map((a) => {
            const tone =
              a.severity === "Extreme" || a.severity === "Severe"
                ? "danger"
                : a.severity === "Moderate"
                  ? "warning"
                  : "cool";
            const endsLabel = a.ends_at
              ? `Through ${new Date(a.ends_at).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : undefined;
            return (
              <Row
                key={a.id}
                tone={tone}
                title={a.event}
                body={a.headline}
                meta={[a.area, endsLabel]}
              />
            );
          })}
        </DashSection>
      )}

      {/* Safety — public fire & rescue scanner */}
      {safety.length > 0 && (
        <DashSection
          id="safety"
          icon={Siren}
          title="Active fire & rescue"
          count={safety.length}
          accent="var(--app-danger)"
          source={{ label: "PulsePoint", href: "https://web.pulsepoint.org/" }}
        >
          {safety.slice(0, 12).map((s) => (
            <Row
              key={s.id}
              tone="danger"
              title={s.type}
              meta={[s.address, timeAgo(s.received_at)]}
            />
          ))}
        </DashSection>
      )}

      {/* Traffic */}
      {traffic.length > 0 && (
        <DashSection
          id="traffic"
          icon={Construction}
          title="Traffic & roadwork"
          count={traffic.length}
          accent="var(--app-warning)"
          source={{ label: "MDOT CHART", href: "https://chart.maryland.gov/" }}
        >
          {traffic.slice(0, 12).map((i) => (
            <Row
              key={i.id}
              tone={i.severity === "High" ? "danger" : i.severity === "Medium" ? "warning" : "muted"}
              title={`${i.road}${i.direction ? ` ${i.direction}` : ""} — ${i.type}`}
              body={i.description}
              meta={[
                i.location,
                i.lanes_affected,
                i.expected_end
                  ? `Clears ~${new Date(i.expected_end).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric" })}`
                  : undefined,
              ]}
            />
          ))}
        </DashSection>
      )}

      {/* Power */}
      {outagesActive && (
        <DashSection
          id="power"
          icon={Zap}
          title="Power outages"
          count={outagesCount}
          accent="var(--app-danger)"
          source={{ label: "FirstEnergy / Potomac Edison", href: "https://outages-mdwv.firstenergycorp.com/" }}
        >
          <div
            className="mb-1 flex items-baseline gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
            style={{
              borderColor: "var(--app-border)",
              background: "color-mix(in srgb, var(--app-danger) 6%, var(--app-bg-elevated))",
            }}
          >
            <span
              className="font-serif text-[28px] font-semibold leading-none tabular-nums"
              style={{ color: "var(--app-danger)" }}
            >
              {outages.total_out.toLocaleString()}
            </span>
            <span className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              customers without power
              <br />
              {pct}% of {outages.total_served.toLocaleString()} served
            </span>
          </div>
          {outages.munis.map((m) => (
            <Row
              key={m.area}
              tone={m.customers_out > 500 ? "danger" : "warning"}
              title={m.area}
              body={`${m.customers_out.toLocaleString()} out of ${m.customers_served.toLocaleString()} (${m.percentage.toFixed(1)}%)`}
            />
          ))}
        </DashSection>
      )}

      {/* Schools */}
      {schoolAlerts.length > 0 && (
        <DashSection
          id="schools"
          icon={School}
          title="Schools (FCPS)"
          count={schoolAlerts.length}
          accent="var(--app-warning)"
          source={{ label: "FCPS RSS", href: "https://www.fcps.org/" }}
        >
          {schoolAlerts.map((a) => (
            <Row
              key={a.id}
              tone={a.status === "closed" ? "danger" : a.status === "open" ? "muted" : "warning"}
              title={
                a.status === "closed" ? "Schools closed"
                  : a.status === "delayed" ? "Delayed opening"
                  : a.status === "early_dismissal" ? "Early dismissal"
                  : "Update"
              }
              body={a.title}
              meta={[timeAgo(a.published_at)]}
            />
          ))}
        </DashSection>
      )}

      {/* 311 — collapsed by default. The feed is always SOMETHING
          (potholes, sign-down requests, tree-limb cleanups) and was
          pushing the urgent feeds below the fold on every visit.
          User can expand for the long-tail civic queue; the
          preference sticks via localStorage. */}
      {fixit.length > 0 && (
        <CollapsibleDashSection
          id="fixit"
          icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}
          title="Citizen 311 reports"
          count={fixit.length}
          accent="var(--app-cool)"
          source={{ label: "FCG FixIT · SeeClickFix", href: "https://www.frederickcountymd.gov/8235/FCG-FixIT" }}
          summary="Potholes, signs, tree limbs"
          defaultOpen={false}
        >
          {fixit.slice(0, 10).map((i) => (
            <Row
              key={i.id}
              tone={i.status === "closed" ? "muted" : "cool"}
              title={i.summary}
              body={
                i.category && i.category !== i.summary ? i.category : undefined
              }
              meta={[i.address, timeAgo(i.reported_at), i.status]}
            />
          ))}
        </CollapsibleDashSection>
      )}

      {/* Frederick Scanner — Twitter/X timeline embed. Sits between
          the operational feeds and the editorial news section because
          the scanner is operational-news in feel (raw incidents)
          but lives on a third-party surface. Self-falls-back to an
          "open on X" link card if the widget can't load. */}
      <section
        id="scanner"
        className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          borderLeftWidth: 3,
          borderLeftColor: "var(--app-cool)",
        }}
      >
        <header
          className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <h2
            className="inline-flex items-center gap-2.5 font-serif text-[17px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-cool) 13%, transparent)",
                color: "var(--app-cool)",
              }}
            >
              <Radio className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </span>
            Frederick Scanner
          </h2>
          <span
            className="text-[11px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Live on X
          </span>
        </header>
        <div className="px-3 py-3">
          <ScannerTimeline />
        </div>
        <a
          href="https://twitter.com/FredScanner"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-4 pb-3 pt-1 text-[10px] uppercase tracking-wide"
          style={{ color: "var(--app-ink-3)" }}
        >
          Source: @FredScanner
          <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
        </a>
      </section>

      {/* Rivers & streams quick link — full dashboard lives at /rivers,
          here we just surface a count + last-reading pulse so a user
          watching the pulse page sees water levels alongside the
          operational feeds. */}
      <Link
        href="/rivers"
        className="group flex items-center gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-4 py-3 shadow-[var(--app-shadow-1)] transition active:scale-[0.995]"
        style={{
          borderColor: "var(--app-border)",
          borderLeftWidth: 3,
          borderLeftColor: "var(--app-cool)",
        }}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
            color: "var(--app-cool)",
          }}
        >
          <Waves className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block font-serif text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Rivers &amp; streams
          </span>
          <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Live USGS gauges · Monocacy · Potomac · Catoctin · 24-hour trend
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5"
          strokeWidth={2.25}
          style={{ color: "var(--app-cool)" }}
          aria-hidden
        />
      </Link>

      {/* City signal — Local news. Always-on city data even when the
          operational feeds are quiet. Top headlines from Google News
          RSS for Frederick County + the four named towns. Each row
          links out; rendering quiet headline text + source +
          published-ago meta. */}
      {news.length > 0 && (
        <section
          id="news"
          className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            borderLeftWidth: 3,
            borderLeftColor: "var(--app-ink-2)",
          }}
        >
          <header
            className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
            style={{ borderColor: "var(--app-border)" }}
          >
            <h2
              className="inline-flex items-center gap-2.5 font-serif text-[17px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              <span
                aria-hidden
                className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--app-ink-2) 10%, transparent)",
                  color: "var(--app-ink-2)",
                }}
              >
                <Newspaper className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </span>
              In the news
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
              style={{
                background: "color-mix(in srgb, var(--app-ink-2) 10%, transparent)",
                color: "var(--app-ink-2)",
              }}
            >
              {Math.min(news.length, 6)}
            </span>
          </header>
          <ul className="divide-y px-1" style={{ borderColor: "var(--app-border)" }}>
            {news.slice(0, 6).map((h) => (
              <li key={h.url}>
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-[var(--app-radius-md)] px-3 py-2.5 transition hover:bg-[var(--app-bg-sunken)]"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[13px] font-semibold leading-snug"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {h.title}
                    </span>
                    <span
                      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      <span className="font-semibold">{h.source}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                        {timeAgo(h.published_at)}
                      </span>
                    </span>
                  </span>
                  <ExternalLink
                    aria-hidden
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={2}
                    style={{ color: "var(--app-ink-3)" }}
                  />
                </a>
              </li>
            ))}
          </ul>
          <p
            className="px-4 pb-3 pt-2 text-[10px] uppercase tracking-wide"
            style={{ color: "var(--app-ink-3)" }}
          >
            Source: Google News · Frederick County
          </p>
        </section>
      )}
      </div>{/* /active-sections grid */}

      {/* All-clear card — only renders when literally every feed is
          quiet. Celebratory, not just empty. Catoctin-green wash
          keeps it on-brand without resorting to a generic
          green-checkmark UI. */}
      {allClear && (
        <section
          aria-label="All clear"
          className="rounded-[var(--app-radius-lg)] border p-5 text-center"
          style={{
            borderColor: "color-mix(in srgb, var(--app-positive) 30%, transparent)",
            background:
              "linear-gradient(155deg, color-mix(in srgb, var(--app-positive) 6%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 100%)",
          }}
        >
          <CheckCircle2
            className="mx-auto h-10 w-10"
            strokeWidth={1.5}
            style={{ color: "var(--app-positive)" }}
            aria-hidden
          />
          <p
            className="mt-3 font-serif text-[20px] font-semibold leading-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Quiet across the board.
          </p>
          <p
            className="mt-1.5 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            All five feeds report nothing major right now. Page updates
            automatically when that changes.
          </p>
        </section>
      )}

      {/* Police — kept as a quiet card with its required disclaimer.
          Not part of the active-sections loop because there's no
          feed to count from. */}
      <section
        id="police"
        className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <div
          className="flex items-center gap-2.5 border-b px-4 py-2.5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 10%, transparent)",
              color: "var(--app-cool)",
            }}
          >
            <Siren className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </span>
          <h2
            className="font-serif text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Police calls for service
          </h2>
        </div>
        <div className="space-y-2.5 px-4 py-3">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Frederick PD publishes the prior day&apos;s calls for service
            from its CAD system on an official map, updated daily. You
            can browse it and subscribe to alerts for your area there.
          </p>
          <a
            href="https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)] active:scale-[0.99]"
            style={{ background: "var(--app-cool)" }}
          >
            Open the official CFS map
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </a>
          <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Calls for service are not confirmed crimes — they reflect
            requests for police response. Source: Frederick Police
            Department via CommunityCrimeMap.
          </p>
        </div>
      </section>

      {/* Footer — disclaimer + sources at a glance */}
      <footer
        className="space-y-3 rounded-[var(--app-radius-md)] border p-4 text-[11px]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-3)",
        }}
      >
        <p className="leading-relaxed">
          Informational only — not a substitute for 911 or official
          emergency broadcasts.
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <SourceLine label="Weather alerts" source="NWS · weather.gov" href="https://www.weather.gov/" />
          <SourceLine label="Fire & rescue" source="PulsePoint" href="https://web.pulsepoint.org/" />
          <SourceLine label="Traffic" source="MDOT CHART" href="https://chart.maryland.gov/" />
          <SourceLine label="Power" source="FirstEnergy" href="https://outages-mdwv.firstenergycorp.com/" />
          <SourceLine label="Schools" source="FCPS RSS" href="https://www.fcps.org/" />
          <SourceLine label="311 reports" source="FCG FixIT · SeeClickFix" href="https://www.frederickcountymd.gov/8235/FCG-FixIT" />
          <SourceLine label="News" source="Google News · Frederick" href="https://news.google.com/search?q=Frederick%20County%20Maryland" />
          <SourceLine label="Police" source="Frederick PD" href="https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map" />
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Components
 * ───────────────────────────────────────────────────────────── */

function StatusTile({
  href,
  external,
  icon: Icon,
  label,
  count,
  activeCopy,
  accent,
  subtitle,
  show,
  formatNumber,
}: {
  href: string;
  external?: boolean;
  icon: typeof Activity;
  label: string;
  count?: number;
  activeCopy?: string;
  accent: string;
  subtitle?: string;
  /** Force the tile to render even with count=0 (used for police). */
  show?: boolean;
  /** Use compact thousands formatting for big numbers like 1.2K. */
  formatNumber?: boolean;
}) {
  const isActive = (count ?? 0) > 0 || show === true;
  // Tiles tint with their accent color when active so the grid reads
  // as a heat-map. Paper-cream + faint accent stripe when calm.
  const bg = isActive
    ? `linear-gradient(155deg, color-mix(in srgb, ${accent} 11%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 100%)`
    : "var(--app-bg-elevated)";
  const borderColor = isActive
    ? `color-mix(in srgb, ${accent} 28%, var(--app-border))`
    : "var(--app-border)";
  const displayCount =
    count == null
      ? null
      : formatNumber && count >= 1000
        ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`
        : count.toLocaleString();
  // Wrap in correct element for internal vs external link.
  const Inner = (
    <div
      className="group relative flex h-full flex-col gap-1 overflow-hidden rounded-[var(--app-radius-lg)] border p-3.5 transition active:scale-[0.985]"
      style={{ background: bg, borderColor }}
    >
      {/* Top accent stripe — louder when active, hairline when calm.
          Lives on the top edge so it reads at a glance even in a tile
          you haven't focused on. */}
      <span
        aria-hidden
        className="absolute inset-x-3.5 top-0 h-0.5 rounded-full"
        style={{
          background: accent,
          opacity: isActive ? 1 : 0.18,
        }}
      />
      <div className="flex items-center justify-between gap-1">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        {!external && (count ?? 0) > 0 && (
          <ChevronRight
            className="h-3.5 w-3.5"
            strokeWidth={2.25}
            style={{ color: accent }}
            aria-hidden
          />
        )}
        {external && (
          <ExternalLink
            className="h-3 w-3"
            strokeWidth={2.25}
            style={{ color: accent }}
            aria-hidden
          />
        )}
      </div>
      <p
        className="text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        {label}
      </p>
      {displayCount != null ? (
        <p className="flex items-baseline gap-1.5">
          <span
            className="font-serif text-[26px] font-semibold leading-none tabular-nums"
            style={{ color: isActive ? accent : "var(--app-ink-2)" }}
          >
            {(count ?? 0) === 0 ? "0" : displayCount}
          </span>
          {(count ?? 0) === 0 && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: "var(--app-positive)" }}
            >
              · clear
            </span>
          )}
        </p>
      ) : (
        <p
          className="font-serif text-[18px] font-semibold leading-tight"
          style={{ color: accent }}
        >
          View →
        </p>
      )}
      <p
        className="text-[11px] leading-snug"
        style={{ color: "var(--app-ink-3)" }}
      >
        {subtitle ??
          ((count ?? 0) === 0
            ? "No issues right now"
            : activeCopy)}
      </p>
    </div>
  );
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} — open external map`}
        className="block h-full"
      >
        {Inner}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={`${label} section`} className="block h-full">
      {Inner}
    </Link>
  );
}

function DashSection({
  id, icon: Icon, title, count, accent, source, children,
}: {
  id: string;
  icon: typeof Activity;
  title: string;
  count: number;
  accent: string;
  source: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        // Left-edge accent band — the section's identity color reads
        // even when the user has scrolled past the title.
        borderLeftWidth: 3,
        borderLeftColor: accent,
      }}
    >
      <header
        className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <h2
          className="inline-flex items-center gap-2.5 font-serif text-[17px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              background: `color-mix(in srgb, ${accent} 13%, transparent)`,
              color: accent,
            }}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </span>
          {title}
        </h2>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          {count}
        </span>
      </header>
      <div className="space-y-1.5 px-4 py-3">{children}</div>
      <a
        href={source.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-4 pb-3 pt-1 text-[10px] uppercase tracking-wide"
        style={{ color: "var(--app-ink-3)" }}
      >
        Source: {source.label}
        <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
      </a>
    </section>
  );
}

function Row({
  title, body, meta, tone,
}: {
  title: string;
  body?: string;
  meta?: (string | undefined)[];
  tone: "danger" | "warning" | "cool" | "muted";
}) {
  const dot =
    tone === "danger" ? "var(--app-danger)"
      : tone === "warning" ? "var(--app-warning)"
      : tone === "cool" ? "var(--app-cool)"
      : "var(--app-ink-3)";
  const metas = (meta ?? []).filter(Boolean) as string[];
  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2.5"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-sunken)",
      }}
    >
      {/* Vertical severity bar — taller than the previous dot so the
          tone is felt without reading the text. */}
      <span
        className="mt-0.5 h-full min-h-[1.75rem] w-[3px] shrink-0 rounded-full"
        style={{ background: dot }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-[13px] font-semibold leading-snug"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </p>
        {body && (
          <p
            className="mt-0.5 line-clamp-2 text-[12px] leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            {body}
          </p>
        )}
        {metas.length > 0 && (
          <p
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {metas.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i === 0 && <MapPin className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />}
                {i > 0 && <Clock className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />}
                {m}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

function SourceLine({
  label,
  source,
  href,
}: {
  label: string;
  source: string;
  href: string;
}) {
  return (
    <p className="flex items-center gap-1.5">
      <span
        className="font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--app-ink-2)" }}
      >
        {label}
      </span>
      <span>·</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        style={{ color: "var(--app-cool)" }}
      >
        {source}
        <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
      </a>
    </p>
  );
}

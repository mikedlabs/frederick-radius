import { AlertCircle, AlertTriangle, ArrowRight, CalendarX, Clock, Info } from "lucide-react";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import { getNpsAlerts, type NpsAlert } from "@/lib/integrations/nps";
import {
  qualifiesForToday,
  chartTodayTitle,
  chartFreshnessTail,
  chartRoad,
  type ChartIncident,
} from "@/lib/integrations/mdot-chart";
import { activeEventNotices } from "@/lib/events/notices";
import { summarizeAirQualityAlert } from "@/lib/air-quality";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import {
  selectTodayRoadSignal,
  type RoadAttentionSignal,
} from "@/lib/live/roadIntelligenceModel";
import { getOfficialCivicAlertsSnapshot } from "@/lib/live/officialSignals";
import type { OfficialCivicAlert } from "@/lib/integrations/official-alert-feeds";

export type UnifiedAlert = {
  /** Provider-stable identity. Alert counts are derived after de-duplicating
   * this key, so repeated feed rows never become fake "+N more" urgency. */
  identity: string;
  source: "NWS" | "NPS" | "MDOT" | "CITY" | "HEALTH";
  severity: "info" | "advisory" | "warning" | "emergency";
  title: string;
  /** Short tail under the title (e.g. "Until 8:00 PM" or an intentionally
   *  shortened official excerpt). Never a wall of text. */
  tail: string;
  /** Affected-area summary as a short chip ("Frederick + 23 counties").
   *  Replaces the old raw `areaDesc` semicolon dump. */
  scope: string;
  url?: string;
  /** When true the url is an external site (open in a new tab). Internal
   *  deep links (e.g. a traffic row → /pulse?open=traffic) stay in-app. */
  external?: boolean;
};

export function dedupeUnifiedAlerts(
  alerts: readonly UnifiedAlert[],
): UnifiedAlert[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (seen.has(alert.identity)) return false;
    seen.add(alert.identity);
    return true;
  });
}

const EASTERN_TIME_ZONE = "America/New_York";
const EASTERN_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function easternDateKey(value: Date): string {
  return EASTERN_DATE_FORMATTER.formatToParts(value)
    .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
    .map((part) => part.value)
    .join("-");
}

/** Pull "Until 8:00 PM" out of an ISO expiry. The single most
 *  useful bit of info on a weather alert — "is it over yet?". */
export function untilLabel(iso?: string, now = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime()) || Number.isNaN(now.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(t);
  const sameDay = easternDateKey(now) === easternDateKey(t);
  return sameDay ? `Until ${time}` : `Until ${time} ${new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, weekday: "short" }).format(t)}`;
}

/** Take the raw NWS `areaDesc` (a giant semicolon list of counties)
 *  and turn it into "Frederick + 23 counties" — the right level of
 *  detail for a tile-sized card. Frederick always leads if present. */
function summarizeArea(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const fredIdx = parts.findIndex((p) => /Frederick/i.test(p));
  const lead = fredIdx >= 0 ? "Frederick County" : parts[0].replace(/, [A-Z]{2}$/, "");
  const rest = parts.length - 1;
  return `${lead} + ${rest} ${rest === 1 ? "area" : "areas"}`;
}

const ALERT_CARD_SUMMARY_LIMIT = 140;

/**
 * Keep an official notice compact without trying to infer sentence grammar.
 * Public notices contain times, dates, initials, addresses, and abbreviations
 * that make a regex sentence detector unsafe. Preserve short copy verbatim;
 * shorten long copy only at a complete word and make that edit visible.
 */
export function alertCardSummary(body: string): string {
  if (!body) return "";
  const s = body.replace(/\s+/g, " ").trim();
  if (s.length <= ALERT_CARD_SUMMARY_LIMIT) return s;

  const window = s.slice(0, ALERT_CARD_SUMMARY_LIMIT - 1);
  const lastWordBreak = window.lastIndexOf(" ");
  const safeEnd = lastWordBreak >= Math.floor(ALERT_CARD_SUMMARY_LIMIT * 0.7)
    ? lastWordBreak
    : window.length;
  return `${window.slice(0, safeEnd).trimEnd()}…`;
}

/** NWS assigns Air Quality Alert products severity=Unknown, even when the
 *  product body says Code Purple / very unhealthy. Product-specific health
 *  language therefore has to outrank the generic severity field. */
export function nwsDisplaySeverity(a: NwsAlert): UnifiedAlert["severity"] {
  const copy = `${a.event} ${a.headline} ${a.description}`;
  if (/air quality|smoke|ozone/i.test(copy)) {
    const declared = summarizeAirQualityAlert(a)?.level;
    if (declared === "purple" || declared === "maroon") return "emergency";
    if (declared === "red") return "warning";
    if (declared === "orange") return "advisory";
    // Fall back to descriptive severity only when the bulletin does not carry
    // an explicit issued code. A Code Orange product can mention an earlier
    // Purple period later in its body without becoming a Code Purple alert.
    if (!declared && /very unhealthy|hazardous/i.test(copy)) return "emergency";
    if (!declared && /unhealthy for (?:the )?general population/i.test(copy)) return "warning";
    // Code Orange and any other active official air-quality product are still
    // consequence-bearing health notices, never routine "info."
    return "advisory";
  }
  return a.severity === "Extreme" ? "emergency" :
    a.severity === "Severe" ? "warning" :
    a.severity === "Moderate" ? "advisory" : "info";
}

function normalize(
  nws: NwsAlert[],
  nps: NpsAlert[],
  traffic: UnifiedAlert[],
  now: Date,
): UnifiedAlert[] {
  const out: UnifiedAlert[] = [];
  for (const a of nws) {
    const severity = nwsDisplaySeverity(a);
    // WeatherHero's inline alert chip was removed — the top
    // CivicAlerts banner is now the single source of truth for the
    // alert. Show every active NWS alert here with the full title +
    // "Until 8 PM" tail + scope chip.
    const until = untilLabel(a.ends_at, now);
    out.push({
      identity: `nws:${a.id}`,
      source: "NWS",
      severity,
      title: a.event,
      tail: until || alertCardSummary(a.headline || a.description),
      scope: summarizeArea(a.area),
      // Pulse already carries the Frederick-specific timing, guidance, scope,
      // and full NWS bulletin. Open that native detail first; its source action
      // remains the final handoff to weather.gov.
      url: "/pulse?open=alerts",
      external: false,
    });
  }
  for (const a of nps) {
    const severity =
      a.category === "Danger" ? "emergency" :
      a.category === "Park Closure" ? "warning" :
      a.category === "Caution" ? "advisory" : "info";
    out.push({
      identity: `nps:${a.id}`,
      source: "NPS",
      severity,
      title: a.title,
      tail: alertCardSummary(a.description),
      scope: a.parkName,
      url: a.url,
      external: true,
    });
  }
  // Traffic rows (MDOT CHART) are pre-filtered to the strict qualifiesForToday
  // allowlist and slotted at the "warning" tier, so an NWS emergency always
  // outranks them and extras still collapse into the quiet "+N more → /pulse".
  out.push(...traffic);
  const order = { emergency: 0, warning: 1, advisory: 2, info: 3 } as const;
  // Heads up is a HIGH-SIGNAL interruption layer, not a feed: drop "info"
  // (low-confidence/routine) so it never cries wolf. Sort worst-first.
  return dedupeUnifiedAlerts(out)
    .filter((a) => a.severity !== "info")
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Map the qualifying CHART incidents to at most one Heads-up traffic row.
 *  Cleaned title, mono freshness tail, road scope chip, in-app deep link. */
function trafficAlerts(now: Date, incidents: ChartIncident[]): UnifiedAlert[] {
  const qualifying = incidents.filter((i) => qualifiesForToday(i, now));
  if (qualifying.length === 0) return [];
  const top = qualifying[0];
  return [
    {
      identity: `mdot-chart:${top.id}`,
      source: "MDOT",
      severity: "warning",
      title: chartTodayTitle(top),
      tail: chartFreshnessTail(top, now),
      scope: chartRoad(top) || "Major route",
      url: "/pulse?open=traffic",
      external: false,
    },
  ];
}

function roadIntelligenceAlert(
  signal: RoadAttentionSignal | null,
): UnifiedAlert[] {
  if (!signal) return [];
  return [{
    identity: `mdot-road:${signal.id}`,
    source: "MDOT",
    severity: signal.severity,
    title: signal.title,
    tail: signal.detail,
    scope: signal.scope,
    url: "/pulse?open=traffic",
    external: false,
  }];
}

/**
 * Translate narrow official feeds into Today interruption levels.
 *
 * A record being present in the Health Department "closings" feed means the
 * notice is current, not that it is urgent. Routine holiday/office closures
 * remain available in Pulse, but must not displace an actual safety warning
 * in Today's first screen. Consequence-bearing language can still promote a
 * closing when the notice itself describes an emergency or hazard.
 */
export function officialCivicAlerts(alerts: OfficialCivicAlert[]): UnifiedAlert[] {
  return alerts.map((alert) => {
    const copy = `${alert.title} ${alert.summary}`;
    const consequenceBearing =
      /\b(?:emergency|evacuat|boil|unsafe|outbreak|do not|avoid|hazard|danger)\b/i.test(copy);
    const urgent =
      alert.kind === "city-emergency" ||
      alert.kind === "health-burn-ban" ||
      consequenceBearing;
    const actionable =
      urgent ||
      (alert.kind !== "health-closing" &&
        /\b(?:warning|advisory|recall|exposure|contaminat|suspend|cancel|restricted|closed|closure)\b/i.test(copy));
    return {
      // The same official notice can appear in more than one narrow Alert
      // Center category. Its canonical public URL identifies the notice more
      // accurately than the category-prefixed ingest id.
      identity: `official:${alert.url}`,
      source: alert.kind === "city-emergency" ? "CITY" as const : "HEALTH" as const,
      severity: urgent
        ? "warning" as const
        : actionable
          ? "advisory" as const
          : "info" as const,
      title: alert.title,
      tail: alertCardSummary(alert.summary) || "Active official notice",
      scope: alert.scope === "city" ? "City of Frederick" : "Frederick County",
      url: alert.url,
      external: true,
    };
  });
}

const STYLES = {
  emergency: { bg: "var(--app-danger)", icon: AlertCircle, fg: "var(--app-on-brand)" },
  warning:   { bg: "var(--app-warning-press)", icon: AlertTriangle, fg: "var(--app-on-brand)" },
  advisory:  { bg: "var(--app-warning-press)", icon: AlertTriangle, fg: "var(--app-on-brand)" },
  info:      { bg: "var(--app-info)", icon: Info, fg: "var(--app-on-brand)" },
} as const;

/**
 * CivicAlerts — the "Heads up" interruption layer at the top of Today:
 * "Before you make a plan, is there anything you need to know?"
 *
 * STRICT by design (the "safety vest, not a banner ad" rule):
 *   - Only real, sourced, time-bound alerts (NWS weather + NPS park),
 *     high-signal only (advisory/warning/emergency — never routine "info").
 *   - Self-hides entirely when nothing is active.
 *   - Shows ONE alert (worst-first); any others collapse to a quiet
 *     "+N more →" link to /pulse (the full live civic board), so this
 *     never becomes a stacked banner wall.
 *   - Every alert carries source (NWS/NPS), an expiry tail ("Until 8 PM"
 *     = time-bound), and a local scope chip.
 * Other alert types (parking, road closures, transit) plug in here the
 * moment a real feed exists — absent until then, never faked.
 */
export default async function CivicAlerts({ includeWeather = true }: { includeWeather?: boolean } = {}) {
  const [situation, roads, official, nps] = await Promise.all([
    getCurrentSituationSnapshot(),
    getRoadIntelligenceSnapshot(),
    getOfficialCivicAlertsSnapshot(),
    getNpsAlerts(),
  ]);
  const weatherIsFresh =
    situation.sources.weather.availability === "available" &&
    situation.sources.weather.freshness === "fresh";
  const trafficIsFresh =
    situation.sources.traffic.availability === "available" &&
    situation.sources.traffic.freshness === "fresh";
  const now = new Date(situation.generatedAt);
  const nws =
    includeWeather && weatherIsFresh ? situation.sources.weather.data : [];
  const chart = trafficIsFresh ? situation.sources.traffic.data : [];
  const alerts = normalize(
    nws,
    nps,
    [
      ...officialCivicAlerts(official.alerts),
      ...roadIntelligenceAlert(selectTodayRoadSignal(roads)),
      ...trafficAlerts(now, chart),
    ],
    now,
  );
  // Owner event notices (event-notices.json) — "Alive @ Five is cancelled
  // tonight" is exactly the news this slot exists for. They render as their
  // OWN rows below the weather alert (never folded into the one-alert
  // collapse: on a heat-cancellation night the heat warning and the
  // cancellation are BOTH active, and the "+1 more" link points at /pulse,
  // which doesn't carry notices). Owner-authored and rare, so capped at 2.
   
  const notices = activeEventNotices(now).slice(0, 2);
  if (alerts.length === 0 && notices.length === 0) return null;

  const top = alerts[0];
  const more = alerts.length - 1;
  const s = top ? STYLES[top.severity] : null;
  const Icon = s?.icon ?? Info;
  const TailIcon = top && /^(Until|Clears|Started|Just )/.test(top.tail) ? Clock : null;

  return (
    <section className="-mx-4 sm:-mx-6 lg:mx-0 mb-4 flex flex-col" aria-label="Heads up">
      {top && s && (
      <a
        href={top.url ?? "#"}
        target={top.url && top.external ? "_blank" : undefined}
        rel={top.external ? "noopener noreferrer" : undefined}
        className="block px-4 py-3 sm:px-6 lg:rounded-[var(--app-radius-md)] lg:px-4 shadow-[var(--app-shadow-1)] transition active:brightness-95"
        style={{ background: s.bg, color: s.fg }}
      >
        <div className="flex items-start gap-2">
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug tracking-tight">{top.title}</p>
          <span className="shrink-0 rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur">
            {top.source}
          </span>
        </div>
        <div className="mt-1 flex items-start gap-2 text-[11px] leading-snug opacity-90">
          {TailIcon && <TailIcon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />}
          <span className="min-w-0 flex-1">{top.tail}</span>
          {top.scope && (
            <span className="shrink-0 rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight backdrop-blur">
              {top.scope}
            </span>
          )}
        </div>
      </a>
      )}
      {notices.map((n) => (
        <a
          key={n.slug}
          href={`/events/${n.slug}`}
          className="block border-t border-black/10 px-4 py-3 sm:px-6 lg:rounded-[var(--app-radius-md)] lg:border-t-0 lg:px-4 shadow-[var(--app-shadow-1)] transition active:brightness-95 mt-px lg:mt-1.5"
          style={{
            background: n.status === "cancelled" ? "var(--app-danger)" : "var(--app-warning)",
            color: "var(--app-on-brand)",
          }}
        >
          <div className="flex items-start gap-2">
            <CalendarX className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
            <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug tracking-tight">{n.headline}</p>
            <span className="shrink-0 rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur">
              {n.status === "cancelled" ? "Cancelled" : n.status === "postponed" ? "Postponed" : "Update"}
            </span>
          </div>
          {n.note && (
            <p className="mt-1 text-[11px] leading-snug opacity-90">{n.note}</p>
          )}
        </a>
      ))}
      {more > 0 && (
        <a href="/pulse" className="flex min-h-11 items-center px-4 sm:px-6 lg:px-0 text-[11px] font-semibold bg-[var(--app-bg-inset)] lg:bg-transparent" style={{ color: "var(--app-ink-3)" }}>
          +{more} more active {more === 1 ? "alert" : "alerts"} <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
        </a>
      )}
    </section>
  );
}

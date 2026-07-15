/**
 * Live Pulse — Frederick County as an editorial briefing, not a feed console.
 *
 * The server normalizes trusted public feeds; PulseBoard turns them into one
 * lead issue, supporting facts, a calm systems ledger, and distinct modules
 * for transportation, outdoor conditions, and local updates. Heavy bus
 * geometry waits behind intent, and client-owned drawer URLs keep this route
 * cacheable while preserving shareable `?open=` links.
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ExternalLink, MapPin, Clock, ChevronRight,
} from "lucide-react";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFrederickOutages } from "@/lib/integrations/firstenergy";
import { getFcpsAlerts } from "@/lib/integrations/fcps";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { getPulsePointIncidents } from "@/lib/integrations/pulsepoint";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getLocalHeadlines } from "@/lib/integrations/news";
import { getCivicPressReleases, policeReleases, latestPoliceRelease, advisoryReleases } from "@/lib/integrations/civic-press";
import { getMarcBoard, getMarcAlerts, marcClockMinutes } from "@/lib/integrations/marcTrains";
import { getAirQuality, pickWorstAqi } from "@/lib/integrations/airnow";
import { getFrederickStockings } from "@/lib/integrations/dnrTrout";
import { getCampDavidTfr } from "@/lib/integrations/faaTfr";
import NextTrainBoard from "@/components/transit/NextTrainBoard";
import { getFrederickWaterSitesWithHistory, readingTrend, type WaterSite } from "@/lib/integrations/usgsWater";
import { classifyFlood, nwsGaugeUrl } from "@/lib/integrations/floodStage";
import MetricCard from "@/components/live-data/MetricCard";
import FloodGauge from "@/components/live-data/FloodGauge";
import { getAreaAirportStatus, type AirportStatus } from "@/lib/integrations/faa-airports";
import PageBloom from "@/components/ui/PageBloom";
import ScannerTimeline from "@/components/pulse/ScannerTimeline";
import { PoliceBreakingStrip, PoliceBlotter } from "@/components/pulse/CivicPress";
import PulseBoard, { type PulseTile, type PulseHero, type PulseHeroChip } from "@/components/pulse/PulseBoard";
import { clampPercent } from "@/components/pulse/format";
import PulseWeatherPanel from "@/components/pulse/PulseWeatherPanel";
import BusesReveal from "@/components/pulse/BusesReveal";

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
  title: "Live Pulse",
  description: "Live traffic, power, school, and 311 status across Frederick County: one screen instead of four government websites.",
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

/** AirNow's local observation hour (0-23) → "2 PM", so the AQI reads as a
 *  timestamped measurement, not a bare number. */
function aqiClock(h: number): string {
  const hr = ((h % 24) + 24) % 24;
  const ampm = hr < 12 ? "AM" : "PM";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12} ${ampm}`;
}

function nowClock(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

/** Plain, deterministic local guidance for the alert families NWS publishes.
 * This deliberately avoids speculative AI copy: the alert type selects a
 * short action, while the official NWS record remains one tap away. */
function alertGuidance(event: string): string {
  const name = event.toLowerCase();
  if (name.includes("tornado")) return "Move indoors, keep emergency alerts on, and be ready to use a lower interior room.";
  if (name.includes("severe thunderstorm")) return "Outdoor plans may need to move inside. Secure loose items and keep weather alerts on.";
  if (name.includes("flood")) return "Avoid low-water crossings and never drive through flooded roads. Check your route before leaving.";
  if (name.includes("heat")) return "Plan shade and water for time outside, and move strenuous activity to a cooler part of the day.";
  if (name.includes("winter") || name.includes("snow") || name.includes("ice")) return "Allow extra travel time and check road conditions before heading out.";
  if (name.includes("wind")) return "Secure loose outdoor items and use extra care around trees and power lines.";
  if (name.includes("air quality")) return "Sensitive groups may want to shorten strenuous outdoor activity.";
  return "Keep official alerts on and check the Frederick-specific timing before changing your plans.";
}

function alertEndLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const end = new Date(iso);
  if (!Number.isFinite(end.getTime())) return undefined;
  return `Through ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(end)}`;
}

// ── River display helpers (mirror /rivers so the two surfaces agree) ──
function titleCaseRiver(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Nr|Ab|Bl|At|Md)\b/gi, (m) => m.toUpperCase())
    .replace(/\bOf\b/g, "of");
}
/** "MONOCACY RIVER AT JUG BRIDGE NEAR FREDERICK, MD" → "At Jug Bridge near Frederick". */
function riverLocationOf(name: string): string {
  const m = name.match(/\s+(NEAR|AT|ABOVE|BELOW|NR|BL|AB)\s+(.+?)(?:,\s*MD)?$/i);
  if (!m) return "";
  const prefix = m[1].toLowerCase();
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${titleCaseRiver(m[2].trim())}`;
}
/** Group gauges under one waterway, most-gauged river first. */
function groupByRiver(sites: WaterSite[]): Array<{ river: string; sites: WaterSite[] }> {
  const m = new Map<string, WaterSite[]>();
  for (const s of sites) {
    const bucket = m.get(s.river.toUpperCase());
    if (bucket) bucket.push(s);
    else m.set(s.river.toUpperCase(), [s]);
  }
  return [...m.entries()]
    .map(([river, list]) => ({
      river: titleCaseRiver(river),
      sites: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.sites.length - a.sites.length);
}

/**
 * Race a feed against a fallback: resolves to the feed's value, or the
 * fallback if the feed rejects OR is slower than `ms`. Bounds the ~10-feed
 * fanout so one slow/failing upstream can't stall the (ISR) regeneration or
 * blank the dashboard — each tile self-hides on an empty feed.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  // clearTimeout once the race settles so the loser timer doesn't linger ~ms
  // past resolution for every feed on every render.
  return Promise.race([Promise.resolve(p).catch(() => fallback), timeout]).finally(
    () => clearTimeout(timer),
  );
}

/**
 * Like withTimeout, but reports whether the feed FAILED or TIMED OUT (as
 * opposed to genuinely returning nothing) through `onFail`. The hero uses this
 * to tell "all clear" apart from "we could not reach the alert feeds", so a
 * provider outage never reads as a reassuring all-clear (audit FR-002).
 */
function withTimeoutTracked<T>(p: Promise<T>, ms: number, fallback: T, onFail: () => void): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onFail();
      resolve(fallback);
    }, ms);
    Promise.resolve(p).then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        onFail();
        resolve(fallback);
      },
    );
  });
}

export default async function PulsePage() {
  // `?open=<tileKey>` is read by PulseBoard after hydration. Keeping query
  // state out of this server component lets the whole briefing use ISR again
  // instead of regenerating all county feeds for every deep link.
  // Every feed is raced against a 6s timeout + an empty fallback (withTimeout),
  // so one slow or failing upstream can't stall the ISR regeneration or blank
  // the board — each tile self-hides on an empty feed.
  const FEED_MS = 6000;
  const marcNow = new Date();
  // The five feeds that decide "all clear" (traffic, power, schools, fire &
  // rescue, weather alerts) are tracked: if any fails or times out, we can't
  // honestly say all clear (audit FR-002). The rest keep the plain fallback.
  let urgentDegraded = false;
  const markDegraded = () => {
    urgentDegraded = true;
  };
  const [incidents, outages, fcps, fixit, safety, alerts, news, press, rivers, airports, forecast, marcBoard, marcAlerts, aqiObs, troutStockings, campDavidTfr] = await Promise.all([
    withTimeoutTracked(getChartIncidentsFrederick(), FEED_MS, [], markDegraded),
    withTimeoutTracked(getFrederickOutages(), FEED_MS, { total_out: 0, total_served: 0, munis: [] }, markDegraded),
    withTimeoutTracked(getFcpsAlerts(), FEED_MS, [], markDegraded),
    withTimeout(getFixItIssues(15), FEED_MS, []),
    withTimeoutTracked(getPulsePointIncidents(), FEED_MS, [], markDegraded),
    // NWS active alerts for Frederick County, MD. When something's up (severe
    // storm, flood, heat advisory) this rides at the top of the board.
    withTimeoutTracked(getNwsAlerts(), FEED_MS, [], markDegraded),
    // Local headlines from Google News RSS — always-on city signal.
    withTimeout(getLocalHeadlines(), FEED_MS, []),
    // Official City + County press releases (CivicPlus News Flash RSS). The
    // police-lane items get the breaking strip up top + the blotter below.
    withTimeout(getCivicPressReleases(), FEED_MS, []),
    // USGS live gage height + streamflow for county rivers, WITH 24h history
    // (powers the tile's sparklines + rising/falling read + NWS flood gauge).
    // Six hours is ~24 readings per gauge: ample for the eight-reading trend
    // calculation without serializing the full /rivers 24-hour payload here.
    withTimeout(getFrederickWaterSitesWithHistory("PT6H"), FEED_MS, [] as WaterSite[]),
    // FAA status for BWI / Dulles / Reagan; the tile self-hides when empty.
    withTimeout(getAreaAirportStatus(), FEED_MS, [] as AirportStatus[]),
    // Current conditions for the leading Weather tile (the full panel is its
    // tap-to-open body). Same cached NWS call PulseWeatherPanel makes.
    withTimeout(getNwsForecast(FREDERICK_CENTER), FEED_MS, null),
    // MARC Brunswick Line — the county's commuter rail, schedule-backed with a
    // live delay overlay. The tile head shows the soonest departure; the body
    // is the full per-station board (NextTrainBoard). Complements the live bus
    // map below. Keyless MTA GTFS + GTFS-RT.
    withTimeout(getMarcBoard(marcNow), FEED_MS, { stations: [], serviceToday: false }),
    withTimeout(getMarcAlerts(), FEED_MS, []),
    // Air quality (AirNow / EPA). Nearest monitors within 25 miles, hourly.
    // Returns null when AIRNOW_API_KEY is unset — the tile self-hides then.
    withTimeout(getAirQuality(FREDERICK_CENTER), FEED_MS, null),
    // DNR trout stockings in Frederick waters (Carroll Creek included) —
    // near-daily during the spring/fall runs, empty mid-summer. Keyless
    // state JSON API; the tile self-hides out of season.
    withTimeout(getFrederickStockings(14), FEED_MS, []),
    // Camp David airspace (FAA TFR list). Renders ONLY when the P-40 ring is
    // expanded — the quiet explanation for Thurmont's helicopter days.
    withTimeout(getCampDavidTfr(), FEED_MS, null),
  ]);

  // Current weather for the leading dashboard tile. The rich PulseWeatherPanel
  // is the tile's body; here we only need the at-a-glance temp + condition.
  const wxCur = forecast?.hourly?.[0] ?? null;
  const wxCondition = wxCur ? wxCur.shortForecast.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;

  const sevRank = { High: 0, Medium: 1, Low: 2 } as const;
  const traffic = [...incidents].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity]
  );
  const schoolAlerts = fcps.filter((a) => a.status !== "unknown");

  // Power outages are "active" only when 25+ customers are out — below
  // that threshold the data is noise (a single transformer trip).
  const outagesActive = outages.total_out >= 25;

  // Only count NWS alerts that haven't already expired. The feed
  // includes alerts with `ends_at` in the past until the cache cycles,
  // so we filter here to avoid double-counting a tornado watch the
  // page still knows about but the weather has moved past.
  // eslint-disable-next-line react-hooks/purity -- per-request expiry filter; hoisting Date.now would defeat the freshness check
  const nowMs = Date.now();
  const activeAlerts = alerts.filter(
    (a) => !a.ends_at || Date.parse(a.ends_at) > nowMs,
  );

  // Police-lane press releases. The freshest earns the breaking strip up top
  // (only if recent enough); the rest form the standing blotter in the Police
  // section, minus the featured one so the page never shows it twice.
  const breakingPolice = latestPoliceRelease(press);
  const blotter = policeReleases(press)
    .filter((p) => p.url !== breakingPolice?.url)
    .slice(0, 5);
  // Planned road work / closures / emergency advisories (distinct from the
  // live MDOT traffic tile). Self-hides when the feeds carry none recent.
  const advisories = advisoryReleases(press).slice(0, 6);

  // Pulse is active if any trusted urgent category is active. We intentionally
  // do not add unlike records into one fake "situation" total.
  const hasActive =
    activeAlerts.length > 0 ||
    safety.length > 0 ||
    traffic.length > 0 ||
    outagesActive ||
    schoolAlerts.length > 0;
  // "All clear" requires BOTH nothing active AND every urgent feed answered.
  // If a feed failed and we found nothing, the truthful read is "unknown", not
  // a reassuring all-clear (audit FR-002).
  const heroDegraded = !hasActive && urgentDegraded;
  const allClear = !hasActive && !urgentDegraded;

  const leadAlert = activeAlerts[0];
  const leadTraffic = traffic[0];
  const leadSchool = schoolAlerts[0];
  const leadSafety = safety[0];

  let heroLine = "Frederick is steady right now.";
  let heroSub = "No active weather alerts, major road incidents, significant outages, or school changes.";
  let heroLeadKey: string | undefined;
  let heroLeadMeta: string | undefined;
  let heroActionLabel: string | undefined;

  if (heroDegraded) {
    heroLine = "We can’t confirm an all-clear yet.";
    heroSub = "One or more alert feeds did not answer. The information below is what we could verify, and Pulse will retry automatically.";
  } else if (leadAlert) {
    heroLeadKey = "alerts";
    heroLine = `${leadAlert.event} for Frederick County.`;
    heroSub = alertGuidance(leadAlert.event);
    heroLeadMeta = alertEndLabel(leadAlert.ends_at);
    heroActionLabel = "Read the Frederick alert";
  } else if (outagesActive) {
    heroLeadKey = "power";
    heroLine = `${outages.total_out.toLocaleString()} customers are without power.`;
    heroSub = "Check the affected communities and the latest utility-reported totals before making a backup plan.";
    heroLeadMeta = "Potomac Edison service area";
    heroActionLabel = "See affected areas";
  } else if (leadTraffic) {
    heroLeadKey = "traffic";
    heroLine = `${leadTraffic.road}${leadTraffic.direction ? ` ${leadTraffic.direction}` : ""} has a reported incident.`;
    heroSub = leadTraffic.lanes_affected
      ? `${leadTraffic.type}. ${leadTraffic.lanes_affected}. Check the location before choosing your route.`
      : `${leadTraffic.type}. Check the location and expected clearing time before choosing your route.`;
    heroLeadMeta = leadTraffic.location;
    heroActionLabel = "Check the road impact";
  } else if (leadSchool) {
    heroLeadKey = "schools";
    heroLine = leadSchool.status === "closed"
      ? "Frederick County schools are closed."
      : leadSchool.status === "delayed"
        ? "Frederick County schools are delayed."
        : leadSchool.status === "early_dismissal"
          ? "Frederick County schools are dismissing early."
          : "FCPS has a schedule update.";
    heroSub = leadSchool.title;
    heroLeadMeta = timeAgo(leadSchool.published_at);
    heroActionLabel = "Read the FCPS update";
  } else if (leadSafety) {
    heroLeadKey = "safety";
    heroLine = `${safety.length} active fire & rescue ${safety.length === 1 ? "call" : "calls"}.`;
    heroSub = `Most recent: ${leadSafety.type}${leadSafety.address ? ` near ${leadSafety.address}` : ""}.`;
    heroLeadMeta = timeAgo(leadSafety.received_at);
    heroActionLabel = "See active calls";
  }

  const pct =
    outages.total_served > 0
      ? ((outages.total_out / outages.total_served) * 100).toFixed(2)
      : "0";

  // Rivers — group the live gauges and pick a representative reading for
  // the tile peek (the most-gauged river's first reporting gauge). Honest:
  // height + observed time only, never a synthesized flood "stage".
  const riverGroups = groupByRiver(rivers);
  const riverPeekSite = riverGroups[0]?.sites.find((s) => s.gageHeightFt != null);
  const riverPeekDir = riverPeekSite ? readingTrend(riverPeekSite.gageHistory) : null;
  const riverPeek = riverPeekSite
    ? `${riverGroups[0].river} · ${riverPeekSite.gageHeightFt!.toFixed(1)} ft${riverPeekDir ? ` · ${riverPeekDir}` : ""}`
    : undefined;

  // Airports — BWI / Dulles / Reagan. An empty `airports` means the FAA feed
  // was unreachable, so the tile self-hides rather than claim a status we
  // couldn't read; otherwise each airport is "on time" unless the feed lists a
  // delay / ground stop / closure. The peek carries the first delayed airport.
  const airportIssues = airports.filter((a) => a.state !== "clear");
  const airportPeek = airportIssues[0]
    ? `${airportIssues[0].name} ${
        airportIssues[0].state === "closure"
          ? "closed"
          : airportIssues[0].state === "ground_stop"
            ? "ground stop"
            : "delays"
      }`
    : undefined;

  // The dashboard tiles. Each carries an at-a-glance datum + its feed's full
  // detail (`body`), rendered server-side here so the client shell only owns
  // open/close state. Tapping a tile opens the body as a bottom-sheet window;
  // the long stacked sections this replaces are gone. Source attribution
  // lives once, in the footer data-trail below.
  const emptyNote = (text: string) => (
    <p className="px-1 py-6 text-center text-[13px]" style={{ color: "var(--app-ink-3)" }}>
      {text}
    </p>
  );

  // ── Bodies for the civic-feed tiles (News · Police · Road work · Scanner).
  // These reference feeds used to stack as their own text-heavy sections below
  // the board; they now live INSIDE the dashboard as tap-to-open tiles, so the
  // whole page is one unified, visual grid. Built server-side like every tile.
  const newsLead = news[0];
  const newsBody = news.length > 0 ? (
    <div className="space-y-1">
      <a
        href={newsLead.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-[var(--app-radius-md)] px-1 py-2 transition hover:bg-[var(--app-bg-sunken)]"
      >
        <h3 className="font-serif text-[17px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
          {newsLead.title}
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.07em]" style={{ color: "var(--app-ink-3)" }}>
          {newsLead.source} · {timeAgo(newsLead.published_at)}
        </p>
      </a>
      {news.length > 1 && (
        <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
          {news.slice(1, 6).map((h) => (
            <li
              key={h.url}
              className="border-b last:border-b-0"
              style={{ borderColor: "color-mix(in srgb, var(--app-border) 65%, transparent)" }}
            >
              <a
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 px-1 py-2.5 transition hover:bg-[var(--app-bg-sunken)]"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                    {h.title}
                  </span>
                  <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.07em]" style={{ color: "var(--app-ink-3)" }}>
                    {h.source} · {timeAgo(h.published_at)}
                  </span>
                </span>
                <ExternalLink aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : emptyNote("No local headlines right now.");

  const policeBody = (
    <div className="space-y-3">
      {blotter.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
            Recent releases
          </p>
          <PoliceBlotter items={blotter} now={nowMs} />
        </div>
      )}
      <div
        className={blotter.length > 0 ? "space-y-2.5 border-t pt-3" : "space-y-2.5"}
        style={blotter.length > 0 ? { borderColor: "var(--app-border)" } : undefined}
      >
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Frederick PD also publishes the prior day&apos;s calls for service from its
          CAD system on an official map, updated daily.
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
          Calls for service are not confirmed crimes. They reflect requests for
          police response, from the City of Frederick &amp; Frederick County.
        </p>
      </div>
    </div>
  );

  const roadworkBody = advisories.length > 0
    ? <PoliceBlotter items={advisories} now={nowMs} />
    : emptyNote("No road work or closures reported right now.");

  // MARC — the soonest upcoming departure across the county stations powers
  // the tile head (predicted time when the realtime feed has it, else
  // scheduled); the body is the full per-station board. A service alert tints
  // the tile amber but does NOT roll into the hero "situations" count (a train
  // delay isn't a county emergency), same stance as rivers/airports.
  const marcCandidates = marcBoard.stations.flatMap((sb) =>
    (["eb", "wb"] as const).flatMap((dir) => {
      const d = sb.departures[dir][0];
      return d ? [{ label: d.live && d.predicted ? d.predicted : d.scheduled, dep: d }] : [];
    }),
  );
  marcCandidates.sort((a, b) => marcClockMinutes(a.label) - marcClockMinutes(b.label));
  const marcNext = marcCandidates[0] ?? null;

  // Air quality — the worst pollutant leads (AQI reports the max across
  // parameters). Category 3+ (Unhealthy for Sensitive Groups and worse) tints
  // the tile; Good/Moderate stay a calm cool reading. The category color is
  // AirNow's standard AQI scale (data color, like the flood tones).
  const aqiWorst = aqiObs ? pickWorstAqi(aqiObs) : null;
  const aqiActive = aqiWorst ? aqiWorst.category.id >= 3 : false;
  const aqiAccent = !aqiWorst
    ? "var(--app-cool)"
    : aqiWorst.category.id >= 4
      ? "var(--app-danger)"
      : aqiWorst.category.id === 3
        ? "var(--app-warning)"
        : aqiWorst.category.id === 2
          ? "var(--app-accent)"
          : "var(--app-positive)";
  const aqiBody = aqiWorst ? (
    <div className="space-y-3">
      <div
        className="flex items-baseline gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        <span className="font-mono text-[32px] font-semibold leading-none tabular-nums" style={{ color: aqiWorst.category.color }}>
          {aqiWorst.aqi}
        </span>
        <span className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{aqiWorst.category.name}</span>
          <br />
          {aqiWorst.parameter} · {aqiWorst.reportingArea} · as of {aqiClock(aqiWorst.hourObserved)}
        </span>
      </div>
      {aqiObs && aqiObs.length > 1 && (
        <div className="space-y-1.5">
          {aqiObs.map((o) => (
            <Row
              key={o.parameter}
              tone={o.category.id >= 4 ? "danger" : o.category.id >= 3 ? "warning" : o.category.id === 2 ? "cool" : "muted"}
              title={o.parameter}
              body={`AQI ${o.aqi} · ${o.category.name}`}
              meta={[o.reportingArea]}
            />
          ))}
        </div>
      )}
      <p className="px-1 text-[10px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        Nearest EPA monitors within 25 miles, updated hourly.
      </p>
    </div>
  ) : null;

  // ── Presentation data for the bento board ──────────────────────────
  // The bento shows the numeric feeds as compact count-up stat tiles; the rest
  // as compact status tiles; weather as the wide feature. `attention` marks a
  // tile as one of the hero's active situations so the "Needs attention" filter
  // resolves to exactly those.
  const dailyDay = forecast?.daily?.find((p) => p.isDaytime === true);
  const dailyNight = forecast?.daily?.find((p) => p.isDaytime === false);
  const wxHl =
    [
      dailyDay ? `H ${dailyDay.temperature}°` : null,
      dailyNight ? `L ${dailyNight.temperature}°` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  const aqiShort = (id: number): string =>
    id >= 6 ? "hazardous"
      : id === 5 ? "very unhealthy"
      : id === 4 ? "unhealthy"
      : id === 3 ? "sensitive groups"
      : id === 2 ? "moderate"
      : "good";
  const aqiPct = aqiWorst ? clampPercent((aqiWorst.aqi / 300) * 100) : 0;

  const powerPct = outagesActive ? clampPercent((outages.total_out / 2000) * 100) : 0;

  const riverPeekHeight = riverPeekSite?.gageHeightFt ?? null;
  const riverFloodRef = riverPeekSite?.floodStages?.minor ?? null;
  const riverPct =
    riverPeekHeight != null ? clampPercent((riverPeekHeight / (riverFloodRef || 15)) * 100) : 0;

  const fixitPct = clampPercent((fixit.length / 25) * 100);

  const situationActive: Record<string, boolean> = {
    alerts: activeAlerts.length > 0,
    safety: safety.length > 0,
    traffic: traffic.length > 0,
    power: outagesActive,
    schools: schoolAlerts.length > 0,
  };

  const pulseTiles: PulseTile[] = [
    // Weather LEADS the board as the wide feature tile: "what's it doing out"
    // is the most-asked live question. Tapping it opens the full conditions +
    // hourly + 7-day panel as its body.
    ...(wxCur
      ? [{
          key: "weather",
          label: "Weather",
          iconName: "CloudSun",
          countLabel: `${wxCur.temperature}°`,
          accent: "var(--app-cool)",
          active: false,
          attention: false,
          kind: "feature",
          feature: {
            temp: wxCur.temperature,
            condition: wxCondition ?? "Frederick",
            hl: wxHl,
          },
          sourceLabel: "NWS · weather.gov",
          body: <PulseWeatherPanel forecast={forecast} aqiObs={aqiObs} />,
        } as PulseTile]
      : []),
    // ── Numeric feeds → animated gauge rings ──
    // Air quality: an ambient environmental reading. Self-hides when the AirNow
    // key is unset or the feed is down.
    ...(aqiWorst
      ? [{
          key: "air",
          label: "Air quality",
          iconName: "Wind",
          countLabel: `AQI ${aqiWorst.aqi}`,
          accent: aqiAccent,
          active: aqiActive,
          attention: false,
          kind: "gauge",
          gauge: { value: aqiWorst.aqi, pct: aqiPct, unit: `AQI · ${aqiShort(aqiWorst.category.id)}` },
          sourceLabel: "AirNow · EPA",
          body: aqiBody,
        } as PulseTile]
      : []),
    {
      key: "power",
      label: "Power out",
      iconName: "Zap",
      countLabel: outagesActive ? `${outages.total_out.toLocaleString()} out` : "Clear",
      accent: outagesActive ? "var(--app-danger)" : "var(--app-positive)",
      active: outagesActive,
      attention: situationActive.power,
      kind: "gauge",
      gauge: {
        value: outages.total_out,
        pct: powerPct,
        comma: true,
        unit: outagesActive ? "customers out" : "all served",
      },
      sourceLabel: "FirstEnergy / Potomac Edison",
      body: outagesActive ? (
        <>
          <div
            className="mb-1 flex items-baseline gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
            style={{
              borderColor: "var(--app-border)",
              background: "color-mix(in srgb, var(--app-danger) 6%, var(--app-bg-elevated))",
            }}
          >
            <span className="font-mono text-[28px] font-semibold leading-none tabular-nums" style={{ color: "var(--app-danger)" }}>
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
        </>
      ) : emptyNote("No significant power outages right now."),
    },
    // ── The rest → compact status tiles ──
    {
      key: "safety",
      label: "Fire & rescue",
      iconName: "Siren",
      countLabel: safety.length > 0 ? `${safety.length} active` : "Clear",
      accent: safety.length > 0 ? "var(--app-danger)" : "var(--app-positive)",
      active: safety.length > 0,
      attention: situationActive.safety,
      kind: "status",
      sourceLabel: "PulsePoint",
      peek: safety.length > 0 ? safety[0].type : "no active calls",
      body: safety.length > 0
        ? safety.slice(0, 12).map((s) => (
            <Row key={s.id} tone="danger" title={s.type} meta={[s.address, timeAgo(s.received_at)]} />
          ))
        : emptyNote("No active fire or rescue calls right now."),
    },
    {
      key: "traffic",
      label: "Traffic",
      iconName: "Construction",
      countLabel: traffic.length > 0 ? `${traffic.length} ${traffic.length === 1 ? "incident" : "incidents"}` : "Clear",
      accent: traffic.length > 0 ? "var(--app-warning)" : "var(--app-positive)",
      active: traffic.length > 0,
      attention: situationActive.traffic,
      kind: "status",
      sourceLabel: "MDOT CHART",
      peek:
        traffic.length > 0
          ? `${traffic[0].road || traffic[0].location}${traffic[0].direction ? ` ${traffic[0].direction}` : ""} · ${traffic[0].type}`
          : "roads moving",
      body: traffic.length > 0
        ? traffic.slice(0, 12).map((i) => (
            <Row
              key={i.id}
              tone={i.severity === "High" ? "danger" : i.severity === "Medium" ? "warning" : "muted"}
              title={`${i.road || i.location}${i.direction ? ` ${i.direction}` : ""} · ${i.type}`}
              body={i.description}
              meta={[
                i.location.trim().toLocaleLowerCase() !== i.description.trim().toLocaleLowerCase()
                  ? i.location
                  : undefined,
                i.lanes_affected,
                i.expected_end
                  ? `Clears ~${new Date(i.expected_end).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric" })}`
                  : undefined,
              ]}
            />
          ))
        : emptyNote("No traffic incidents or roadwork reported right now."),
    },
    {
      key: "schools",
      label: "Schools",
      iconName: "School",
      countLabel: schoolAlerts.length > 0 ? `${schoolAlerts.length} ${schoolAlerts.length === 1 ? "alert" : "alerts"}` : "Clear",
      accent: schoolAlerts.length > 0 ? "var(--app-warning)" : "var(--app-positive)",
      active: schoolAlerts.length > 0,
      attention: situationActive.schools,
      kind: "status",
      sourceLabel: "FCPS RSS",
      peek:
        schoolAlerts.length > 0
          ? schoolAlerts[0].status === "closed"
            ? "Schools closed"
            : schoolAlerts[0].status === "delayed"
              ? "Delayed opening"
              : schoolAlerts[0].status === "early_dismissal"
                ? "Early dismissal"
                : "Update"
          : "no alerts today",
      body: schoolAlerts.length > 0
        ? schoolAlerts.map((a) => (
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
          ))
        : emptyNote("No school closures or delays right now."),
    },
    {
      key: "fixit",
      label: "311 open",
      iconName: "AlertTriangle",
      countLabel: fixit.length > 0 ? `${fixit.length} open` : "Clear",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      kind: "gauge",
      gauge: { value: fixit.length, pct: fixitPct, unit: "open reports" },
      sourceLabel: "FCG FixIT · SeeClickFix",
      body: fixit.length > 0
        ? fixit.slice(0, 10).map((i) => (
            <Row
              key={i.id}
              tone={i.status === "closed" ? "muted" : "cool"}
              title={i.summary}
              body={i.category && i.category !== i.summary ? i.category : undefined}
              meta={[i.address, timeAgo(i.reported_at), i.status]}
            />
          ))
        : emptyNote("No open 311 reports right now."),
    },
    {
      key: "alerts",
      label: "Weather alerts",
      iconName: "CloudAlert",
      countLabel: activeAlerts.length > 0 ? activeAlerts[0].event : "None",
      accent: activeAlerts.length > 0 ? "var(--app-danger)" : "var(--app-positive)",
      active: activeAlerts.length > 0,
      attention: situationActive.alerts,
      kind: "status",
      sourceLabel: "NWS · weather.gov",
      peek: activeAlerts.length > 0 ? `${activeAlerts.length} active` : "nothing posted",
      body: activeAlerts.length > 0
        ? activeAlerts.slice(0, 6).map((a) => {
            const tone =
              a.severity === "Extreme" || a.severity === "Severe"
                ? "danger"
                : a.severity === "Moderate"
                  ? "warning"
                  : "cool";
            return (
              <div key={a.id} className="space-y-1.5">
                <Row
                  tone={tone}
                  title={a.event}
                  body={alertGuidance(a.event)}
                  meta={["Frederick County", alertEndLabel(a.ends_at)]}
                />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-1 text-[11px] font-semibold"
                  style={{ color: "var(--app-cool)" }}
                >
                  Read the full official alert
                  <ExternalLink aria-hidden className="h-3 w-3" />
                </a>
              </div>
            );
          })
        : emptyNote("No weather alerts for Frederick County right now."),
    },
    {
      // Rivers is live county data (rising water), not an alert — it stays a
      // calm cool tile (active:false): no accent band, no "situation" count
      // in the hero roll-up. The peek carries a representative gage reading
      // so a glance gets the water level; the window lists every gauge by
      // river with height + streamflow + observed-ago, and links to the full
      // /rivers dashboard for 24-hour trends + the map.
      key: "rivers",
      label: riverPeekHeight != null ? (riverGroups[0]?.river ?? "River") : "Rivers",
      iconName: "Waves",
      countLabel: rivers.length > 0
        ? `${rivers.length} ${rivers.length === 1 ? "gauge" : "gauges"}`
        : "No data",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      kind: riverPeekHeight != null ? "gauge" : "status",
      ...(riverPeekHeight != null
        ? {
            gauge: {
              value: riverPeekHeight,
              pct: riverPct,
              decimals: 1,
              unit: `ft · ${riverPeekDir ?? "steady"}`,
            },
          }
        : { peek: riverPeek }),
      sourceLabel: "USGS Water Services",
      body: rivers.length > 0
        ? (
          <div className="space-y-4">
            {riverGroups.map((g) => (
              <div key={g.river} className="space-y-2">
                <p className="flex items-baseline gap-1.5 px-0.5">
                  <span className="font-serif text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {g.river}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                    {g.sites.length} {g.sites.length === 1 ? "gauge" : "gauges"}
                  </span>
                </p>
                <ul className="space-y-2.5">
                  {g.sites.map((s) => {
                    const hasHeight = s.gageHeightFt != null;
                    const dir = readingTrend(s.gageHistory) ?? readingTrend(s.streamflowHistory);
                    const flood = classifyFlood(s.gageHeightFt, s.floodStages);
                    const trendTone: "neutral" | "good" | "warning" =
                      dir === "rising" ? "warning" : dir === "falling" ? "good" : "neutral";
                    const trendLabel =
                      dir === "rising" ? "Rising" : dir === "falling" ? "Falling" : dir === "steady" ? "Steady" : "Live";
                    // A flood category (action+) outranks the trend on the pill —
                    // on a water board, "how close to flooding" beats "rising".
                    const status: { label: string; tone: "neutral" | "good" | "warning" | "danger" } =
                      flood && flood.key !== "normal"
                        ? { label: flood.label, tone: flood.tone === "danger" ? "danger" : "warning" }
                        : { label: trendLabel, tone: trendTone };
                    const value = hasHeight ? s.gageHeightFt!.toFixed(2) : (s.streamflowCfs ?? 0).toLocaleString();
                    const unit = hasHeight ? "ft" : "ft³/s";
                    const trend = hasHeight ? s.gageHistory?.map((r) => r.value) : s.streamflowHistory?.map((r) => r.value);
                    const secondary = hasHeight && s.streamflowCfs != null
                      ? `Flow ${s.streamflowCfs.toLocaleString()} ft³/s`
                      : null;
                    const ago = s.observedAt ? timeAgo(s.observedAt) : "";
                    return (
                      <li key={s.id}>
                        <MetricCard
                          title={riverLocationOf(s.name) || titleCaseRiver(s.name)}
                          value={value}
                          unit={unit}
                          trend={trend}
                          animatedTrend
                          accent="var(--app-cool)"
                          trendStroke="var(--app-cool)"
                          status={status}
                          meta={
                            ago || secondary ? (
                              <>
                                {ago}
                                {ago && secondary && <span className="mx-1.5 opacity-50">·</span>}
                                {secondary}
                              </>
                            ) : undefined
                          }
                          footer={
                            flood && s.floodStages && s.gageHeightFt != null ? (
                              <FloodGauge current={s.gageHeightFt} stages={s.floodStages} category={flood} animated />
                            ) : undefined
                          }
                          href={
                            s.floodStages
                              ? nwsGaugeUrl(s.floodStages.nws)
                              : `https://waterdata.usgs.gov/monitoring-location/${s.id}/`
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <Link
              href="/rivers"
              className="inline-flex items-center gap-1 px-1 pt-1 text-[12px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              See 24-hour trends and the gauge map
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
            <p className="px-1 pt-0.5 text-[10px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              Latest reading + 6-hour trend. Flood categories are the National Weather Service&rsquo;s; crest forecasts stay with them.
            </p>
          </div>
        )
        : emptyNote("River gauge readings are briefly unavailable."),
    },
    ...(airports.length > 0
      ? [{
          // BWI / Dulles / Reagan. The accent goes amber + the tile tints only
          // when there's an actual delay; an "on time" day stays a calm cool
          // tile. Not part of the hero situation roll-up (a flight delay isn't
          // a county emergency) — the peek names the delayed airport.
          key: "airports",
          label: "Airports",
          iconName: "Plane",
          countLabel: airportIssues.length > 0 ? `${airportIssues.length} delayed` : "On time",
          accent: airportIssues.length > 0 ? "var(--app-warning)" : "var(--app-cool)",
          active: airportIssues.length > 0,
          attention: false,
          kind: "status",
          sourceLabel: "FAA",
          peek: airportPeek ?? "BWI · IAD · DCA",
          body: (
            <div className="space-y-1.5">
              {airports.map((a) => (
                <Row
                  key={a.code}
                  tone={
                    a.state === "closure" || a.state === "ground_stop"
                      ? "danger"
                      : a.state === "delay"
                        ? "warning"
                        : "muted"
                  }
                  title={a.name}
                  meta={[a.code, a.state === "clear" ? "On time" : a.detail ?? a.state.replace("_", " ")]}
                />
              ))}
            </div>
          ),
        } as PulseTile]
      : []),
    // MARC Brunswick Line — the county's commuter rail, beside the live bus map.
    // Calm cool tile (informational transit, not a hero "situation"); a service
    // alert tints it amber. The head shows the soonest departure, the body the
    // full per-station board. On weekends/after the last train it reads honestly.
    {
      key: "train",
      label: "MARC trains",
      iconName: "TrainFront",
      countLabel: !marcBoard.serviceToday ? "No service" : marcNext ? marcNext.label : "Done today",
      accent: marcAlerts.length > 0 ? "var(--app-warning)" : "var(--app-cool)",
      active: marcAlerts.length > 0,
      attention: false,
      kind: "status",
      sourceLabel: "MTA MARC · Brunswick Line",
      peek: marcAlerts.length > 0
        ? marcAlerts[0].header || "Service alert"
        : marcNext
          ? `to ${marcNext.dep.headsign}`
          : marcBoard.serviceToday
            ? "Brunswick Line"
            : undefined,
      body: <NextTrainBoard board={marcBoard} alerts={marcAlerts} />,
    },
    // Trout stockings — seasonal, self-hides mid-summer. Frederick's waters
    // (Carroll Creek included) get near-daily drops in the spring/fall runs.
    ...(troutStockings.length > 0
      ? [{
          key: "trout",
          label: "Trout stocking",
          iconName: "Fish",
          countLabel: `${troutStockings.length} recent`,
          accent: "var(--app-cool)",
          active: false,
          attention: false,
          kind: "status",
          sourceLabel: "Maryland DNR",
          peek: `${troutStockings[0].location} · ${troutStockings[0].species}`,
          body: troutStockings.map((t) => (
            <Row
              key={`${t.location}-${t.date}`}
              tone="cool"
              title={t.location}
              meta={[
                `${t.fish} ${t.species}`,
                new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(t.date)),
                t.regulations,
              ]}
            />
          )),
        } as PulseTile]
      : []),
    // Camp David airspace — renders ONLY while the P-40 ring is expanded.
    ...(campDavidTfr
      ? [{
          key: "airspace",
          label: "Camp David airspace",
          iconName: "Plane",
          countLabel: "Expanded",
          accent: "var(--app-warning)",
          active: true,
          attention: false,
          kind: "status",
          sourceLabel: "FAA TFR",
          peek: "Restrictions widened over Thurmont",
          body: (
            <p className="px-1 py-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              The FAA has expanded the flight-restriction ring around Camp David
              (NOTAM {campDavidTfr.notamId}). Expect helicopters and extra
              activity around Thurmont and Catoctin Mountain Park.
            </p>
          ),
        } as PulseTile]
      : []),
    // ── Reference feeds, first-class status tiles (were stacked text sections).
    {
      key: "news",
      label: "In the news",
      iconName: "Newspaper",
      countLabel: news.length > 0 ? `${news.length} ${news.length === 1 ? "story" : "stories"}` : "Quiet",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      kind: "status",
      sourceLabel: "Google News · Frederick County",
      peek: news[0]?.title,
      body: newsBody,
    },
    {
      key: "police",
      label: "Police & safety",
      iconName: "Shield",
      countLabel: blotter.length > 0 ? `${blotter.length} ${blotter.length === 1 ? "release" : "releases"}` : "CFS map",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      kind: "status",
      sourceLabel: "Frederick PD · City + County",
      peek: breakingPolice?.title ?? blotter[0]?.title,
      body: policeBody,
    },
    ...(advisories.length > 0
      ? [{
          key: "roadwork",
          label: "Road work",
          iconName: "TrafficCone",
          countLabel: `${advisories.length} ${advisories.length === 1 ? "advisory" : "advisories"}`,
          accent: "var(--app-cool)",
          active: false,
          attention: false,
          kind: "status",
          sourceLabel: "City + County advisories",
          peek: advisories[0]?.title,
          body: roadworkBody,
        } as PulseTile]
      : []),
    {
      key: "scanner",
      label: "Scanner",
      iconName: "Radio",
      countLabel: "On X",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      kind: "status",
      sourceLabel: "Frederick Scanner · X",
      peek: "Police, fire & EMS calls",
      body: <ScannerTimeline />,
    },
  ];

  // ── Hero + ticker for the board ──────────────────────────────────
  const hero: PulseHero = {
    allClear,
    degraded: heroDegraded,
    line: heroLine,
    sub: heroSub,
    renderedAt: nowMs,
    refreshedClock: nowClock(),
    leadKey: heroLeadKey,
    leadMeta: heroLeadMeta,
    actionLabel: heroActionLabel,
  };

  // Supporting facts only: the lead issue is already fully explained in the
  // hero and must not appear again as a duplicate chip.
  const heroChips: PulseHeroChip[] = [];
  const addHeroChip = (chip: PulseHeroChip) => {
    if (chip.key === heroLeadKey || heroChips.some((item) => item.key === chip.key)) return;
    heroChips.push(chip);
  };
  if (!allClear) {
    if (outagesActive) {
      addHeroChip({ tone: "danger", label: `${outages.total_out.toLocaleString()} without power`, key: "power" });
    }
    if (leadTraffic) {
      addHeroChip({ tone: "warning", label: `${leadTraffic.road}${leadTraffic.direction ? ` ${leadTraffic.direction}` : ""}`, key: "traffic" });
    }
    if (leadSafety) {
      addHeroChip({ tone: "danger", label: leadSafety.type, key: "safety" });
    }
    if (leadSchool) {
      addHeroChip({
        tone: "warning",
        label: leadSchool.status === "closed" ? "Schools closed" : leadSchool.status === "delayed" ? "Schools delayed" : "School update",
        key: "schools",
      });
    }
    if (!leadTraffic) addHeroChip({ tone: "positive", label: "Roads clear", key: "traffic" });
    if (!outagesActive) addHeroChip({ tone: "positive", label: "Power steady", key: "power" });
    if (!leadSchool) addHeroChip({ tone: "positive", label: "Schools normal", key: "schools" });
    if (!leadSafety) addHeroChip({ tone: "positive", label: "Fire & rescue quiet", key: "safety" });
    if (!leadAlert) addHeroChip({ tone: "positive", label: "No weather alerts", key: "alerts" });
  } else {
    addHeroChip({ tone: "positive", label: "Roads clear", key: "traffic" });
    addHeroChip({ tone: "positive", label: "Power steady", key: "power" });
    addHeroChip({ tone: "positive", label: "Schools normal", key: "schools" });
    if (wxCur) {
      addHeroChip({ tone: "cool", label: `${wxCur.temperature}°${wxCondition ? ` ${wxCondition}` : ""}`, key: "weather" });
    }
    if (aqiWorst && aqiWorst.category.id <= 2) {
      addHeroChip({ tone: "cool", label: `Air ${aqiWorst.category.name.toLowerCase()}`, key: "air" });
    }
  }
  const heroChipsCapped = heroChips.slice(0, 4);

  return (
    <div className="relative space-y-6 pb-4">
      <PageBloom variant={allClear ? "warm-cool" : "single"} />

      {/* The briefing owns hierarchy and interaction; detail remains in sourced
          drawers so the first screen stays useful at a glance. */}
      <PulseBoard
        hero={hero}
        chips={heroChipsCapped}
        tiles={pulseTiles}
        breaking={breakingPolice ? <PoliceBreakingStrip item={breakingPolice} now={nowMs} /> : undefined}
      />

      {/* ── Where the buses are — the live TransIT map, behind one tap. The map
          (mapbox + a 300px canvas) is the heaviest thing on the page; on a
          scan-first board it stays collapsed so it never renders as a tall
          empty placeholder. Tapping mounts the route network + live vehicle
          badges + the arrivals board, and only then does mapbox download. */}
      <section aria-labelledby="transit-map-eyebrow" className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <p id="transit-map-eyebrow" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
            <span aria-hidden className="pulse-dot inline-block h-2 w-2 rounded-full" style={{ background: "var(--app-positive)" }} />
            Buses, live
          </p>
          <span className="font-mono text-[10.5px] tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
            tap a bus · free
          </span>
        </div>
        <BusesReveal />
        <p className="text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Live bus positions from TransIT&rsquo;s GTFS-realtime feed, refreshed
          every 15 seconds. Tap a route to trace its path and follow just its
          buses. The county bus is free.
        </p>
      </section>
      {/* Footer — disclaimer + sources at a glance */}
      <footer
        className="rounded-[var(--app-radius-md)] border p-4 text-[11px]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-3)",
        }}
      >
        <p className="leading-relaxed">
          Informational only, not a substitute for 911 or official
          emergency broadcasts.
        </p>
        <details className="group mt-3 border-t pt-1" style={{ borderColor: "var(--app-border)" }}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
            <ChevronRight aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Sources &amp; data trail
          </summary>
          <div className="grid grid-cols-1 gap-1.5 pb-1 pt-2 sm:grid-cols-2">
            <SourceLine label="Weather alerts" source="NWS · weather.gov" href="https://www.weather.gov/" />
            <SourceLine label="Fire & rescue" source="PulsePoint" href="https://web.pulsepoint.org/" />
            <SourceLine label="Traffic" source="MDOT CHART" href="https://chart.maryland.gov/" />
            <SourceLine label="Power" source="FirstEnergy" href="https://outages-mdwv.firstenergycorp.com/" />
            <SourceLine label="Schools" source="FCPS RSS" href="https://www.fcps.org/" />
            <SourceLine label="MARC trains" source="MTA Maryland" href="https://www.mta.maryland.gov/schedule/marc" />
            <SourceLine label="Air quality" source="AirNow · EPA" href="https://www.airnow.gov/" />
            <SourceLine label="311 reports" source="FCG FixIT · SeeClickFix" href="https://www.frederickcountymd.gov/8235/FCG-FixIT" />
            <SourceLine label="News" source="Google News · Frederick" href="https://news.google.com/search?q=Frederick%20County%20Maryland" />
            <SourceLine label="Police" source="Frederick PD" href="https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map" />
          </div>
        </details>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Components
 * ───────────────────────────────────────────────────────────── */

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

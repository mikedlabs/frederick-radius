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
  Siren,
  ShieldCheck,
  ExternalLink, MapPin, Clock, ChevronRight,
  Radio,
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
import { getFrederickTransitRoutes, getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { getFrederickWaterSitesWithHistory, readingTrend, type WaterSite } from "@/lib/integrations/usgsWater";
import { classifyFlood, nwsGaugeUrl } from "@/lib/integrations/floodStage";
import MetricCard from "@/components/live-data/MetricCard";
import FloodGauge from "@/components/live-data/FloodGauge";
import { getAreaAirportStatus, type AirportStatus } from "@/lib/integrations/faa-airports";
import { publicPlaces } from "@/lib/loaders/places";
import { MUNICIPALITIES } from "@/data/municipalities";
import PageBloom from "@/components/ui/PageBloom";
import ScannerTimeline from "@/components/pulse/ScannerTimeline";
import { PoliceBreakingStrip, PoliceBlotter, AdvisoryCard } from "@/components/pulse/CivicPress";
import PulseDashboard, { type PulseTile } from "@/components/pulse/PulseDashboard";
import TransitMap from "@/components/transit/TransitMapClient";
import NextStopsBoard from "@/components/transit/NextStopsBoard";
import PulseFreshness from "@/components/pulse/PulseFreshness";
import PulseWeatherPanel from "@/components/pulse/PulseWeatherPanel";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import {
  Users,
  Square,
  CalendarHeart,
  Building2,
  Bus,
  Trees,
  Utensils,
  Waves as WavesIcon,
  Mountain,
  type LucideIcon,
} from "lucide-react";

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

function nowClock(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
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

export default async function PulsePage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  // ?open=<tileKey> opens that feed's window on arrival (e.g. tapped from
  // /today's LivePulse, which deep-links /pulse?open=traffic).
  const { open: openParam } = await searchParams;
  // Every feed is raced against a 6s timeout + an empty fallback (withTimeout),
  // so one slow or failing upstream can't stall the ISR regeneration or blank
  // the board — each tile self-hides on an empty feed.
  const FEED_MS = 6000;
  const [incidents, outages, fcps, fixit, safety, alerts, news, press, transitRoutes, rivers, airports, transitShapes, forecast] = await Promise.all([
    withTimeout(getChartIncidentsFrederick(), FEED_MS, []),
    withTimeout(getFrederickOutages(), FEED_MS, { total_out: 0, total_served: 0, munis: [] }),
    withTimeout(getFcpsAlerts(), FEED_MS, []),
    withTimeout(getFixItIssues(15), FEED_MS, []),
    withTimeout(getPulsePointIncidents(), FEED_MS, []),
    // NWS active alerts for Frederick County, MD. When something's up (severe
    // storm, flood, heat advisory) this rides at the top of the board.
    withTimeout(getNwsAlerts(), FEED_MS, []),
    // Local headlines from Google News RSS — always-on city signal.
    withTimeout(getLocalHeadlines(), FEED_MS, []),
    // Official City + County press releases (CivicPlus News Flash RSS). The
    // police-lane items get the breaking strip up top + the blotter below.
    withTimeout(getCivicPressReleases(), FEED_MS, []),
    // TransIT route count for the "by the numbers" grid (weekly-cached loader).
    withTimeout(getFrederickTransitRoutes(), FEED_MS, []),
    // USGS live gage height + streamflow for county rivers, WITH 24h history
    // (powers the tile's sparklines + rising/falling read + NWS flood gauge).
    withTimeout(getFrederickWaterSitesWithHistory(), FEED_MS, [] as WaterSite[]),
    // FAA status for BWI / Dulles / Reagan; the tile self-hides when empty.
    withTimeout(getAreaAirportStatus(), FEED_MS, [] as AirportStatus[]),
    // TransIT route shapes + stops for the live bus map (weekly-cached).
    withTimeout(getFrederickTransitRouteShapes(), FEED_MS, { type: "FeatureCollection" as const, features: [] }),
    // Current conditions for the leading Weather tile (the full panel is its
    // tap-to-open body). Same cached NWS call PulseWeatherPanel makes.
    withTimeout(getNwsForecast(FREDERICK_CENTER), FEED_MS, null),
  ]);

  // Current weather for the leading dashboard tile. The rich PulseWeatherPanel
  // is the tile's body; here we only need the at-a-glance temp + condition.
  const wxCur = forecast?.hourly?.[0] ?? null;
  const wxCondition = wxCur ? wxCur.shortForecast.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;

  // ── "By the numbers" canon — pure / no fetch beyond the routes
  // above. Computed once at request time. Numbers blend our LIVE
  // directory counts with established Frederick County facts so the
  // panel reads as a real snapshot of the place, not a marketing
  // brochure. Population from US Census ACS 2023 estimate, land
  // area from the official county profile.
  const places = publicPlaces();
  const parksCount = places.filter((p) => p.category === "park" || p.category === "trail" || p.category === "playground").length;
  const restaurantsCount = places.filter((p) => p.category === "restaurant" || p.category === "pizza" || p.category === "bakery" || p.category === "coffee" || p.category === "bar" || p.category === "brewery").length;
  // De-dupe route names so the count matches what /transit shows
  // (variations of one route collapse to one entry there too).
  const routesCount = new Set(transitRoutes.map((r) => r.name)).size;

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
    : "Weather alerts, traffic, power, schools, fire & rescue, combined from six county and state feeds.";

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
  const pulseTiles: PulseTile[] = [
    // Weather LEADS the board: "what's it doing out" is the most-asked live
    // question. An ambient tile (not an alarm) carrying the current reading;
    // tapping it opens the full conditions + hourly + 7-day panel as its body.
    ...(wxCur
      ? [{
          key: "weather",
          label: "Weather",
          iconName: "CloudSun",
          countLabel: `${wxCur.temperature}°`,
          accent: "var(--app-cool)",
          active: false,
          sourceLabel: "NWS · weather.gov",
          peek: wxCondition ?? undefined,
          body: <PulseWeatherPanel />,
        } as PulseTile]
      : []),
    {
      key: "safety",
      label: "Fire & rescue",
      iconName: "Siren",
      countLabel: safety.length > 0 ? `${safety.length} active` : "Clear",
      accent: "var(--app-danger)",
      active: safety.length > 0,
      sourceLabel: "PulsePoint",
      peek: safety.length > 0 ? safety[0].type : undefined,
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
      accent: "var(--app-warning)",
      active: traffic.length > 0,
      sourceLabel: "MDOT CHART",
      peek:
        traffic.length > 0
          ? `${traffic[0].road}${traffic[0].direction ? ` ${traffic[0].direction}` : ""} · ${traffic[0].type}`
          : undefined,
      body: traffic.length > 0
        ? traffic.slice(0, 12).map((i) => (
            <Row
              key={i.id}
              tone={i.severity === "High" ? "danger" : i.severity === "Medium" ? "warning" : "muted"}
              title={`${i.road}${i.direction ? ` ${i.direction}` : ""} · ${i.type}`}
              body={i.description}
              meta={[
                i.location,
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
      key: "power",
      label: "Power",
      iconName: "Zap",
      countLabel: outagesActive ? `${outages.total_out.toLocaleString()} out` : "Clear",
      accent: "var(--app-danger)",
      active: outagesActive,
      sourceLabel: "FirstEnergy / Potomac Edison",
      peek:
        outagesActive && outages.munis.length > 0
          ? `${outages.munis[0].area}, ${outages.munis[0].customers_out.toLocaleString()} out`
          : undefined,
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
    {
      key: "schools",
      label: "Schools",
      iconName: "School",
      countLabel: schoolAlerts.length > 0 ? `${schoolAlerts.length} ${schoolAlerts.length === 1 ? "alert" : "alerts"}` : "Clear",
      accent: "var(--app-warning)",
      active: schoolAlerts.length > 0,
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
          : undefined,
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
      label: "311 reports",
      iconName: "AlertTriangle",
      countLabel: fixit.length > 0 ? `${fixit.length} open` : "Clear",
      accent: "var(--app-cool)",
      active: fixit.length > 0,
      sourceLabel: "FCG FixIT · SeeClickFix",
      peek: fixit.length > 0 ? fixit[0].summary : undefined,
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
      countLabel: activeAlerts.length > 0 ? `${activeAlerts.length} active` : "Clear",
      accent: "var(--app-danger)",
      active: activeAlerts.length > 0,
      sourceLabel: "NWS · weather.gov",
      peek: activeAlerts.length > 0 ? activeAlerts[0].event : undefined,
      body: activeAlerts.length > 0
        ? activeAlerts.slice(0, 6).map((a) => {
            const tone =
              a.severity === "Extreme" || a.severity === "Severe"
                ? "danger"
                : a.severity === "Moderate"
                  ? "warning"
                  : "cool";
            const endsLabel = a.ends_at
              ? `Through ${new Date(a.ends_at).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })}`
              : undefined;
            return <Row key={a.id} tone={tone} title={a.event} body={a.headline} meta={[a.area, endsLabel]} />;
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
      label: "Rivers",
      iconName: "Waves",
      countLabel: rivers.length > 0
        ? `${rivers.length} ${rivers.length === 1 ? "gauge" : "gauges"}`
        : "No data",
      accent: "var(--app-cool)",
      active: false,
      sourceLabel: "USGS Water Services",
      peek: riverPeek,
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
              Latest reading + 24-hour trend. Flood categories are the National Weather Service&rsquo;s; crest forecasts stay with them.
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
          sourceLabel: "FAA",
          peek: airportPeek,
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
  ];

  return (
    <div className="relative space-y-6 pb-4">
      <PageBloom variant={allClear ? "warm-cool" : "single"} />

      {/* ── Hero ───────────────────────────────────────────────── */}
      {/* The hero is a card-with-edge-tint when there's active data,
          so the page itself signals "something is up" before the user
          reads the headline. Calm states keep the standard paper-cream
          look so the page doesn't yell at users on quiet days. */}
      {/* The masthead is a CONTAINED tactile card (no longer an edge-to-edge
          band on mobile) so it sits "within the main part" like every other
          card on the page. It signals state: a sage shield + calm paper when
          all-clear, a danger siren + a faint danger wash + a slow breathing
          ring (the shared .alert-pulse) when something is live, so a glance
          reads the county's status before the headline does. */}
      <header
        className={`tactile relative overflow-hidden rounded-[var(--app-radius-lg)]${allClear ? "" : " alert-pulse"}`}
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: allClear
            ? "var(--app-paper-light)"
            : "var(--app-paper-light), linear-gradient(155deg, color-mix(in srgb, var(--app-danger) 9%, transparent) 0%, transparent 68%)",
          boxShadow: "var(--app-elev-2), var(--app-hi), var(--app-edge)",
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
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {/* Masthead row: the Live Pulse nameplate (left) + freshness (right),
              split so neither wraps awkwardly. */}
          <div className="flex items-center justify-between gap-3">
            <span
              className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--app-ink-2)" }}
            >
              <span
                aria-hidden
                className="pulse-dot inline-block h-2 w-2 rounded-full"
                style={{ background: allClear ? "var(--app-positive)" : "var(--app-danger)" }}
              />
              Live Pulse
            </span>
            <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
              <PulseFreshness renderedAt={nowMs} />
            </span>
          </div>

          {/* Status hero: a state glyph anchors the headline + sub. */}
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${allClear ? "var(--app-positive)" : "var(--app-danger)"} 14%, transparent)`,
                color: allClear ? "var(--app-positive)" : "var(--app-danger)",
              }}
            >
              {allClear ? <ShieldCheck className="h-5 w-5" strokeWidth={2} /> : <Siren className="h-5 w-5" strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <h1
                className="font-serif text-[24px] font-semibold leading-[1.1] tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {heroLine}
              </h1>
              <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                {heroSub}
              </p>
            </div>
          </div>

          {/* The live conditions now lead the dashboard as a full PulseWeatherPanel
              (below) instead of a compact line buried in the header. */}
          <p
            className="flex items-center gap-1.5 text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
            Refreshed {nowClock()} · auto-updates every couple of minutes
          </p>
        </div>
      </header>

      {/* ── Breaking: the latest police / public-safety press release from
          the City or County, straight from their official .gov newsroom.
          Rides above the dashboard because it's the most time-sensitive
          civic signal a resident wants. Absent when there's no recent one. */}
      {breakingPolice && <PoliceBreakingStrip item={breakingPolice} now={nowMs} />}

      {/* Weather is now the LEADING dashboard tile (key: "weather") rather than
          a standalone panel: tapping it opens the full PulseWeatherPanel (sky
          header, realtime stats, hourly curve, sun, 7-day) as the tile's body,
          so weather is a first-class main category consistent with every other
          feed's tap-to-open pattern. */}

      {/* ── Status dashboard — each tile opens the feed's detail in a
          bottom-sheet "window"; no more scroll-to-section. Seven tiles now
          (the six operational feeds + Rivers). Police stays a quiet card
          below (no feed to count); News + Scanner too. */}
      <PulseDashboard tiles={pulseTiles} initialOpen={openParam} />

      {/* ── Where the buses are — the live TransIT map. The route network +
          stops on the real basemap, with live vehicle badges that glide
          between polls. Tap a bus for its route + status. Code-split (mapbox
          loads in its own chunk) so the page shell paints first. */}
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
        <TransitMap
          shapes={transitShapes}
          height={300}
          /* Open on downtown Frederick (Market & Patrick) — the densest part of
             the network and where most riders are. The lockToService leash keeps
             the camera over the service area; the user zooms out for outer routes. */
          center={[-77.4105, 39.4143]}
          zoom={12.5}
          liveBuses
          highlightRoutes
          hideBadge
          lockToService
        />
        {/* Live arrivals board — every bus's NEXT stop + countdown, no tapping.
            Polls the same vehicle feed as the map; self-hides when none. */}
        <NextStopsBoard />
        <p className="text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Live bus positions from TransIT&rsquo;s GTFS-realtime feed, refreshed
          every 15 seconds. Tap a route to trace its path and follow just its
          buses. The county bus is free.
        </p>
      </section>

      {/* ── Active sections only ──────────────────────────────── */}
      {/* Desktop multi-column: at lg+ the operational sections fall
          into a 2-col grid so traffic, power, schools, alerts, news
          read side-by-side instead of as long single-column rows.
          Mobile keeps the natural vertical stack. The grid is on the
          parent <div>; conditional children populate cells in source
          order so urgency stays top-left. */}
      {/* Secondary surfaces — Scanner, local news, the police blotter, and
          road-work advisories. These are REFERENCE feeds (text-heavy), so they
          now live behind ONE "More civic feeds" disclosure: the live, visual
          dashboard + buses + rivers lead, and /pulse stops reading as a long
          text scroll. The operational feeds are the tap-to-open tiles above. */}
      <CollapsibleSection title="More civic feeds & news" storageKey="fr.pulse.feeds" defaultOpen={false}>
      <div className="space-y-4 pt-1">

      {/* Frederick Scanner — Twitter/X timeline embed. Sits between
          the operational feeds and the editorial news section because
          the scanner is operational-news in feel (raw incidents)
          but lives on a third-party surface. Self-falls-back to an
          "open on X" link card if the widget can't load. */}
      <section
        id="scanner"
        className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
        style={{
          // Explicit side colors (not the borderColor shorthand) so the left
          // accent longhand below doesn't trip React's shorthand/longhand warn.
          borderTopColor: "var(--app-border)",
          borderRightColor: "var(--app-border)",
          borderBottomColor: "var(--app-border)",
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
      </section>

      {/* Rivers moved INTO the dashboard as the cool-accent 7th tile — it's
          live county data (gage height), so it belongs in the heat-map grid
          alongside the other live feeds, not stranded below as a quiet link.
          The full /rivers dashboard (24h trends + map) is linked from inside
          the tile's window. */}

      {/* City signal — Local news. Always-on city data even when the
          operational feeds are quiet. Top headlines from Google News
          RSS for Frederick County + the four named towns. Each row
          links out; rendering quiet headline text + source +
          published-ago meta. */}
      {news.length > 0 && (() => {
        // Broadsheet treatment: a lead story set large in serif, then a tight
        // ruled column of the rest. Typography carries the "newspaper" feel.
        const [lead, ...rest] = news.slice(0, 6);
        const dateline = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
          month: "short",
          day: "numeric",
        }).format(new Date(nowMs));
        return (
        <section
          id="news"
          className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          {/* Nameplate — a masthead double-rule, serif title, mono dateline. */}
          <div className="px-4 pt-3.5 sm:px-5">
            <div aria-hidden className="h-px" style={{ background: "var(--app-ink)" }} />
            <div className="flex items-baseline justify-between gap-3 pt-2">
              <h2 className="font-serif text-[21px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
                In the news
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
                Frederick · {dateline}
              </span>
            </div>
            <div aria-hidden className="mt-2 h-px" style={{ background: "color-mix(in srgb, var(--app-ink) 28%, transparent)" }} />
          </div>

          {/* Lead story — set larger in serif, the broadsheet lead. */}
          <a
            href={lead.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-3 transition hover:bg-[var(--app-bg-sunken)] sm:px-5"
          >
            <h3 className="font-serif text-[17px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
              {lead.title}
            </h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.07em]" style={{ color: "var(--app-ink-3)" }}>
              {lead.source} · {timeAgo(lead.published_at)}
            </p>
          </a>

          {/* The column — secondary stories as a tight ruled run. */}
          {rest.length > 0 && (
            <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
              {rest.map((h) => (
                <li
                  key={h.url}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "color-mix(in srgb, var(--app-border) 65%, transparent)" }}
                >
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3 px-4 py-2.5 transition hover:bg-[var(--app-bg-sunken)] sm:px-5"
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

          <p
            className="px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] sm:px-5"
            style={{ color: "var(--app-ink-3)", borderTop: "1px solid var(--app-border)" }}
          >
            Wire: Google News · Frederick County
          </p>
        </section>
        );
      })()}
      {/* (Scanner + News above and Police + Road work below all live inside the
          same "More civic feeds" disclosure opened above — the div stays open
          until after the advisories.) */}

      {/* The all-clear verdict lives ONCE, in the hero ("All clear across
          the county" + the sage live dot at the top). A second celebration
          card here repeated it AFTER the user had already scrolled past the
          tiles, scanner, and news — the verdict landing last, divorced from
          the headline. One verdict, one place; removed. */}

      {/* Police — kept as a quiet card with its required disclaimer.
          Not part of the active-sections loop because there's no
          feed to count from. */}
      <section
        id="police"
        className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
        style={{
          // Explicit side colors (not the borderColor shorthand) so the left
          // accent longhand below doesn't trip React's shorthand/longhand warn.
          borderTopColor: "var(--app-border)",
          borderRightColor: "var(--app-border)",
          borderBottomColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          borderLeftWidth: 3,
          borderLeftColor: "var(--app-cool)",
        }}
      >
        <header
          className="flex items-center gap-3 border-b px-4 py-2.5"
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
                background: "color-mix(in srgb, var(--app-cool) 10%, transparent)",
                color: "var(--app-cool)",
              }}
            >
              <Siren className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </span>
            Police &amp; safety
          </h2>
        </header>
        <div className="px-4 py-3">
          {/* The running blotter — recent police press releases from the
              City + County newsrooms, the one already featured up top
              excluded. Self-hides when the feeds carry no police items. */}
          {blotter.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                Recent releases
              </p>
              <PoliceBlotter items={blotter} now={nowMs} />
            </div>
          )}
          <div
            className={blotter.length > 0 ? "mt-3 space-y-2.5 border-t pt-3" : "space-y-2.5"}
            style={blotter.length > 0 ? { borderColor: "var(--app-border)" } : undefined}
          >
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Frederick PD also publishes the prior day&apos;s calls for service
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
              Calls for service are not confirmed crimes. They reflect
              requests for police response. Releases and the CFS map come
              from the City of Frederick &amp; Frederick County.
            </p>
          </div>
        </div>
      </section>

      {/* Road work & closures — the civic-press advisory lane (planned City/
          County closures + road work), a quiet standing card below Police.
          Self-hides when there's nothing recent. Distinct from the live MDOT
          traffic tile (accidents now) in the dashboard above. */}
      <AdvisoryCard items={advisories} now={nowMs} />
      </div>
      </CollapsibleSection>

      {/* By the numbers — county canon + live directory counts. Collapsed
          by DEFAULT: on a live-status page this is the largest block and pure
          static reference (zero live-"pulse" value), so it recedes behind a
          one-tap disclosure instead of making every visitor scroll an almanac
          to reach the footer. The choice persists per visitor (localStorage),
          and the internal links (/parks, /transit, /category/food, Carroll
          Creek) ship in the HTML, just display:none until expanded. */}
      <CollapsibleSection
        title="By the numbers · census + canon"
        storageKey="pulse-canon"
        defaultOpen={false}
      >
        <ul className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3 lg:grid-cols-4">
          <CanonTile
            icon={Users}
            value="285,464"
            label="Population"
            note="2023 ACS estimate"
            accent="var(--app-brand)"
          />
          <CanonTile
            icon={Square}
            value="663"
            unit="mi²"
            label="Land area"
            note="From the Maryland line to the Potomac"
            accent="var(--app-cool)"
          />
          <CanonTile
            icon={CalendarHeart}
            value="1748"
            label="Founded"
            note="Hessian fairs to Civil War crossroads"
            accent="var(--app-accent)"
          />
          <CanonTile
            icon={Building2}
            // Incorporated municipalities only (2 cities + 10 towns = 12).
            // MUNICIPALITIES also includes Urbana, which is an unincorporated
            // community, not a municipality — counting it gave a wrong "13."
            value={MUNICIPALITIES.filter((m) => m.type !== "unincorporated").length}
            label="Municipalities"
            note="From Brunswick to Burkittsville"
            accent="var(--app-brand-2)"
          />
          <CanonTile
            icon={Trees}
            value={parksCount.toLocaleString()}
            label="Parks + trails mapped"
            note="Public, free, in service"
            accent="var(--app-positive)"
            href="/parks"
          />
          <CanonTile
            icon={Utensils}
            value={restaurantsCount.toLocaleString()}
            label="Eat + drink mapped"
            note="Cafes, kitchens, taprooms, bakeries"
            accent="var(--app-brand)"
            href="/category/food"
          />
          <CanonTile
            icon={Bus}
            value={
              routesCount > 0
                ? routesCount.toLocaleString()
                : // eslint-disable-next-line no-restricted-syntax -- standalone no-data glyph, not prose
                  "—"
            }
            label="TransIT routes"
            note="County bus network, every variation"
            accent="var(--app-cool)"
            href="/transit"
          />
          <CanonTile
            icon={WavesIcon}
            value="1.4"
            unit="mi"
            label="Carroll Creek"
            note="Linear park, downtown spine"
            accent="var(--app-cool)"
            href="/places/carroll-creek-linear-park-frederick"
          />
          <CanonTile
            icon={Mountain}
            value="1,888"
            unit="ft"
            label="Catoctin Mountain"
            note="High point of the western ridge"
            accent="var(--app-ink-2)"
          />
        </ul>
      </CollapsibleSection>

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
          Informational only, not a substitute for 911 or official
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

/**
 * CanonTile — a single stat in the "By the numbers" grid. Big serif
 * number, small label, optional sub-line, optional unit suffix.
 * When `href` is set the whole tile becomes a tappable link to the
 * source surface (e.g. /transit, /parks). Otherwise it's a static
 * fact card. Same visual rhythm as the existing /pulse StatusTile
 * so the two grids feel like one family.
 */
function CanonTile({
  icon: Icon,
  value,
  unit,
  label,
  note,
  accent,
  href,
}: {
  icon: LucideIcon;
  value: string | number;
  unit?: string;
  label: string;
  note?: string;
  accent: string;
  href?: string;
}) {
  const Body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </div>
      <p className="mt-2 flex items-baseline gap-1 leading-none">
        <span
          className="font-serif text-[26px] font-semibold tabular-nums tracking-tight sm:text-[28px]"
          style={{ color: "var(--app-ink)" }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            {unit}
          </span>
        )}
      </p>
      <p
        className="mt-1 text-[12px] font-semibold leading-tight"
        style={{ color: "var(--app-ink-2)" }}
      >
        {label}
      </p>
      {note && (
        <p
          className="mt-0.5 text-[11px] leading-snug"
          style={{ color: "var(--app-ink-3)" }}
        >
          {note}
        </p>
      )}
    </>
  );
  const className =
    "tactile-interactive flex h-full flex-col rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition";
  const style = {
    borderColor: "var(--app-border)",
    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
  };
  return (
    <li>
      {href ? (
        <Link href={href} className={className} style={style}>
          {Body}
        </Link>
      ) : (
        <div className={className} style={style}>
          {Body}
        </div>
      )}
    </li>
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

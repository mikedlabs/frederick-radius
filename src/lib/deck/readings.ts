import "server-only";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { getNwsForecast } from "@/lib/integrations/nws";
import { getChartIncidentsFrederickResult, chartRoad } from "@/lib/integrations/mdot-chart";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";
import { getFcpsAlertsResult } from "@/lib/integrations/fcps";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getFrederickTransitRoutes } from "@/lib/integrations/transitFrederick";
import { getLiveVehiclesWithNextStopResult } from "@/lib/integrations/transitRealtime";
import { getMarcVehiclesResult } from "@/lib/integrations/marcVehicles";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { getLocalHeadlines } from "@/lib/integrations/news";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * The deck — Frederick County's live readings as a board of keys.
 *
 * Each key is one instrument. Closed, it shows the current reading. Opened,
 * it reveals the rows behind that reading in place, inside the key itself,
 * and offers the surface that owns the detail. There is no popup: the number
 * you tapped stays on screen with its evidence underneath it.
 *
 * Three rules keep this from becoming decoration:
 *
 * 1. NOTHING HERE IS DERIVED FROM POSTED HOURS. Verified-hours coverage is
 *    effectively zero (places-hours-refresh.json is empty), so an "N open now"
 *    key would read as a live instrument while reporting a hole in our data.
 *
 * 2. A SOURCE THAT DOES NOT ANSWER SAYS SO. The key stays on the board in an
 *    unavailable state instead of vanishing or showing a zero. "0 incidents"
 *    and "we could not reach MDOT" look identical on a number and mean
 *    opposite things.
 *
 * 3. A CALM READING STILL OWES AN EXPLANATION. When a key reads Clear, opening
 *    it says what was checked and came back empty, so "nothing to show" is
 *    never mistaken for "nothing was looked at".
 *
 * NOT joined, deliberately: Passio reports GTFS route ids ("6161") that match
 * none of the 36 Maryland Open Data route ids ("61", "65", …). Zero of the
 * live vehicles join. "6161" reads like route 61 doubled, and that guess is
 * exactly how a wrong route number ends up under a real arrival time, so bus
 * rows carry the stop and the ETA, both of which come straight from the feed.
 *
 * The shaping is a pure function over already-fetched results so every rule
 * above is unit-testable without touching the network.
 */

export type DeckIcon =
  | "bus"
  | "train"
  | "car"
  | "plug"
  | "cloud"
  | "waves"
  | "school"
  | "wrench"
  | "calendar"
  | "newspaper";

/** A single readable state on a closed key. Two elements, never more. */
export type DeckFace = {
  /** Short enough to stay one line at display size: "10", "Clear", "2.4 ft". */
  value: string;
  /** What the value is: "buses moving", "no incidents". */
  label: string;
};

/** One line of evidence revealed when a key opens. */
export type DeckDetailRow = {
  lead: string;
  /** The figure or time on the right. Optional: some rows are just a name. */
  trail?: string;
};

export type DeckKeyStatus = "ok" | "unavailable";

export type DeckKey = {
  id: string;
  /** The instrument's name, shown in the open header. */
  name: string;
  href: string;
  /** What pressing the link inside the open key does, in plain words. */
  hrefLabel: string;
  icon: DeckIcon;
  /** A brand token. Amber is reserved for a real caution reading. */
  accent: string;
  status: DeckKeyStatus;
  /** True when the feed behind this key updates continuously, which is what
   *  the pulsing indicator claims. A daily snapshot must not claim it. */
  live: boolean;
  faces: DeckFace[];
  /** The rows revealed on open. May be empty when the reading is calm. */
  detail: DeckDetailRow[];
  /** Shown instead of rows when there are none. Says what was checked. */
  note?: string;
  /** Named on the open key, never invented. */
  source: string;
};

const COOL = "var(--app-cool)";
const FOREST = "var(--app-brand-2)";
const AMBER = "var(--app-amber)";
const BRICK = "var(--app-brand)";

const DETAIL_MAX = 5;

export type DeckInputs = {
  buses: { available: boolean; stops: Array<{ name: string; etaEpoch?: number }> } | null;
  routes: number | null;
  trains: { available: boolean; count: number; labels: string[] } | null;
  traffic: { available: boolean; rows: DeckDetailRow[] } | null;
  power: {
    available: boolean;
    out: number;
    munis: Array<{ area: string; out: number }>;
  } | null;
  weather: {
    available: boolean;
    alerts: string[];
    outlook: DeckDetailRow[];
  } | null;
  water: Array<{ name: string; feet: number }> | null;
  schools: { available: boolean; alerts: string[] } | null;
  reports: DeckDetailRow[] | null;
  events: { today: number; week: number; rows: DeckDetailRow[] } | null;
  news: DeckDetailRow[] | null;
};

const UNAVAILABLE: DeckFace = { value: "—", label: "not reporting" };

type KeyBase = Omit<DeckKey, "status" | "faces" | "detail" | "note">;

function key(
  base: KeyBase,
  built: { faces: DeckFace[]; detail?: DeckDetailRow[]; note?: string } | null,
): DeckKey {
  if (!built || built.faces.length === 0) {
    return {
      ...base,
      status: "unavailable",
      faces: [UNAVAILABLE],
      detail: [],
      note: `${base.source} did not answer this read. Nothing here is a zero, it is a gap.`,
    };
  }
  return {
    ...base,
    status: "ok",
    faces: built.faces,
    detail: (built.detail ?? []).slice(0, DETAIL_MAX),
    note: built.note,
  };
}

/** Minutes until an epoch, floored, or null when it has passed or is absent. */
export function minutesUntil(etaEpoch: number | undefined, now: Date): number | null {
  if (!etaEpoch || !Number.isFinite(etaEpoch)) return null;
  const minutes = Math.round((etaEpoch * 1000 - now.getTime()) / 60_000);
  return minutes >= 0 && minutes <= 90 ? minutes : null;
}

function etaLabel(etaEpoch: number | undefined, now: Date): string | undefined {
  const minutes = minutesUntil(etaEpoch, now);
  if (minutes === null) return undefined;
  return minutes <= 0 ? "arriving" : `${minutes} min`;
}

function titleCaseGauge(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\b(Rd|Blvd|Ln|St|Md)\b/g, (word) => word.toUpperCase())
    .trim();
}

/**
 * A USGS station name is a survey address, not a label: "POTOMAC RIVER AT
 * BURKITTSVILLE RD AT BRUNSWICK, MD". A key face has room for the water and
 * the town, so take the first segment and the last one and drop the survey
 * detail in between. The type word ("River", "Creek") is the first thing cut
 * when the result still will not fit.
 */
export function shortGaugeName(raw: string): string {
  const trimmed = raw.replace(/,\s*MD\.?\s*$/i, "").trim();
  const parts = trimmed
    .split(/\s+(?:AT|NEAR|NR|ABOVE|BELOW|AB|BL)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const body = titleCaseGauge(parts[0] ?? trimmed);
  if (parts.length < 2) return body;
  const place = titleCaseGauge(parts[parts.length - 1]);
  const full = `${body} at ${place}`;
  if (full.length <= 22) return full;
  return `${body.replace(/\s+(River|Creek|Run|Branch)$/i, "")} at ${place}`;
}

/**
 * Shape measured readings into keys.
 *
 * A count of zero is a real reading and gets said in words ("Clear", "All on")
 * because a bare 0 on a key reads as a failure. A source that did not answer
 * gets the unavailable face instead, which is the distinction the whole board
 * rests on.
 */
export function buildDeckKeys(input: DeckInputs, now: Date = new Date()): DeckKey[] {
  const buses = input.buses;
  const busCount = buses?.stops.length ?? 0;
  const trains = input.trains;
  const traffic = input.traffic;
  const power = input.power;
  const weather = input.weather;
  const water = input.water;
  const schools = input.schools;

  return [
    key(
      {
        id: "buses",
        name: "Buses",
        href: "/transit",
        hrefLabel: "Open transit",
        icon: "bus",
        accent: COOL,
        live: true,
        source: "TransIT Frederick (Passio)",
      },
      buses?.available
        ? {
            faces: [
              busCount > 0
                ? { value: String(busCount), label: busCount === 1 ? "bus moving" : "buses moving" }
                : { value: "None", label: "running" },
              ...(input.routes ? [{ value: String(input.routes), label: "routes" }] : []),
            ],
            detail: buses.stops
              .map((stop) => ({ lead: stop.name, trail: etaLabel(stop.etaEpoch, now) }))
              .sort((a, b) => (a.trail ? 0 : 1) - (b.trail ? 0 : 1)),
            note:
              busCount === 0
                ? "No buses are reporting a position. Outside service hours this is normal."
                : undefined,
          }
        : null,
    ),
    key(
      {
        id: "trains",
        name: "Trains",
        href: "/transit",
        hrefLabel: "Open transit",
        icon: "train",
        accent: COOL,
        live: true,
        source: "MARC Brunswick Line",
      },
      trains?.available
        ? {
            faces: [
              trains.count > 0
                ? {
                    value: String(trains.count),
                    label: trains.count === 1 ? "train on the line" : "trains on the line",
                  }
                : { value: "None", label: "on the line" },
            ],
            detail: trains.labels.map((label) => ({ lead: label })),
            note:
              trains.count === 0
                ? "No Brunswick Line trains are reporting a position right now."
                : undefined,
          }
        : null,
    ),
    key(
      {
        id: "traffic",
        name: "Roads",
        href: "/pulse?open=traffic",
        hrefLabel: "Open road conditions",
        icon: "car",
        // A lit amber key means something is actually happening on the road.
        accent: traffic?.available && traffic.rows.length > 0 ? AMBER : COOL,
        live: true,
        source: "MDOT CHART",
      },
      traffic?.available
        ? {
            faces: [
              traffic.rows.length > 0
                ? {
                    value: String(traffic.rows.length),
                    label: traffic.rows.length === 1 ? "incident" : "incidents",
                  }
                : { value: "Clear", label: "no incidents" },
            ],
            detail: traffic.rows,
            note:
              traffic.rows.length === 0
                ? "MDOT CHART is reporting no open incidents in Frederick County."
                : undefined,
          }
        : null,
    ),
    key(
      {
        id: "power",
        name: "Power",
        href: "/pulse?open=power",
        hrefLabel: "Open outage detail",
        icon: "plug",
        accent: power?.available && power.out > 0 ? AMBER : COOL,
        live: true,
        source: "Potomac Edison",
      },
      power?.available
        ? {
            faces: [
              power.out > 0
                ? { value: power.out.toLocaleString(), label: "customers out" }
                : { value: "All on", label: "no outages" },
              { value: String(power.munis.length), label: "towns watched" },
            ],
            detail: power.munis
              .filter((muni) => muni.out > 0)
              .sort((a, b) => b.out - a.out)
              .map((muni) => ({ lead: muni.area, trail: `${muni.out.toLocaleString()} out` })),
            note:
              power.out === 0
                ? `No outages reported across ${power.munis.length} towns watched.`
                : undefined,
          }
        : null,
    ),
    key(
      {
        id: "weather",
        name: "Weather",
        href: "/pulse?open=weather",
        hrefLabel: "Open conditions",
        icon: "cloud",
        accent: weather?.available && weather.alerts.length > 0 ? AMBER : COOL,
        live: true,
        source: "National Weather Service",
      },
      weather?.available
        ? {
            faces: [
              weather.alerts.length > 0
                ? {
                    value: String(weather.alerts.length),
                    label: weather.alerts.length === 1 ? "active alert" : "active alerts",
                  }
                : { value: "Clear", label: "no alerts" },
            ],
            // A calm sky still has a forecast worth reading, so the open key
            // shows the outlook rather than an empty panel.
            detail:
              weather.alerts.length > 0
                ? weather.alerts.map((alert) => ({ lead: alert }))
                : weather.outlook,
            note:
              weather.alerts.length === 0 && weather.outlook.length === 0
                ? "No watches or warnings are in effect for Frederick County."
                : undefined,
          }
        : null,
    ),
    key(
      {
        id: "water",
        name: "Creeks",
        href: "/rivers",
        hrefLabel: "Open river gauges",
        icon: "waves",
        accent: FOREST,
        live: true,
        source: "USGS",
      },
      water && water.length > 0
        ? {
            faces: [
              { value: String(water.length), label: "gauges reporting" },
              ...(water[0]
                ? [
                    {
                      value: `${[...water].sort((a, b) => b.feet - a.feet)[0].feet.toFixed(1)} ft`,
                      label: shortGaugeName([...water].sort((a, b) => b.feet - a.feet)[0].name),
                    },
                  ]
                : []),
            ],
            detail: [...water]
              .sort((a, b) => b.feet - a.feet)
              .map((site) => ({
                lead: shortGaugeName(site.name),
                trail: `${site.feet.toFixed(1)} ft`,
              })),
          }
        : null,
    ),
    key(
      {
        id: "schools",
        name: "Schools",
        href: "/pulse?open=schools",
        hrefLabel: "Open school notices",
        icon: "school",
        accent: schools?.available && schools.alerts.length > 0 ? AMBER : COOL,
        live: false,
        source: "FCPS",
      },
      schools?.available
        ? {
            faces: [
              schools.alerts.length > 0
                ? {
                    value: String(schools.alerts.length),
                    label:
                      schools.alerts.length === 1 ? "closure or delay" : "closures and delays",
                  }
                  // Not "schools are open": out of session and nothing posted
                  // look the same from this feed, and only one is a promise.
                : { value: "None", label: "posted" },
            ],
            detail: schools.alerts.map((alert) => ({ lead: alert })),
            note:
              schools.alerts.length === 0
                ? "FCPS has posted no closures or delays. Out of session looks the same from this feed."
                : undefined,
          }
        : null,
    ),
    key(
      {
        id: "reports",
        name: "311",
        href: "/pulse?open=fixit",
        hrefLabel: "Open reported issues",
        icon: "wrench",
        accent: COOL,
        live: false,
        source: "SeeClickFix",
      },
      input.reports && input.reports.length > 0
        ? {
            faces: [{ value: String(input.reports.length), label: "open reports" }],
            detail: input.reports,
          }
        : null,
    ),
    key(
      {
        id: "events",
        name: "Events",
        href: "/events",
        hrefLabel: "Open the calendar",
        icon: "calendar",
        accent: BRICK,
        live: false,
        source: "Frederick Radius",
      },
      input.events
        ? {
            faces: [
              input.events.today > 0
                ? { value: String(input.events.today), label: "on today" }
                : { value: "None", label: "left today" },
              { value: String(input.events.week), label: "in seven days" },
            ],
            detail: input.events.rows,
            note:
              input.events.rows.length === 0
                ? "Nothing else is scheduled today. The seven-day count is on the second face."
                : undefined,
          }
        : null,
    ),
    key(
      {
        id: "news",
        name: "News",
        href: "/pulse?open=news",
        hrefLabel: "Open local headlines",
        icon: "newspaper",
        accent: COOL,
        live: false,
        source: "Local newsrooms",
      },
      input.news && input.news.length > 0
        ? {
            faces: [{ value: String(input.news.length), label: "local headlines" }],
            detail: input.news,
          }
        : null,
    ),
  ];
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Clamp a feed's own prose to one readable line on a narrow key. */
function clamp(value: string, max = 58): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 24 ? cut.slice(0, space) : cut).replace(/[,;:·\-\s]+$/, "")}…`;
}

function clockLabel(iso: string, now: Date): string | undefined {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return undefined;
  const sameDay =
    new Date(time).toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    ...(sameDay ? {} : { weekday: "short" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
}

const T = 6_000;

/** Read every instrument at once. Each is independently timeout-guarded and
 *  fail-soft to null, which the shaping turns into an honest unavailable key
 *  rather than a zero. */
export async function getDeckKeys(now: Date = new Date()): Promise<DeckKey[]> {
  const [buses, routes, trains, traffic, power, alerts, forecast, water, schools, reports, events, news] =
    await Promise.all([
      withTimeout(
        getLiveVehiclesWithNextStopResult().then((r) => ({
          available: r.available,
          stops: r.data.map((vehicle) => ({
            name: vehicle.nextStop?.name ?? "Position only, next stop unresolved",
            etaEpoch: vehicle.nextStop?.etaEpoch,
          })),
        })),
        T,
        null,
      ),
      withTimeout(getFrederickTransitRoutes().then((r) => r.length), T, null),
      withTimeout(
        getMarcVehiclesResult().then((r) => ({
          available: r.available,
          count: r.data.length,
          // tripId is the GTFS marker ("Train492"); split the digits out so a
          // row reads as a train number rather than a feed identifier.
          labels: r.data.map((train) => {
            const number = /(\d+)/.exec(train.tripId ?? "")?.[1];
            return number ? `Train ${number} · ${train.line}` : train.line;
          }),
        })),
        T,
        null,
      ),
      withTimeout(
        getChartIncidentsFrederickResult().then((r) => ({
          available: r.available,
          rows: r.data.map((incident) => ({
            lead: clamp(chartRoad(incident) || incident.location || incident.description),
            trail: incident.type,
          })),
        })),
        T,
        null,
      ),
      withTimeout(
        getFrederickOutagesResult().then((r) => ({
          available: r.available,
          out: r.data.total_out,
          munis: r.data.munis.map((muni) => ({ area: muni.area, out: muni.customers_out })),
        })),
        T,
        null,
      ),
      withTimeout(
        getNwsAlertsResult().then((r) => ({
          available: r.available,
          alerts: r.alerts.map((alert) => clamp(alert.event)),
        })),
        T,
        null,
      ),
      withTimeout(getNwsForecast(FREDERICK_CENTER), T, null),
      withTimeout(
        getFrederickWaterSites().then((sites) =>
          sites
            .filter(
              (site): site is typeof site & { gageHeightFt: number } =>
                typeof site.gageHeightFt === "number" && Number.isFinite(site.gageHeightFt),
            )
            .map((site) => ({ name: site.name, feet: site.gageHeightFt })),
        ),
        T,
        null,
      ),
      withTimeout(
        getFcpsAlertsResult().then((r) => ({
          available: r.available,
          alerts: r.data.map((alert) => clamp(alert.title || alert.description || "Notice")),
        })),
        T,
        null,
      ),
      withTimeout(
        getFixItIssues(20).then((issues) =>
          issues.map((issue) => ({
            lead: clamp(issue.summary || issue.category),
            trail: issue.category && issue.category !== issue.summary ? clamp(issue.category, 18) : undefined,
          })),
        ),
        T,
        null,
      ),
      withTimeout(
        assembleUnifiedEvents(now).then(({ publicEvents }) => {
          const weekEnd = now.getTime() + 7 * 86_400_000;
          const today = publicEvents
            .filter((event) => isEventToday(event.starts_at, now) && !isEventEnded(event, now))
            .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
          const upcoming = publicEvents
            .filter((event) => {
              const start = Date.parse(event.starts_at);
              return Number.isFinite(start) && start >= now.getTime() && start <= weekEnd;
            })
            .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
          // Today first; when today is spent, the panel shows what is next
          // rather than going blank on a key that still reads a week count.
          const rows = (today.length > 0 ? today : upcoming).map((event) => ({
            lead: clamp(event.title),
            trail: clockLabel(event.starts_at, now),
          }));
          return { today: today.length, week: upcoming.length, rows };
        }),
        T,
        null,
      ),
      withTimeout(
        getLocalHeadlines().then((headlines) =>
          headlines.map((headline) => ({
            lead: clamp(headline.title),
            trail: clamp(headline.source, 16),
          })),
        ),
        T,
        null,
      ),
    ]);

  // NWS shortForecast runs long ("isolated showers and thunderstorms then
  // scattered showers and thunderstorms"). Clamp it so a row stays one line.
  const outlook: DeckDetailRow[] = (forecast?.daily ?? []).slice(0, 4).map((period) => ({
    lead: clamp(
      `${period.name ?? "Next"}${period.shortForecast ? `, ${period.shortForecast.toLowerCase()}` : ""}`,
      46,
    ),
    trail: `${period.temperature}°`,
  }));

  return buildDeckKeys(
    {
      buses,
      routes,
      trains,
      traffic,
      power,
      weather: alerts ? { ...alerts, outlook } : null,
      water,
      schools,
      reports,
      events,
      news,
    },
    now,
  );
}

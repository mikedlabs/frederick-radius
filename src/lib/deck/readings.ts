import "server-only";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { getChartIncidentsFrederickResult } from "@/lib/integrations/mdot-chart";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";
import { getFcpsAlertsResult } from "@/lib/integrations/fcps";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getFrederickTransitRoutes } from "@/lib/integrations/transitFrederick";
import { getLiveVehiclesResult } from "@/lib/integrations/transitRealtime";
import { getMarcVehiclesResult } from "@/lib/integrations/marcVehicles";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { getLocalHeadlines } from "@/lib/integrations/news";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";

/**
 * The deck — Frederick County's live readings as a board of keys.
 *
 * Every key is one instrument: an icon, the current reading, and a press that
 * opens the surface behind it. Keys with more than one honest reading rotate
 * between them rather than crowding both onto one face.
 *
 * Two rules keep this from becoming decoration:
 *
 * 1. NOTHING HERE IS DERIVED FROM POSTED HOURS. Verified-hours coverage is
 *    effectively zero (places-hours-refresh.json is empty), so an "N open now"
 *    key would read as a live instrument while reporting a hole in our data.
 *    Every reading below comes from a feed that was measured answering.
 *
 * 2. A SOURCE THAT DOES NOT ANSWER SAYS SO. The key stays on the board in an
 *    unavailable state instead of vanishing or, far worse, showing a zero.
 *    "0 incidents" and "we could not reach MDOT" look identical on a number
 *    and mean opposite things.
 *
 * The shaping is a pure function over already-fetched results so the honesty
 * rules are unit-testable without touching the network.
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

/** A single readable state on a key. Two elements, never more: the value
 *  carries the fact and the label says what it counts. */
export type DeckFace = {
  /** Short enough to stay one line at display size: "10", "Clear", "2.4 ft". */
  value: string;
  /** What the value is: "buses moving", "no incidents". */
  label: string;
};

export type DeckKeyStatus = "ok" | "unavailable";

export type DeckKey = {
  id: string;
  /** The instrument's name, shown when a key has nothing else to say. */
  name: string;
  href: string;
  icon: DeckIcon;
  /** A brand token. Amber is reserved for a real caution reading. */
  accent: string;
  status: DeckKeyStatus;
  /** True when the feed behind this key updates continuously, which is what
   *  the pulsing indicator claims. A daily snapshot must not claim it. */
  live: boolean;
  faces: DeckFace[];
  /** Named on the key's detail surface, never invented. */
  source: string;
};

const COOL = "var(--app-cool)";
const FOREST = "var(--app-brand-2)";
const AMBER = "var(--app-amber)";
const BRICK = "var(--app-brand)";

/** The raw shape each key needs, kept separate from fetching so the rules
 *  below can be tested with plain objects. */
export type DeckInputs = {
  buses: { available: boolean; count: number } | null;
  routes: number | null;
  trains: { available: boolean; count: number } | null;
  traffic: { available: boolean; count: number } | null;
  power: { available: boolean; out: number; munis: number } | null;
  weather: { available: boolean; count: number } | null;
  water: { sites: number; highest: { name: string; reading: string } | null } | null;
  schools: { available: boolean; count: number } | null;
  reports: number | null;
  events: { today: number; week: number } | null;
  news: number | null;
};

const UNAVAILABLE: DeckFace = { value: "—", label: "not reporting" };

function key(
  base: Omit<DeckKey, "status" | "faces"> ,
  faces: DeckFace[] | null,
): DeckKey {
  return faces && faces.length > 0
    ? { ...base, status: "ok", faces }
    : { ...base, status: "unavailable", faces: [UNAVAILABLE] };
}

/**
 * Shape measured readings into keys.
 *
 * A count of zero is a real reading and gets said in words ("Clear", "All on")
 * because a bare 0 on a lit key reads as a failure. A source that did not
 * answer gets the unavailable face instead, which is the distinction the whole
 * board rests on.
 */
export function buildDeckKeys(input: DeckInputs): DeckKey[] {
  const buses = input.buses;
  const busFaces: DeckFace[] | null = buses?.available
    ? [
        buses.count > 0
          ? { value: String(buses.count), label: buses.count === 1 ? "bus moving" : "buses moving" }
          : { value: "None", label: "running" },
        ...(input.routes ? [{ value: String(input.routes), label: "routes" }] : []),
      ]
    : null;

  const trains = input.trains;
  const trafficCount = input.traffic?.available ? input.traffic.count : null;
  const power = input.power;
  const weatherCount = input.weather?.available ? input.weather.count : null;
  const water = input.water;
  const schools = input.schools;

  return [
    key(
      { id: "buses", name: "Buses", href: "/transit", icon: "bus", accent: COOL, live: true, source: "TransIT Frederick" },
      busFaces,
    ),
    key(
      { id: "trains", name: "Trains", href: "/transit", icon: "train", accent: COOL, live: true, source: "MARC Brunswick Line" },
      trains?.available
        ? [
            trains.count > 0
              ? { value: String(trains.count), label: trains.count === 1 ? "train on the line" : "trains on the line" }
              : { value: "None", label: "on the line" },
          ]
        : null,
    ),
    key(
      {
        id: "traffic",
        name: "Roads",
        href: "/pulse?open=traffic",
        icon: "car",
        // A lit amber key means something is actually happening on the road.
        accent: trafficCount && trafficCount > 0 ? AMBER : COOL,
        live: true,
        source: "MDOT CHART",
      },
      trafficCount === null
        ? null
        : [
            trafficCount > 0
              ? { value: String(trafficCount), label: trafficCount === 1 ? "incident" : "incidents" }
              : { value: "Clear", label: "no incidents" },
          ],
    ),
    key(
      {
        id: "power",
        name: "Power",
        href: "/pulse?open=power",
        icon: "plug",
        accent: power?.available && power.out > 0 ? AMBER : COOL,
        live: true,
        source: "Potomac Edison",
      },
      power?.available
        ? [
            power.out > 0
              ? { value: power.out.toLocaleString(), label: "customers out" }
              : { value: "All on", label: "no outages" },
            { value: String(power.munis), label: "towns watched" },
          ]
        : null,
    ),
    key(
      {
        id: "weather",
        name: "Weather",
        href: "/pulse?open=weather",
        icon: "cloud",
        accent: weatherCount && weatherCount > 0 ? AMBER : COOL,
        live: true,
        source: "National Weather Service",
      },
      weatherCount === null
        ? null
        : [
            weatherCount > 0
              ? { value: String(weatherCount), label: weatherCount === 1 ? "active alert" : "active alerts" }
              : { value: "Clear", label: "no alerts" },
          ],
    ),
    key(
      { id: "water", name: "Creeks", href: "/rivers", icon: "waves", accent: FOREST, live: true, source: "USGS" },
      water && water.sites > 0
        ? [
            { value: String(water.sites), label: "gauges reporting" },
            ...(water.highest
              ? [{ value: water.highest.reading, label: water.highest.name }]
              : []),
          ]
        : null,
    ),
    key(
      {
        id: "schools",
        name: "Schools",
        href: "/pulse?open=schools",
        icon: "school",
        accent: schools?.available && schools.count > 0 ? AMBER : COOL,
        live: false,
        source: "FCPS",
      },
      schools?.available
        ? [
            schools.count > 0
              ? { value: String(schools.count), label: schools.count === 1 ? "closure or delay" : "closures and delays" }
              // Not "schools are open": out of session and nothing posted look
              // the same from this feed, and only one of them is a promise.
              : { value: "None", label: "posted" },
          ]
        : null,
    ),
    key(
      { id: "reports", name: "311", href: "/pulse?open=fixit", icon: "wrench", accent: COOL, live: false, source: "SeeClickFix" },
      input.reports != null && input.reports > 0
        ? [{ value: String(input.reports), label: "open reports" }]
        : null,
    ),
    key(
      { id: "events", name: "Events", href: "/events", icon: "calendar", accent: BRICK, live: false, source: "Frederick Radius" },
      input.events
        ? [
            input.events.today > 0
              ? { value: String(input.events.today), label: "on today" }
              : { value: "None", label: "left today" },
            { value: String(input.events.week), label: "in seven days" },
          ]
        : null,
    ),
    key(
      { id: "news", name: "News", href: "/pulse?open=news", icon: "newspaper", accent: COOL, live: false, source: "Local newsrooms" },
      input.news != null && input.news > 0
        ? [{ value: String(input.news), label: "local headlines" }]
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

/** The tallest gauge reading, so the water key can name a creek rather than
 *  only counting instruments. Sites without a usable stage are skipped. */
function highestGauge(
  sites: Array<{ name?: string; gageHeightFt?: number | null }>,
): { name: string; reading: string } | null {
  let best: { name: string; height: number } | null = null;
  for (const site of sites) {
    const height = site.gageHeightFt;
    if (typeof height !== "number" || !Number.isFinite(height)) continue;
    if (!site.name) continue;
    if (!best || height > best.height) best = { name: site.name, height };
  }
  return best
    ? { name: shortGaugeName(best.name), reading: `${best.height.toFixed(1)} ft` }
    : null;
}

const T = 6_000;

/** Read every instrument at once. Each is independently timeout-guarded and
 *  fail-soft to null, which the shaping turns into an honest unavailable key
 *  rather than a zero. */
export async function getDeckKeys(now: Date = new Date()): Promise<DeckKey[]> {
  const [buses, routes, trains, traffic, power, weather, water, schools, reports, events, news] =
    await Promise.all([
      withTimeout(
        getLiveVehiclesResult().then((r) => ({ available: r.available, count: r.data.length })),
        T,
        null,
      ),
      withTimeout(getFrederickTransitRoutes().then((r) => r.length), T, null),
      withTimeout(
        getMarcVehiclesResult().then((r) => ({ available: r.available, count: r.data.length })),
        T,
        null,
      ),
      withTimeout(
        getChartIncidentsFrederickResult().then((r) => ({ available: r.available, count: r.data.length })),
        T,
        null,
      ),
      withTimeout(
        getFrederickOutagesResult().then((r) => ({
          available: r.available,
          out: r.data.total_out,
          munis: r.data.munis.length,
        })),
        T,
        null,
      ),
      withTimeout(
        getNwsAlertsResult().then((r) => ({ available: r.available, count: r.alerts.length })),
        T,
        null,
      ),
      withTimeout(
        getFrederickWaterSites().then((sites) => ({
          sites: sites.length,
          highest: highestGauge(sites),
        })),
        T,
        null,
      ),
      withTimeout(
        getFcpsAlertsResult().then((r) => ({ available: r.available, count: r.data.length })),
        T,
        null,
      ),
      withTimeout(getFixItIssues(20).then((r) => r.length), T, null),
      withTimeout(
        assembleUnifiedEvents(now).then(({ publicEvents }) => {
          const weekEnd = now.getTime() + 7 * 86_400_000;
          return {
            today: publicEvents.filter(
              (event) => isEventToday(event.starts_at, now) && !isEventEnded(event, now),
            ).length,
            week: publicEvents.filter((event) => {
              const start = Date.parse(event.starts_at);
              return Number.isFinite(start) && start >= now.getTime() && start <= weekEnd;
            }).length,
          };
        }),
        T,
        null,
      ),
      withTimeout(getLocalHeadlines().then((r) => r.length), T, null),
    ]);

  return buildDeckKeys({
    buses,
    routes,
    trains,
    traffic,
    power,
    weather,
    water,
    schools,
    reports,
    events,
    news,
  });
}

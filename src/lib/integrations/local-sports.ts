import { unstable_cache } from "next/cache";
import { XMLParser } from "fast-xml-parser";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";
import type {
  LocalSportsTeamId,
  SportsGame,
  SportsGameState,
} from "@/lib/sports/types";

const FETCH_TIMEOUT_MS = 10_000;
const FCC_RSS_URL = "https://www.fccathletics.com/composite?print=rss";

type SidearmSite = {
  id: Exclude<LocalSportsTeamId, "fcc">;
  origin: string;
  teamName: string;
  teamNickname: string;
  calendarUrl: string;
};

const SIDEARM_SITES: SidearmSite[] = [
  {
    id: "hood",
    origin: "https://hoodathletics.com",
    teamName: "Hood College",
    teamNickname: "Blazers",
    calendarUrl: "https://hoodathletics.com/calendar",
  },
  {
    id: "mount",
    origin: "https://mountathletics.com",
    teamName: "Mount St. Mary's",
    teamNickname: "Mountaineers",
    calendarUrl: "https://mountathletics.com/calendar",
  },
];

type SidearmLink = { url?: string | null };
type SidearmEvent = {
  id?: number | string;
  date?: string;
  time?: string;
  location?: string;
  location_indicator?: string;
  status?: string;
  noplay_text?: string | null;
  sport?: { title?: string };
  opponent?: { title?: string; prefix?: string | null };
  media?: {
    video?: SidearmLink | null;
    stats?: SidearmLink | null;
    tickets?: SidearmLink | null;
  };
  result?: {
    status?: string | null;
    team_score?: string | number | null;
    opponent_score?: string | number | null;
    recap?: SidearmLink | null;
  };
  facility?: { title?: string } | null;
};
type SidearmDay = { events?: SidearmEvent[] | null };

function absoluteUrl(origin: string, value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value, origin).toString();
  } catch {
    return null;
  }
}

function sidearmState(event: SidearmEvent): SportsGameState {
  const note = `${event.noplay_text ?? ""} ${event.status ?? ""}`.toLowerCase();
  if (note.includes("cancel")) return "cancelled";
  if (note.includes("postpon") || note.includes("suspend")) return "postponed";
  if (["W", "L", "T"].includes(event.result?.status ?? "")) return "final";
  return "scheduled";
}

function sidearmStart(event: SidearmEvent): { iso: string; tba: boolean } | null {
  const match = event.date?.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  const hasPublishedTime = Boolean(event.time?.trim());
  const hour = hasPublishedTime ? Number(match[4]) : 12;
  const minute = hasPublishedTime ? Number(match[5]) : 0;
  return {
    iso: easternWallToUtcISO(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      hour,
      minute,
      Number(match[6] ?? 0),
    ),
    tba: !hasPublishedTime,
  };
}

function scoreText(value: string | number | null | undefined): string | null {
  if (typeof value === "number") return String(value);
  const text = value?.trim();
  return text || null;
}

/** Normalize SIDEARM's first-party composite-calendar response. */
export function normalizeSidearmSports(
  raw: unknown,
  site: SidearmSite,
  verifiedAt = new Date().toISOString(),
): SportsGame[] {
  if (!Array.isArray(raw)) return [];
  const games: SportsGame[] = [];

  for (const day of raw as SidearmDay[]) {
    for (const event of day.events ?? []) {
      const start = sidearmStart(event);
      const opponent = event.opponent?.title?.trim();
      if (!start || !event.id || !opponent) continue;
      const indicator = event.location_indicator?.toUpperCase();
      const homeAway =
        indicator === "H" ? "home" : indicator === "A" ? "away" : "neutral";
      const result = event.result?.status;

      games.push({
        id: `${site.id}-${event.id}`,
        teamId: site.id,
        teamName: site.teamName,
        teamNickname: site.teamNickname,
        sport: event.sport?.title?.trim() || "Athletics",
        startsAt: start.iso,
        timeTba: start.tba,
        homeAway,
        opponent: `${event.opponent?.prefix?.trim() ?? ""} ${opponent}`.trim(),
        venue: event.facility?.title?.trim() || null,
        location: event.location?.trim() || null,
        state: sidearmState(event),
        result: result === "W" || result === "L" || result === "T" ? result : null,
        teamScore: scoreText(event.result?.team_score),
        opponentScore: scoreText(event.result?.opponent_score),
        sourceUrl: site.calendarUrl,
        watchUrl: absoluteUrl(site.origin, event.media?.video?.url),
        statsUrl: absoluteUrl(site.origin, event.media?.stats?.url),
        // Never turn an away-game listing into a local ticket sale.
        ticketsUrl:
          homeAway === "home"
            ? absoluteUrl(site.origin, event.media?.tickets?.url)
            : null,
        recapUrl: absoluteUrl(site.origin, event.result?.recap?.url),
        verifiedAt,
      });
    }
  }

  return games;
}

type FccRssItem = {
  title?: string;
  link?: string;
  description?: string;
  category?: string;
  pubDate?: string;
  guid?: string;
  "dc:date"?: string;
  "ps:score"?: string;
  "ps:opponent"?: string;
};

function fccState(item: FccRssItem): SportsGameState {
  const text = `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("postpon")) return "postponed";
  return item["ps:score"]?.trim() ? "final" : "scheduled";
}

function fccResult(score: string | undefined): {
  result: "W" | "L" | "T" | null;
  teamScore: string | null;
  opponentScore: string | null;
} {
  const text = score?.trim() ?? "";
  const result = text.match(/\b([WLT])\b/i)?.[1]?.toUpperCase();
  const numbers = text.match(/(\d+)\s*-\s*(\d+)/);
  return {
    result: result === "W" || result === "L" || result === "T" ? result : null,
    teamScore: numbers?.[1] ?? null,
    opponentScore: numbers?.[2] ?? null,
  };
}

function fccStart(item: FccRssItem): { iso: string; tba: boolean } | null {
  const startsAt = item["dc:date"] || item.pubDate;
  const start = startsAt ? new Date(startsAt) : null;
  if (!start || !Number.isFinite(start.getTime())) return null;

  // PrestoSports gives untimed games a generated timestamp down to the
  // second, even though its own description deliberately omits "at 5:00 PM".
  // Treat the first-party description as the time signal so that timestamp
  // never leaks into Radius as a made-up tipoff.
  const hasPublishedTime =
    /\bat\s+\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(
      item.description ?? "",
    );
  if (hasPublishedTime) {
    return { iso: start.toISOString(), tba: false };
  }

  const date = easternParts(start);
  return {
    iso: easternWallToUtcISO(date.year, date.month, date.day, 12, 0, 0),
    tba: true,
  };
}

/** Normalize Frederick Community College's official PrestoSports RSS feed. */
export function normalizeFccSportsRss(
  xml: string,
  verifiedAt = new Date().toISOString(),
): SportsGame[] {
  if (!xml.trim()) return [];
  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: false,
      trimValues: true,
      isArray: (_name, path) => path === "rss.channel.item",
    }).parse(xml);
  } catch {
    return [];
  }
  const channel = (parsed as { rss?: { channel?: { item?: FccRssItem[] } } }).rss
    ?.channel;
  const items = Array.isArray(channel?.item) ? channel.item : [];

  return items.flatMap((item, index): SportsGame[] => {
    const start = fccStart(item);
    const rawOpponent = item["ps:opponent"]?.trim();
    if (!start || !rawOpponent) return [];

    const away = /^at\s+/i.test(rawOpponent);
    const neutral = /^vs\.?\s+/i.test(rawOpponent);
    const opponent = rawOpponent
      .replace(/^at\s+/i, "")
      .replace(/^vs\.?\s+/i, "")
      .replace(/\s+@\s+.+$/i, "")
      .trim();
    const score = fccResult(item["ps:score"]);
    const sourceUrl =
      item.link?.trim() ||
      item.guid?.trim() ||
      "https://www.fccathletics.com/composite";

    return [
      {
        id: `fcc-${sourceUrl.split("#").at(-1) || index}`,
        teamId: "fcc",
        teamName: "Frederick Community College",
        teamNickname: "Cougars",
        sport: item.category?.trim() || "Athletics",
        startsAt: start.iso,
        timeTba: start.tba,
        homeAway: away ? "away" : neutral ? "neutral" : "home",
        opponent: opponent || "Opponent",
        venue: away ? null : "Frederick Community College",
        location: away
          ? null
          : "7932 Opossumtown Pike, Frederick, MD 21702",
        state: fccState(item),
        ...score,
        sourceUrl,
        watchUrl: null,
        statsUrl: null,
        ticketsUrl: null,
        recapUrl: null,
        verifiedAt,
      },
    ];
  });
}

function monthsFrom(now: Date, count = 3): Array<{ year: number; month: number }> {
  const eastern = easternParts(now);
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(
      Date.UTC(eastern.year, eastern.month - 1 + offset, 1, 12),
    );
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  });
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/xml,text/xml,text/plain,*/*" },
      next: { revalidate: 900 },
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 900 },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLocalSportsGames(
  now = new Date(),
): Promise<SportsGame[]> {
  const verifiedAt = new Date().toISOString();
  const sidearmJobs = SIDEARM_SITES.flatMap((site) =>
    monthsFrom(now).map(async ({ year, month }) => {
      const query = new URLSearchParams({
        type: "month",
        sport: "0",
        location: "all",
        date: `${month}/01/${year}`,
      });
      const raw = await fetchJson(
        `${site.origin}/services/responsive-calendar.ashx?${query}`,
      );
      return raw ? normalizeSidearmSports(raw, site, verifiedAt) : [];
    }),
  );
  const fccJob = fetchText(FCC_RSS_URL).then((xml) =>
    xml ? normalizeFccSportsRss(xml, verifiedAt) : [],
  );

  const rows = (await Promise.all([...sidearmJobs, fccJob])).flat();
  const deduped = new Map<string, SportsGame>();
  for (const row of rows) deduped.set(row.id, row);
  return [...deduped.values()].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
}

const cachedLocalSportsGames = unstable_cache(
  () => fetchLocalSportsGames(new Date()),
  ["local-sports-v1", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 900, tags: ["events", "sports"] },
);

export async function getLocalSportsGames(
  now = new Date(),
): Promise<SportsGame[]> {
  const current = Math.abs(now.getTime() - Date.now()) <= 300_000;
  return current ? cachedLocalSportsGames() : fetchLocalSportsGames(now);
}

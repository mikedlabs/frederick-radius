import "server-only";

import { FOOD_TRUCKS } from "@/data/food-trucks";
import { parseICal } from "@/lib/ingest/parser";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";
import type {
  FoodTruckScheduleSnapshot,
  FoodTruckScheduleSourceHealth,
  FoodTruckScheduleStop,
  FoodTruckScheduleVendor,
} from "./schedule-types";

export const FOOD_TRUCK_SOURCES = {
  celebrate: {
    id: "celebrate-frederick",
    label: "Celebrate Frederick",
    url: "https://www.celebratefrederick.com/events/summer-concert-series/food-truck-schedule/",
  },
  grilledCheese: {
    id: "grilled-cheese-please",
    label: "Grilled Cheese Please!",
    url: "https://calendar.google.com/calendar/ical/aamobilefoodservice%40gmail.com/public/basic.ics",
    pageUrl: "https://grilledcheeseplease.online/schedule",
  },
  springfield: {
    id: "springfield-manor",
    label: "Springfield Manor",
    url: "https://calendar.google.com/calendar/ical/tlcdc0nla1hjvrf2n8lilf8m8c%40group.calendar.google.com/public/basic.ics",
    pageUrl: "https://www.springfieldmanor.com/event-calendar.html",
  },
} as const;

const MAX_SOURCE_BYTES = 1_500_000;
const SOURCE_TIMEOUT_MS = 7_000;

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const TRUCK_ALIASES: Record<string, string> = {
  "blendabowl food truck": "blendabowl",
  "in10se bbq food truck": "in10se-bbq",
  "traditional authentic mexican food truck": "traditional-authentic-mexican",
  "three daughters truck": "three-daughters",
  "three daughters food truck": "three-daughters",
  "sabor de cuba food truck": "sabor-de-cuba",
  "grilled cheese please food truck": "grilled-cheese-please",
  "grilled cheese please": "grilled-cheese-please",
};

function normalizeVendor(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const ROSTER_NAMES = new Map(
  FOOD_TRUCKS.map((truck) => [normalizeVendor(truck.name), truck.slug]),
);

/** Conservative identity matching. It never guesses between similar vendors. */
export function matchFoodTruckSlug(name: string): string | undefined {
  const normalized = normalizeVendor(name);
  return ROSTER_NAMES.get(normalized) ?? TRUCK_ALIASES[normalized];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function textFromHtml(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(decodeHtml(value));
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function datePartsFromEnglishDate(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/i,
  );
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31 || year < 2020 || year > 2100) return null;
  return { year, month, day };
}

function stopId(...parts: string[]): string {
  return parts
    .join("-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}

function vendor(name: string, url?: string): FoodTruckScheduleVendor {
  return {
    name: name.trim(),
    slug: matchFoodTruckSlug(name),
    url: safeHttpUrl(url),
  };
}

/** Parse Celebrate Frederick's official dated Summer Concert Series table. */
export function parseCelebrateFrederickSchedule(html: string): FoodTruckScheduleStop[] {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const stops: FoodTruckScheduleStop[] = [];

  for (const row of rows) {
    const cells = Array.from(row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((m) => m[1]);
    if (cells.length < 2) continue;
    const date = datePartsFromEnglishDate(textFromHtml(cells[0]));
    if (!date) continue;

    const vendors: FoodTruckScheduleVendor[] = [];
    for (const cell of cells.slice(1)) {
      const links = Array.from(cell.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
      if (links.length > 0) {
        for (const link of links) {
          const name = textFromHtml(link[2]);
          if (name) vendors.push(vendor(name, link[1]));
        }
      } else {
        const name = textFromHtml(cell);
        if (name && !/^tbd$/i.test(name)) vendors.push(vendor(name));
      }
    }
    if (vendors.length === 0) continue;

    const startsAt = easternWallToUtcISO(date.year, date.month, date.day, 19, 0);
    stops.push({
      id: stopId("celebrate", startsAt, ...vendors.map((item) => item.name)),
      title: "Food trucks at the Summer Concert Series",
      startsAt,
      endsAt: easternWallToUtcISO(date.year, date.month, date.day, 20, 30),
      venueName: "Baker Park Bandshell",
      address: "121 N Bentz St, Frederick, MD 21701",
      municipality: "Frederick",
      vendors,
      sourceName: FOOD_TRUCK_SOURCES.celebrate.label,
      sourceUrl: FOOD_TRUCK_SOURCES.celebrate.url,
      confidence: "organizer",
      serviceNote: "The concert runs from 7 to 8:30 p.m. Vendor service hours may differ.",
    });
  }
  return stops;
}

function parseClockRange(summary: string): {
  label: string;
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
} {
  const match = summary.match(/^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s+(.+)$/);
  if (!match) return { label: summary.trim() };
  const toAfternoonHour = (hour: number) => (hour < 10 ? hour + 12 : hour);
  return {
    label: match[5].trim(),
    startHour: toAfternoonHour(Number(match[1])),
    startMinute: Number(match[2] ?? 0),
    endHour: toAfternoonHour(Number(match[3])),
    endMinute: Number(match[4] ?? 0),
  };
}

function cleanTruckName(value: string): string {
  return value.replace(/\s+(?:food\s+)?truck\s*$/i, "").trim();
}

/** Parse Springfield Manor's public calendar and its time-prefixed summaries. */
export function parseSpringfieldManorSchedule(ics: string): FoodTruckScheduleStop[] {
  return parseICal(ics).flatMap((event) => {
    const clock = parseClockRange(event.summary);
    if (!/\b(?:food\s+truck|truck)\b/i.test(event.summary)) return [];
    const name = cleanTruckName(clock.label);
    if (!name) return [];
    const date = easternParts(new Date(event.startsAtUtc));
    const startsAt = clock.startHour == null
      ? event.startsAtUtc
      : easternWallToUtcISO(date.year, date.month, date.day, clock.startHour, clock.startMinute ?? 0);
    const endsAt = clock.endHour == null
      ? event.endsAtUtc
      : easternWallToUtcISO(date.year, date.month, date.day, clock.endHour, clock.endMinute ?? 0);
    return [{
      id: stopId("springfield", startsAt, name),
      title: `${name} at Springfield Manor`,
      startsAt,
      endsAt,
      venueName: "Springfield Manor Winery Distillery Brewery",
      address: "11836 Auburn Rd, Thurmont, MD 21788",
      municipality: "Thurmont",
      vendors: [vendor(name)],
      sourceName: FOOD_TRUCK_SOURCES.springfield.label,
      sourceUrl: FOOD_TRUCK_SOURCES.springfield.pageUrl,
      confidence: "venue" as const,
    }];
  });
}

/** Parse the vendor-published Grilled Cheese Please calendar. */
export function parseGrilledCheesePleaseSchedule(ics: string): FoodTruckScheduleStop[] {
  return parseICal(ics).map((event) => ({
    id: stopId("grilled-cheese-please", event.uid, event.startsAtUtc),
    title: event.summary,
    startsAt: event.startsAtUtc,
    endsAt: event.endsAtUtc,
    venueName: event.rawLocation || event.summary,
    address: event.rawLocation,
    vendors: [vendor("Grilled Cheese Please!", FOOD_TRUCK_SOURCES.grilledCheese.pageUrl)],
    sourceName: FOOD_TRUCK_SOURCES.grilledCheese.label,
    sourceUrl: FOOD_TRUCK_SOURCES.grilledCheese.pageUrl,
    confidence: "vendor" as const,
  }));
}

function scheduleWindow(now: Date): { start: string; end: string } {
  const today = easternParts(now);
  const endDay = new Date(Date.UTC(today.year, today.month - 1, today.day + 8));
  return {
    start: easternWallToUtcISO(today.year, today.month, today.day, 0, 0),
    end: easternWallToUtcISO(
      endDay.getUTCFullYear(),
      endDay.getUTCMonth() + 1,
      endDay.getUTCDate(),
      0,
      0,
    ),
  };
}

function inWindow(stop: FoodTruckScheduleStop, start: string, end: string): boolean {
  const value = Date.parse(stop.startsAt);
  return Number.isFinite(value) && value >= Date.parse(start) && value < Date.parse(end);
}

async function fetchSource(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html, text/calendar;q=0.9, */*;q=0.5",
        "User-Agent": "FrederickRadius/1.0 schedule reader",
      },
      next: { revalidate: 900, tags: ["food-truck-source"] },
    });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error("Source was too large");
    const text = await response.text();
    if (text.length > MAX_SOURCE_BYTES) throw new Error("Source was too large");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

type SourceDefinition = {
  id: string;
  label: string;
  fetchUrl: string;
  parse: (text: string) => FoodTruckScheduleStop[];
};

const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    id: FOOD_TRUCK_SOURCES.celebrate.id,
    label: FOOD_TRUCK_SOURCES.celebrate.label,
    fetchUrl: FOOD_TRUCK_SOURCES.celebrate.url,
    parse: parseCelebrateFrederickSchedule,
  },
  {
    id: FOOD_TRUCK_SOURCES.springfield.id,
    label: FOOD_TRUCK_SOURCES.springfield.label,
    fetchUrl: FOOD_TRUCK_SOURCES.springfield.url,
    parse: parseSpringfieldManorSchedule,
  },
  {
    id: FOOD_TRUCK_SOURCES.grilledCheese.id,
    label: FOOD_TRUCK_SOURCES.grilledCheese.label,
    fetchUrl: FOOD_TRUCK_SOURCES.grilledCheese.url,
    parse: parseGrilledCheesePleaseSchedule,
  },
];

/** Build the next eight calendar days from allowlisted official schedules. */
export async function buildFoodTruckSchedule(now = new Date()): Promise<FoodTruckScheduleSnapshot> {
  const generatedAt = now.toISOString();
  const window = scheduleWindow(now);
  const results = await Promise.all(
    SOURCE_DEFINITIONS.map(async (source): Promise<{
      stops: FoodTruckScheduleStop[];
      health: FoodTruckScheduleSourceHealth;
    }> => {
      try {
        const text = await fetchSource(source.fetchUrl);
        const stops = source.parse(text).filter((stop) => inWindow(stop, window.start, window.end));
        return {
          stops,
          health: {
            id: source.id,
            label: source.label,
            ok: true,
            count: stops.length,
            checkedAt: generatedAt,
          },
        };
      } catch (error) {
        return {
          stops: [],
          health: {
            id: source.id,
            label: source.label,
            ok: false,
            count: 0,
            checkedAt: generatedAt,
            error: error instanceof Error ? error.message.slice(0, 120) : "Source failed",
          },
        };
      }
    }),
  );

  const byId = new Map<string, FoodTruckScheduleStop>();
  for (const result of results) {
    for (const stop of result.stops) byId.set(stop.id, stop);
  }

  return {
    version: 1,
    generatedAt,
    windowStart: window.start,
    windowEnd: window.end,
    stops: [...byId.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    sources: results.map((result) => result.health),
  };
}

/**
 * Hand-curated reliable weekly hours for well-known places (P0-6).
 *
 * Hours coverage from Google is low, so the home "Open now" panel was
 * almost always empty and showed a defeating empty state. These are
 * marquee Frederick places whose stated hours are dependable enough to
 * surface as "Likely open" when no Google-verified result exists. Keep
 * the list curated and conservative: only places a local would vouch
 * for being open during these windows. Times are 24-hour America/New_York.
 */

import type { OpenStatus } from "@/lib/hours";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type OpenWindow = Partial<Record<Weekday, [string, string]>>;

export const OPENING_SOON_MINUTES = 60;

export type OpeningSoon = {
  opensAt: string;
  minutesUntil: number;
};

const FREDERICK_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

let lastClockMs = Number.NaN;
let lastClockValue: { day: Weekday; minutes: number } | null = null;

function frederickClock(now: Date): { day: Weekday; minutes: number } {
  if (now.getTime() === lastClockMs && lastClockValue) return lastClockValue;
  const parts = Object.fromEntries(
    FREDERICK_CLOCK.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  lastClockMs = now.getTime();
  lastClockValue = {
    day: parts.weekday.toLowerCase().slice(0, 3) as Weekday,
    minutes: hour * 60 + Number(parts.minute),
  };
  return lastClockValue;
}

function minutesFromMidnight(hhmm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hour, minute] = hhmm.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 24 ||
    minute < 0 ||
    minute > 59 ||
    (hour === 24 && minute !== 0)
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function openingSoon(
  opensAt: string,
  now: Date,
  maxMinutes: number,
): OpeningSoon | null {
  const openingMinute = minutesFromMidnight(opensAt);
  if (openingMinute == null || maxMinutes <= 0) return null;
  const minutesUntil = openingMinute - frederickClock(now).minutes;
  return minutesUntil > 0 && minutesUntil <= maxMinutes
    ? { opensAt, minutesUntil }
    : null;
}

const wk = (open: string, close: string): OpenWindow => ({
  mon: [open, close],
  tue: [open, close],
  wed: [open, close],
  thu: [open, close],
  fri: [open, close],
  sat: [open, close],
  sun: [open, close],
});

export const RELIABLE_OPEN_WINDOWS: Record<string, OpenWindow> = {
  "dublin-roasters-frederick": wk("07:00", "18:00"),
  "frederick-coffee-company-frederick": wk("07:00", "20:00"),
  // Verified against Gravel & Grind's own contact/shop pages on 2026-07-26.
  // The business notes that holiday hours can vary, and these close 15
  // minutes before the posted time so a likely-open answer stays conservative.
  "gravel-and-grind-frederick": {
    mon: ["08:00", "13:45"],
    tue: ["08:00", "13:45"],
    wed: ["08:00", "16:45"],
    thu: ["08:00", "16:45"],
    fri: ["08:00", "16:45"],
    sat: ["08:00", "16:45"],
    sun: ["08:00", "15:45"],
  },
  "common-market-frederick": wk("08:00", "21:00"),
  "south-mountain-creamery-middletown": wk("08:00", "20:00"),
  "north-market-pop-shop-frederick": wk("11:00", "21:00"),
  "isabellas-taverna-tapas-bar-frederick": wk("11:30", "22:00"),
  "brewers-alley-frederick": wk("11:00", "23:00"),
  "magoos-frederick": wk("11:00", "23:00"),
  "monocacy-brewing-frederick": wk("12:00", "22:00"),
  "olde-mother-brewing-frederick": wk("15:00", "22:00"),
  "rockwell-brewery-frederick": wk("15:00", "22:00"),
  "smoketown-brewing-brunswick": wk("16:00", "22:00"),
  "bushwaller-irish-pub-frederick": wk("11:00", "23:59"),
  "hootch-and-banter-frederick": wk("16:00", "23:59"),
  "the-cozy-creamery-thurmont": wk("11:00", "21:00"),
  "delaplaine-arts-center-frederick": wk("10:00", "17:00"),
  // Surelocked In's official site says "We're Back" and publishes this
  // schedule. Verified 2026-07-26; appointment-only Monday is omitted.
  "surelocked-in-escape-games-frederick": {
    tue: ["16:00", "19:45"],
    wed: ["16:00", "19:45"],
    thu: ["16:00", "19:45"],
    fri: ["16:00", "20:45"],
    sat: ["11:30", "20:45"],
    sun: ["13:00", "19:45"],
  },
  // Downtown staples a Reddit reviewer rightly flagged as missing from
  // "open now" (July 2026). Windows verified against the businesses' own
  // posted hours (cafe-nola.com: 8am-2am, Tue to 2pm; beansnbagels.com:
  // daily 8am-3pm), then narrowed conservatively per this file's rule.
  "cafe-nola": {
    mon: ["08:00", "21:00"],
    tue: ["08:00", "13:30"],
    wed: ["08:00", "21:00"],
    thu: ["08:00", "21:00"],
    fri: ["08:00", "21:00"],
    sat: ["08:00", "21:00"],
    sun: ["08:00", "21:00"],
  },
  "beans-bagels-frederick": wk("08:00", "14:30"),
};

/**
 * A verified closed status may earn one explicit "opening soon" transition,
 * but only when it names a same-day opening within the bounded window.
 * Unknown and unverified states deliberately return null here; callers may
 * consult the separately labeled curated fallback below.
 */
export function openingSoonFromStatus(
  status: OpenStatus,
  now: Date,
  maxMinutes = OPENING_SOON_MINUTES,
): OpeningSoon | null {
  if (
    status.state !== "closed" ||
    !status.opensToday ||
    !status.opensAt
  ) {
    return null;
  }
  return openingSoon(status.opensAt, now, maxMinutes);
}

/**
 * The curated-window counterpart to openingSoonFromStatus. This is useful
 * only as a clearly qualified fallback ("Likely opens"); it must never be
 * promoted to a verified-hours claim by a caller.
 */
export function reliableOpeningSoon(
  slug: string,
  now: Date,
  maxMinutes = OPENING_SOON_MINUTES,
): OpeningSoon | null {
  const { day } = frederickClock(now);
  const span = RELIABLE_OPEN_WINDOWS[slug]?.[day];
  return span ? openingSoon(span[0], now, maxMinutes) : null;
}

/**
 * Is the place open now per its curated window, evaluated in
 * America/New_York. Returns false when there is no window for the slug.
 */
export function isLikelyOpenNow(slug: string, now: Date): boolean {
  const win = RELIABLE_OPEN_WINDOWS[slug];
  if (!win) return false;
  const { day, minutes } = frederickClock(now);
  const span = win[day];
  if (!span) return false;
  const open = minutesFromMidnight(span[0]);
  const close = minutesFromMidnight(span[1]);
  if (open == null || close == null) return false;
  // A closing time is an exclusive boundary: "closes at 6:00" must not
  // become a "likely open" claim at 6:00.
  return minutes >= open && minutes < close;
}

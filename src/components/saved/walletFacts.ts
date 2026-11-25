/**
 * walletFacts — the pure logic behind the Saved wallet's card copy
 * (SavedWallet.tsx). Everything here is deterministic string-shaping over
 * SHIPPED PlaceCardData fields (open_status, google_rating, distance_m,
 * price_band, hours, saved_at) so it can be spec'd without a DOM.
 *
 * The headline export is `lipFact`: a closed card's row carries the
 * place name and exactly ONE mono fact, chosen by VALUE to the reader —
 * "can I go right now" beats a star rating beats geography. One fact,
 * never a chip pile; the stub ledger carries the rest after the raise.
 */
import type { Hours, HoursWindow, DayOfWeek } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";
import { hoursForDate, isAllDayWindow, isDisplayOnlyHours } from "@/lib/hours";
import { easternDayKey, easternParts } from "@/lib/tz";

/** "21:00" -> "9 PM", "07:30" -> "7:30 AM". Null on a bad value. */
export function fmtClock(hhmm?: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const hh = h % 24;
  const mer = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return m === 0 ? `${h12} ${mer}` : `${h12}:${String(m).padStart(2, "0")} ${mer}`;
}

/** Compact clock for the On-now running line: "21:00" -> "11" reads as
 *  "till 11" in context; keeps the ruled strip to one quiet register. */
export function fmtClockShort(hhmm?: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const hh = h % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, "0")}`;
}

export type LipFact = {
  text: string;
  /** True only for verified open states — drives the vermilion dot. */
  live: boolean;
  /** Non-live facts render dimmer so live cards win the scan. */
  dim: boolean;
};

/**
 * The ONE fact a closed lip shows, by value:
 *  1. verified open        -> "Open till 9 PM" (live dot)
 *  2. verified closing     -> "Closes 9 PM" (live dot; the fact carries the urgency)
 *  3. verified closed      -> "Opens 5 PM" when it reopens today, else "Closed now"
 *  4. rating               -> "★ 4.6"
 *  5. distance             -> "0.4 mi"
 *  6. town                 -> "Frederick"
 * Never invents a value; falls through to the next true thing.
 */
export function lipFact(
  input: {
    open_status: OpenStatus;
    google_rating?: number;
    distance_m?: number;
  },
  town: string | null,
): LipFact | null {
  const s = input.open_status;
  if (s.state === "open") {
    if (s.allDay) return { text: "Open 24 hours", live: true, dim: false };
    const till = fmtClock(s.closesAt);
    return { text: till ? `Open till ${till}` : "Open now", live: true, dim: false };
  }
  if (s.state === "closing-soon") {
    const at = fmtClock(s.closesAt);
    return { text: at ? `Closes ${at}` : "Closing soon", live: true, dim: false };
  }
  if (s.state === "closed") {
    const at = s.opensToday ? fmtClock(s.opensAt) : null;
    return { text: at ? `Opens ${at}` : "Closed now", live: false, dim: true };
  }
  if (typeof input.google_rating === "number" && Number.isFinite(input.google_rating)) {
    return { text: `★ ${input.google_rating.toFixed(1)}`, live: false, dim: true };
  }
  const dist = distanceLabel(input.distance_m);
  if (dist) return { text: dist, live: false, dim: true };
  if (town) return { text: town, live: false, dim: true };
  return null;
}

const DAYS: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

/** Midday on the Frederick calendar date `days` after `today`. 17:00 UTC is
 *  noon or 1 PM Eastern on that same date in both halves of the year. */
function middayOn(today: string, days: number): Date {
  return new Date(Date.parse(`${today}T17:00:00Z`) + days * 86_400_000);
}

function windowsLine(windows: HoursWindow[]): string | null {
  if (windows.some(isAllDayWindow)) return "Open 24 hours";
  const parts = windows
    .map((w) => {
      const open = fmtClock(w.open);
      const close = fmtClock(w.close);
      return open && close ? `${open} – ${close}` : null;
    })
    .filter((x): x is string => Boolean(x));
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * The stub ledger's schedule cell: the hours for today's date ("Today ·
 * 11 AM – 11 PM"), else the next date that has any ("Tomorrow" / "Sat").
 * Each date is read through `hoursForDate`, the same date-aware answer the
 * place page prints as "Hours today" (or "Dinner hours today" for hours that
 * describe one service), so a dated closure or early closing
 * cannot contradict the card's own open status. A closed date has no line and
 * the search moves on, and so does a today whose only window is last night's
 * tail after it has ended. A date the schedule cannot confirm (an unconfirmed
 * Thanksgiving, evidence past its horizon) is never printed as open: it says
 * "Hours not confirmed" and the search stops there, because the card's open
 * status promises nothing beyond it either. Still a schedule, never an
 * open/closed verdict, which stays with open_status. Null when the place
 * carries no hours at all (the cell renders an honest dash).
 */
export function todayHoursLine(
  hours: Hours | undefined,
  now: Date = new Date(),
): { label: string; value: string } | null {
  if (!hours) return null;
  const today = easternDayKey(now);
  const hasWeeklyTable = DAYS.some((day) => (hours[day]?.length ?? 0) > 0);
  // Hours that describe one service ("Dinner hours") carry its name, as the
  // place page's "Dinner hours today" does.
  const service = isDisplayOnlyHours(hours) ? hours._official?.qualification?.label.trim() : undefined;
  for (let i = 0; i < 7; i++) {
    const at = i === 0 ? now : middayOn(today, i);
    const day = i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_LABEL[DAYS[at.getUTCDay()]];
    const label = !service ? day : i < 2 ? `${service} ${day.toLowerCase()}` : `${service}, ${day}`;
    const windows = hoursForDate(hours, at);
    if (!windows) {
      if (hasWeeklyTable) return { label, value: "Hours not confirmed" };
      continue;
    }
    if (i === 0 && windows.length > 0 && windows.every((w) => endedMidnightTail(w, now))) continue;
    const line = windowsLine(windows);
    if (!line) continue;
    return { label, value: line };
  }
  return null;
}

/** A window that starts at midnight is the tail of the night before. True
 *  once that tail has closed by `now` on the Frederick clock. Eastern offsets
 *  are whole hours, so the UTC minute is Frederick's minute. */
function endedMidnightTail(w: HoursWindow, now: Date): boolean {
  if (w.open !== "00:00" || isAllDayWindow(w)) return false;
  const [h, m] = w.close.split(":").map(Number);
  return easternParts(now).hour * 60 + now.getUTCMinutes() >= h * 60 + m;
}

/** "0.4 mi" past a quarter mile, "320 m" under it. Null when unknown. */
export function distanceLabel(m?: number): string | null {
  if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return null;
  return m < 400 ? `${Math.round(m)} m` : `${(m / 1609.34).toFixed(1)} mi`;
}

/** price_band -> the shown "$" run + the dimmed remainder up to four. */
export function priceGlyphs(band?: number): { shown: string; off: string } | null {
  if (typeof band !== "number" || !Number.isInteger(band) || band < 1 || band > 4) return null;
  return { shown: "$".repeat(band), off: "$".repeat(4 - band) };
}

/**
 * "Jun 14" from the saved_at ISO stamp. The epoch sentinel (a DB follow
 * whose local save date we never saw) and bad values return null — an
 * honest blank beats a fake "Jan 1 1970".
 */
export function savedDateLabel(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t <= 0) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(new Date(t));
}


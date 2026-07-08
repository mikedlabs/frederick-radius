/**
 * walletFacts — the pure logic behind the Saved wallet's card copy
 * (SavedWallet.tsx). Everything here is deterministic string-shaping over
 * SHIPPED PlaceCardData fields (open_status, google_rating, distance_m,
 * price_band, hours, saved_at) so it can be spec'd without a DOM.
 *
 * The headline export is `lipFact`: a closed card's 62px lip carries the
 * place name and exactly ONE mono fact, chosen by VALUE to the reader —
 * "can I go right now" beats a star rating beats geography. One fact,
 * never a chip pile; the stub ledger carries the rest after the raise.
 */
import type { Hours, HoursWindow, DayOfWeek } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";
import { isAllDayWindow } from "@/lib/hours";

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

/** Frederick's current day-of-week, independent of the device timezone. */
function frederickDay(now: Date): DayOfWeek {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  const map: Record<string, DayOfWeek> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };
  return map[wd] ?? "mon";
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
 * The stub ledger's schedule cell: today's stated window ("Today ·
 * 11 AM – 11 PM"), else the next day that has one ("Tomorrow" / "Sat").
 * Prints the SHIPPED schedule, never an open/closed assertion — that
 * verdict stays with open_status and its verified-hours policy. Null when
 * the place carries no hours at all (the cell renders an honest dash).
 */
export function todayHoursLine(
  hours: Hours | undefined,
  now: Date = new Date(),
): { label: string; value: string } | null {
  if (!hours) return null;
  const start = DAYS.indexOf(frederickDay(now));
  for (let i = 0; i < 7; i++) {
    const day = DAYS[(start + i) % 7];
    const line = windowsLine(hours[day] ?? []);
    if (!line) continue;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_LABEL[day];
    return { label, value: line };
  }
  return null;
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

/** Pl. I, II, III… — the stack position as a field-guide plate number. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export function plate(i: number): string {
  return i >= 0 && i < ROMAN.length ? ROMAN[i] : String(i + 1);
}

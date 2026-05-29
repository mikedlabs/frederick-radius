import type { DayOfWeek, Hours, HoursWindow } from "@/data/places";

const DAYS: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

function nowInFrederick(d: Date = new Date()): { day: DayOfWeek; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const dayMap: Record<string, DayOfWeek> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };
  const day = dayMap[parts.weekday] ?? "mon";
  const hh = parseInt(parts.hour ?? "0", 10);
  const mm = parseInt(parts.minute ?? "0", 10);
  return { day, minutes: hh * 60 + mm };
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export type OpenStatus =
  | { state: "open"; closesAt: string; closingSoon: boolean }
  | { state: "closing-soon"; closesAt: string }
  | { state: "closed"; opensAt?: string; opensDay?: DayOfWeek }
  | { state: "unverified" }
  | { state: "unknown" };

/**
 * "Open right now" — the shared predicate behind every open-now count
 * and filter (the map readout, the radius instrument, the browse filter).
 * Centralized so the definition can never drift between surfaces: only
 * verified-open states count. "unverified" and "unknown" never do, so a
 * count built on this is always "at least N confirmed open" and never
 * over-asserts.
 */
export function isOpenNow(status: OpenStatus): boolean {
  return status.state === "open" || status.state === "closing-soon";
}

export function getOpenStatus(
  hours: Hours | undefined,
  options: { verified?: boolean } = {},
  now: Date = new Date(),
): OpenStatus {
  if (!hours) return { state: "unknown" };
  if (!options.verified) return { state: "unverified" };
  const { day, minutes } = nowInFrederick(now);

  const todayWindows = hours[day] ?? [];
  for (const w of todayWindows) {
    const open = parseHHMM(w.open);
    let close = parseHHMM(w.close);
    if (close <= open) close += 24 * 60;
    if (minutes >= open && minutes < close) {
      const left = close - minutes;
      const closingSoon = left <= 60;
      if (closingSoon) return { state: "closing-soon", closesAt: w.close };
      return { state: "open", closesAt: w.close, closingSoon: false };
    }
  }

  for (let i = 0; i < 7; i++) {
    const idx = (DAYS.indexOf(day) + i) % 7;
    const d = DAYS[idx];
    const windows = hours[d];
    if (!windows || windows.length === 0) continue;
    if (i === 0) {
      const upcoming = windows.find((w) => parseHHMM(w.open) > minutes);
      if (upcoming) return { state: "closed", opensAt: upcoming.open, opensDay: d };
    } else {
      return { state: "closed", opensAt: windows[0].open, opensDay: d };
    }
  }
  return { state: "closed" };
}

export function formatTime(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const am = h < 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  const min = m === "00" ? "" : `:${m}`;
  return `${h}${min}${am ? "am" : "pm"}`;
}

export function formatHoursLine(status: OpenStatus): string {
  if (status.state === "open") return `Open until ${formatTime(status.closesAt)}`;
  if (status.state === "closing-soon") return `Closing soon · ${formatTime(status.closesAt)}`;
  if (status.state === "closed" && status.opensAt && status.opensDay) {
    return `Closed · Opens ${DAY_LABEL[status.opensDay]} ${formatTime(status.opensAt)}`;
  }
  if (status.state === "closed") return "Closed";
  if (status.state === "unverified") return "Hours not confirmed";
  return "Hours not posted";
}

export function formatFullHours(hours: Hours | undefined): { day: DayOfWeek; label: string; windows: HoursWindow[] }[] {
  const order: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return order.map((d) => ({
    day: d,
    label: DAY_LABEL[d],
    windows: hours?.[d] ?? [],
  }));
}

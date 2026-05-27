/**
 * NowDayStrip — a quiet 7-day "you are here" temporal anchor that sits
 * at the top of /now alongside the dateline.
 *
 * Pure visual: seven dots, Sun → Sat, with today filled in the brand
 * color. No interactions in v1 — TimeToggle further down the page
 * handles the Now / Tonight / Tomorrow / Weekend pivot, and /events
 * carries the calendar. This strip's job is just to ground the
 * page's "today" claim in a glanceable visual ("yes, today is
 * Wednesday").
 *
 * Server-rendered. The current weekday is derived in America/New_York
 * so a Vercel UTC server agrees with a Frederick user about what
 * day it is.
 */

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function easternWeekday(now: Date): number {
  // 0 = Sunday … 6 = Saturday
  const WD: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  return WD[w] ?? 0;
}

/** The N-th calendar day in Eastern time, relative to today. */
function easternDayNumber(now: Date, offsetFromToday: number): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  // Construct UTC noon for the target Eastern day (offset relative to
  // today) and re-read its day-of-month. Noon avoids DST edge cases.
  const d = new Date(
    Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day) + offsetFromToday,
      16, // ~noon Eastern (UTC-4 EDT / UTC-5 EST)
    ),
  );
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      day: "2-digit",
    }).format(d),
  );
}

export default function NowDayStrip() {
  const now = new Date();
  const todayDow = easternWeekday(now);

  return (
    <nav
      aria-label="This week"
      className="grid grid-cols-7 gap-1 sm:gap-1.5"
    >
      {WEEKDAY_LETTERS.map((letter, i) => {
        const isToday = i === todayDow;
        const isPast = i < todayDow;
        const offset = i - todayDow;
        const dayNumber = easternDayNumber(now, offset);
        return (
          <div
            key={i}
            aria-current={isToday ? "date" : undefined}
            aria-label={`${WEEKDAY_FULL[i]} ${dayNumber}${isToday ? ", today" : ""}`}
            className="flex flex-col items-center gap-1 py-1"
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{
                color: isToday
                  ? "var(--app-brand)"
                  : isPast
                    ? "var(--app-ink-3)"
                    : "var(--app-ink-2)",
                opacity: isPast ? 0.6 : 1,
              }}
            >
              {letter}
            </span>
            <span
              className="grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold tabular-nums sm:h-8 sm:w-8 sm:text-[13px]"
              style={{
                background: isToday ? "var(--app-brand)" : "transparent",
                color: isToday
                  ? "white"
                  : isPast
                    ? "var(--app-ink-3)"
                    : "var(--app-ink)",
                opacity: isPast ? 0.55 : 1,
                boxShadow: isToday ? "var(--app-shadow-1)" : "none",
              }}
            >
              {dayNumber}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

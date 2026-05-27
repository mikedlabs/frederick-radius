import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import AnimatedSkyGlyph from "./AnimatedSkyGlyph";

/**
 * NowDayStrip — 7-day "you are here + what's the weather" strip.
 *
 * Previous version was a quiet 7-dot row with today highlighted. It
 * gave a temporal anchor but didn't carry any data. This rewrite
 * pairs each day with the NWS forecast pulled server-side:
 *
 *   - Weekday letter (S M T W T F S)
 *   - Animated sky glyph for the forecast condition
 *   - Day number (today is filled brand color)
 *   - High / low temperature
 *
 * The whole strip reads in a glance as "here's the week, here's
 * what the weather will be." Today is still the anchor — same brand-
 * filled circle as before — but every day around it now carries
 * useful signal so the strip earns the vertical space it took.
 *
 * Server component, fetches NWS once per request (cached by the
 * shared getNwsForecast). Daily forecast comes back as 14 periods
 * alternating daytime/nighttime; we pair them up to get hi/low per
 * date. If the fetch fails the strip degrades gracefully to the
 * day-only layout (no glyph, no temps).
 */

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function easternWeekday(now: Date): number {
  const WD: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  return WD[w] ?? 0;
}

function easternDayNumber(now: Date, offsetFromToday: number): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const d = new Date(
    Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + offsetFromToday, 16),
  );
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      day: "2-digit",
    }).format(d),
  );
}

/**
 * For each day-offset (-todayDow..6-todayDow), find the NWS daytime
 * and nighttime periods so we can show hi/lo + a representative
 * forecast variant. NWS returns periods in chronological order
 * starting from the next half-day; we match by Eastern-time calendar
 * date.
 */
type DailyForecastInfo = {
  high?: number;
  low?: number;
  shortForecast?: string;
};

function easternDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function dateForOffset(now: Date, offset: number): Date {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(
    Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + offset, 16),
  );
}

export default async function NowDayStrip() {
  const now = new Date();
  const todayDow = easternWeekday(now);

  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const dailyByDate = new Map<string, DailyForecastInfo>();
  if (forecast?.daily) {
    for (const p of forecast.daily) {
      const dk = easternDateKey(new Date(p.startTime));
      const cur = dailyByDate.get(dk) ?? {};
      if (p.isDaytime) {
        cur.high = p.temperature;
        cur.shortForecast = p.shortForecast;
      } else {
        cur.low = p.temperature;
        if (!cur.shortForecast) cur.shortForecast = p.shortForecast;
      }
      dailyByDate.set(dk, cur);
    }
  }

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
        const dk = easternDateKey(dateForOffset(now, offset));
        const info = dailyByDate.get(dk);
        const variant = info?.shortForecast ? iconForShortForecast(info.shortForecast) : null;
        return (
          <div
            key={i}
            aria-current={isToday ? "date" : undefined}
            aria-label={[
              `${WEEKDAY_FULL[i]} ${dayNumber}`,
              isToday ? "today" : null,
              info?.high !== undefined ? `high ${info.high}` : null,
              info?.low !== undefined ? `low ${info.low}` : null,
            ].filter(Boolean).join(", ")}
            className="flex flex-col items-center gap-1 rounded-[var(--app-radius-sm)] py-1.5"
            style={{
              background: isToday ? "color-mix(in srgb, var(--app-brand) 6%, transparent)" : "transparent",
            }}
          >
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.08em]"
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
              className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold tabular-nums sm:h-8 sm:w-8 sm:text-[12px]"
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
            {/* Weather glyph + hi/lo, when NWS daily came back with
                data for this date. Past days render with reduced
                opacity since the forecast doesn't apply backwards. */}
            {variant ? (
              <div
                aria-hidden
                style={{ opacity: isPast ? 0.4 : 1 }}
                className="flex flex-col items-center gap-0.5"
              >
                <AnimatedSkyGlyph variant={variant} size={20} />
                {(info?.high !== undefined || info?.low !== undefined) && (
                  <span
                    className="text-[9px] font-semibold tabular-nums leading-tight"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {info?.high !== undefined ? `${info.high}°` : ""}
                    {info?.high !== undefined && info?.low !== undefined && (
                      <span className="opacity-50">{"/"}</span>
                    )}
                    {info?.low !== undefined ? `${info.low}°` : ""}
                  </span>
                )}
              </div>
            ) : (
              // Reserve some vertical space so the row height stays
              // stable while waiting for NWS or when a day falls
              // outside the 7-day forecast window.
              <div style={{ height: 32 }} aria-hidden />
            )}
          </div>
        );
      })}
    </nav>
  );
}

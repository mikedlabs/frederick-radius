import Link from "next/link";
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

function easternWeekday(d: Date): number {
  const WD: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(d);
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

export default async function NowDayStrip({
  /** When set, every day cell wraps in a Link to this URL (use {date}
   *  as the YYYY-MM-DD placeholder). Used by /events to make the day
   *  strip a temporal filter. When omitted the strip is static. */
  hrefForDate,
  /** When set, override which day reads as "active." For /events this
   *  is the currently-filtered day; for /now it stays undefined so
   *  today is the active day. ISO YYYY-MM-DD in Eastern time. */
  activeDateKey,
  /** Optional event-count map keyed by Eastern date key. When provided,
   *  replaces the weather hi/lo line with a "N events" badge so the
   *  strip carries event density instead of forecast. /events uses
   *  this; /now leaves it undefined for the weather treatment. */
  eventCountByDate,
}: {
  hrefForDate?: (dateKey: string) => string;
  activeDateKey?: string;
  eventCountByDate?: Map<string, number>;
} = {}) {
  const now = new Date();
  // Pre-redesign the strip ran S-M-T-W-T-F-S with today in the middle,
  // so past days (S/M/T before today) had no weather since NWS only
  // gives forward forecast. The user wanted weather for every day in
  // the strip. Easy fix: start from today and run 7 days forward —
  // today on the LEFT, +6 days on the right. Every cell is then
  // covered by the 7-day NWS forecast.
  const todayKey = easternDateKey(now);

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
      {Array.from({ length: 7 }, (_, i) => {
        // Position 0 = today; positions 1..6 = today+1..today+6.
        // Past days are gone from the strip, so isPast is always
        // false — the dimming logic that used to apply to S/M/T
        // before today retires here.
        const offset = i;
        const cellDate = dateForOffset(now, offset);
        const cellDow = easternWeekday(cellDate);
        const letter = WEEKDAY_LETTERS[cellDow];
        const fullName = WEEKDAY_FULL[cellDow];
        const isPast = false;
        const dayNumber = easternDayNumber(now, offset);
        const dk = easternDateKey(cellDate);
        const info = dailyByDate.get(dk);
        const variant = info?.shortForecast ? iconForShortForecast(info.shortForecast) : null;
        const eventCount = eventCountByDate?.get(dk);
        const isToday = offset === 0;
        // "Active" day: caller-supplied (used by /events to highlight
        // the day they've filtered to) OR fall back to today.
        const isActive = activeDateKey
          ? dk === activeDateKey
          : isToday;
        const isTodayMarker = dk === todayKey;
        const href = hrefForDate?.(dk);
        // Same content inside Link vs div — Link gives client-side
        // navigation + prefetch when caller passes hrefForDate.
        const cellClass =
          "flex flex-col items-center gap-1 rounded-[var(--app-radius-sm)] py-1.5 " +
          (href ? "transition active:scale-[0.97] hover:bg-[var(--app-bg-sunken)]" : "");
        const cellStyle = {
          background: isActive
            ? "color-mix(in srgb, var(--app-brand) 6%, transparent)"
            : "transparent",
        };
        const ariaLabel = [
          `${fullName} ${dayNumber}`,
          isTodayMarker ? "today" : null,
          info?.high !== undefined ? `high ${info.high}` : null,
          info?.low !== undefined ? `low ${info.low}` : null,
          typeof eventCount === "number" ? `${eventCount} events` : null,
        ].filter(Boolean).join(", ");
        const inner = (
          <>
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.08em]"
              style={{
                color: isActive
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
                background: isTodayMarker
                  ? "var(--app-brand)"
                  : isActive
                    ? "color-mix(in srgb, var(--app-brand) 22%, transparent)"
                    : "transparent",
                color: isTodayMarker
                  ? "white"
                  : isActive
                    ? "var(--app-brand)"
                    : isPast
                      ? "var(--app-ink-3)"
                      : "var(--app-ink)",
                opacity: isPast ? 0.55 : 1,
                boxShadow: isTodayMarker ? "var(--app-shadow-1)" : "none",
              }}
            >
              {dayNumber}
            </span>
            {/* Bottom row — either an event-count badge (when the
                caller passes eventCountByDate) or the weather glyph
                + hi/lo combo from NWS. Past days render with reduced
                opacity since neither forecast nor future-event count
                applies backwards. */}
            {eventCountByDate ? (
              <span
                aria-hidden
                className="text-[10px] font-bold tabular-nums leading-tight"
                style={{
                  color: typeof eventCount === "number" && eventCount > 0
                    ? "var(--app-ink-2)"
                    : "var(--app-ink-3)",
                  opacity: isPast ? 0.4 : 1,
                  minHeight: 14,
                }}
              >
                {typeof eventCount === "number" && eventCount > 0 ? eventCount : "·"}
              </span>
            ) : variant ? (
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
              <div style={{ height: 32 }} aria-hidden />
            )}
          </>
        );
        return href ? (
          <Link
            key={i}
            href={href}
            aria-current={isActive ? "date" : undefined}
            aria-label={ariaLabel}
            className={cellClass}
            style={cellStyle}
          >
            {inner}
          </Link>
        ) : (
          <div
            key={i}
            aria-current={isActive ? "date" : undefined}
            aria-label={ariaLabel}
            className={cellClass}
            style={cellStyle}
          >
            {inner}
          </div>
        );
      })}
    </nav>
  );
}

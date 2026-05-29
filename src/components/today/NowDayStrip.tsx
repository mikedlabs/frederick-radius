import Link from "next/link";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import AnimatedSkyGlyph from "./AnimatedSkyGlyph";

/**
 * NowDayStrip — 7-day "here's the week, here's the weather" forecast.
 *
 * v3 (cohesion pass): the previous version stacked FOUR elements per
 * cell — weekday letter, a heavy filled day-number circle, a glyph, and
 * slashed "72°/50°" temps — across 7 columns. Four competing shapes ×
 * seven read as noise ("good data, messy layout") and the circles were
 * the loudest offender. This pass:
 *   - drops the calendar-number circle in WEATHER mode. For a forward
 *     7-day forecast the weekday IS the anchor (Apple Weather shows no
 *     date numbers either), so the row of heavy circles just went away.
 *   - unifies each cell to three calm elements: weekday → glyph →
 *     hi/lo with real hierarchy (hi bold ink, lo muted, no slash).
 *   - wraps the seven cells in ONE low-profile container so the strip
 *     reads as a single forecast module, not seven floating mini-cards.
 *   - trims ~20% of the vertical real estate.
 *
 * The /events date-picker mode (hrefForDate + eventCountByDate) still
 * needs the calendar number and a count badge, so that layout is kept.
 *
 * Server component; fetches NWS once per request (shared cache). Daily
 * forecast comes back as alternating day/night periods paired into
 * hi/lo per Eastern date. Fetch failure degrades to weekday-only cells.
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
  /** When set, every day cell wraps in a Link to this URL. Used by
   *  /events to make the day strip a temporal filter. */
  hrefForDate,
  /** Override which day reads as "active." /events passes the filtered
   *  day; /now leaves it undefined so today is active. */
  activeDateKey,
  /** When provided, the strip switches to EVENT mode: calendar number +
   *  per-day event-count badge instead of the weather forecast. */
  eventCountByDate,
}: {
  hrefForDate?: (dateKey: string) => string;
  activeDateKey?: string;
  eventCountByDate?: Map<string, number>;
} = {}) {
  const now = new Date();
  const todayKey = easternDateKey(now);
  // Weather mode is the /now default; event mode kicks in only when the
  // caller hands us a per-day count map (the /events date picker).
  const weatherMode = !eventCountByDate;

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
      // One low-profile container so the seven days read as a single
      // forecast module, matching the weather panel's card grammar
      // without becoming a heavy "big card."
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div className="grid grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => {
          const offset = i;
          const cellDate = dateForOffset(now, offset);
          const cellDow = easternWeekday(cellDate);
          const letter = WEEKDAY_LETTERS[cellDow];
          const fullName = WEEKDAY_FULL[cellDow];
          const dayNumber = easternDayNumber(now, offset);
          const dk = easternDateKey(cellDate);
          const info = dailyByDate.get(dk);
          const variant = info?.shortForecast ? iconForShortForecast(info.shortForecast) : null;
          const eventCount = eventCountByDate?.get(dk);
          const isToday = offset === 0;
          const isActive = activeDateKey ? dk === activeDateKey : isToday;
          const isTodayMarker = dk === todayKey;
          const href = hrefForDate?.(dk);

          const ariaLabel = [
            `${fullName} ${dayNumber}`,
            isTodayMarker ? "today" : null,
            info?.high !== undefined ? `high ${info.high}` : null,
            info?.low !== undefined ? `low ${info.low}` : null,
            typeof eventCount === "number" ? `${eventCount} events` : null,
          ].filter(Boolean).join(", ");

          const cellClass =
            "flex flex-col items-center gap-1.5 py-2.5 " +
            (href ? "transition active:scale-[0.97] hover:bg-[var(--app-bg-sunken)]" : "");
          const cellStyle = {
            // Today/active gets a quiet brand wash + a top accent rule
            // (drawn via inset box-shadow) instead of a heavy circle.
            background: isActive
              ? "color-mix(in srgb, var(--app-brand) 7%, transparent)"
              : "transparent",
            boxShadow: isActive ? "inset 0 2px 0 0 var(--app-brand)" : "none",
          };

          // Weekday label — brand on the active day, muted otherwise.
          const weekdayEl = (
            <span
              className="text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ color: isActive ? "var(--app-brand)" : "var(--app-ink-3)" }}
            >
              {letter}
            </span>
          );

          const inner = weatherMode ? (
            <>
              {weekdayEl}
              {variant ? (
                <AnimatedSkyGlyph variant={variant} size={22} />
              ) : (
                <div style={{ height: 22 }} aria-hidden />
              )}
              {/* hi over lo — hi bold ink, lo muted; no slash, aligned
                  baselines across the week so the row scans cleanly. */}
              {info?.high !== undefined || info?.low !== undefined ? (
                <span
                  aria-hidden
                  className="flex flex-col items-center leading-tight tabular-nums"
                >
                  {info?.high !== undefined && (
                    <span className="text-[12px] font-bold" style={{ color: "var(--app-ink)" }}>
                      {info.high}°
                    </span>
                  )}
                  {info?.low !== undefined && (
                    <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {info.low}°
                    </span>
                  )}
                </span>
              ) : (
                <div style={{ height: 26 }} aria-hidden />
              )}
            </>
          ) : (
            // EVENT mode — keep the calendar number (it's a date picker)
            // and a count badge, flattened to match the calmer cell.
            <>
              {weekdayEl}
              <span
                className="grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold tabular-nums"
                style={{
                  background: isTodayMarker
                    ? "var(--app-brand)"
                    : isActive
                      ? "color-mix(in srgb, var(--app-brand) 22%, transparent)"
                      : "transparent",
                  color: isTodayMarker ? "white" : isActive ? "var(--app-brand)" : "var(--app-ink)",
                }}
              >
                {dayNumber}
              </span>
              <span
                aria-hidden
                className="text-[10px] font-bold tabular-nums leading-tight"
                style={{
                  color:
                    typeof eventCount === "number" && eventCount > 0
                      ? "var(--app-ink-2)"
                      : "var(--app-ink-3)",
                  minHeight: 14,
                }}
              >
                {typeof eventCount === "number" && eventCount > 0 ? eventCount : "·"}
              </span>
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
      </div>
    </nav>
  );
}

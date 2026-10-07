"use client";

/**
 * EventWeekRibbon — a slim, whole-week-at-a-glance time axis for the top
 * of /events. The density trick: seven equal cells laid out on a single
 * `grid-cols-7` row, so the next seven days ALWAYS fit one screen-width
 * (no horizontal scroll, unlike the 14-day WeekStrip). Each cell is a
 * frosted chip carrying the weekday letter, the day numeral, and a small
 * event-count badge.
 *
 * Tapping a day deep-links the explorer to ?d=YYYY-MM-DD (the param
 * EventsExplorer honors), so the ribbon is a fast temporal filter, not
 * just decoration. Today/active days get a quiet brand wash.
 *
 * Controlled by EventsExplorer so a pick updates in place without a
 * navigation or remount. It sits directly under the date chip row (visual
 * first: the week reads before any sentence), and every day carries its real
 * count. Counts are the complete server-computed day summary, or the
 * complete filtered collection once one is loaded, never the bounded first
 * paint preview. `null` means a narrowed board is still loading: the cells
 * stay pickable but print no numbers rather than countywide ones.
 */

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

function easternDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

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

/** Eastern-wall date offset days from today, anchored at local noon so a
 *  UTC server never rolls the day over a DST/midnight boundary. */
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

export default function EventWeekRibbon({
  nowISO,
  countByDate,
  activeDay,
  onPickDay,
}: {
  nowISO: string;
  countByDate: Record<string, number> | null;
  activeDay: string | null;
  onPickDay: (day: string | null) => void;
}) {
  const now = new Date(nowISO);
  const countsKnown = countByDate !== null;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = dateForOffset(now, i);
    const key = easternDateKey(d);
    const dow = easternWeekday(d);
    return {
      key,
      letter: WEEKDAY_LETTERS[dow],
      full: WEEKDAY_FULL[dow],
      dom: Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          day: "numeric",
        }).format(d),
      ),
      isToday: i === 0,
      isWeekend: dow === 0 || dow === 6,
      count: countByDate?.[key] ?? 0,
    };
  });

  return (
    <nav
      aria-label="This week"
      // One frosted module — translucent fill + backdrop-blur + hairline
      // edge + a soft lift, matching the Saved page's fluid-card grammar.
      // The seven cells read as one ribbon, not seven floating tiles.
      className="grid grid-cols-7 overflow-hidden rounded-[var(--app-radius-lg)] backdrop-blur-md"
      style={{
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)",
      }}
    >
      {days.map((d, i) => {
        const isActive = activeDay ? d.key === activeDay : false;
        const highlighted = isActive || (!activeDay && d.isToday);
        const cellClass =
          "group flex flex-col items-center gap-1 py-2 transition active:scale-[0.96]";
        const cellStyle: React.CSSProperties = {
          // Today/active: quiet brand wash + a top accent rule via an
          // inset shadow. Hairline left dividers keep the seven cells
          // legible as a row without a heavy grid.
          background: highlighted
            ? "color-mix(in srgb, var(--app-brand) 8%, transparent)"
            : d.isWeekend
              ? "color-mix(in srgb, var(--app-cool) 4%, transparent)"
              : "transparent",
          boxShadow:
            [
              highlighted ? "inset 0 2px 0 0 var(--app-brand)" : null,
              i > 0 ? "inset 1px 0 0 0 var(--app-border)" : null,
            ]
              .filter(Boolean)
              .join(", ") || "none",
        };
        const ariaLabel = `${d.full} ${d.dom}${d.isToday ? ", today" : ""}${
          countsKnown ? `, ${d.count} ${d.count === 1 ? "event" : "events"}` : ""
        }`;
        const cellInner = (
          <>
            <span
              className="text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{
                color: highlighted
                  ? "var(--app-brand)"
                  : d.isWeekend
                    ? "var(--app-cool)"
                    : "var(--app-ink-3)",
              }}
            >
              {d.letter}
            </span>
            <span
              className="font-serif text-[17px] font-semibold leading-none tabular-nums"
              style={{ color: highlighted ? "var(--app-brand)" : "var(--app-ink)" }}
            >
              {d.dom}
            </span>
            {/* Every day prints its real count, so the week's shape reads
                at a glance: a filled pill on the highlighted day, quiet
                numerals elsewhere, and a muted dot when a day is honestly
                empty. While a narrowed board loads, the slot stays blank
                (same height) instead of showing countywide numbers. */}
            {!countsKnown ? (
              <span aria-hidden className="block h-4" />
            ) : d.count > 0 ? (
              <span
                className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums leading-[16px]"
                style={
                  highlighted
                    ? { background: "var(--app-brand-press)", color: "var(--app-on-brand)" }
                    : { color: "var(--app-ink-2)" }
                }
              >
                {d.count}
              </span>
            ) : (
              <span className="grid h-4 place-items-center" aria-hidden>
                <span
                  className="block h-[6px] w-[6px] rounded-full"
                  style={{ background: "color-mix(in srgb, var(--app-ink-3) 35%, transparent)" }}
                />
              </span>
            )}
          </>
        );
        return (
          <button
            key={d.key}
            type="button"
            aria-pressed={isActive}
            aria-label={ariaLabel}
            onClick={() => onPickDay(isActive ? null : d.key)}
            className={cellClass}
            style={cellStyle}
          >
            {cellInner}
          </button>
        );
      })}
    </nav>
  );
}

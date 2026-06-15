import Link from "next/link";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * EventWeekRibbon — a slim, whole-week-at-a-glance time axis for the top
 * of /events. The density trick: seven equal cells laid out on a single
 * `grid-cols-7` row, so the next seven days ALWAYS fit one screen-width
 * (no horizontal scroll, unlike the 14-day WeekStrip). Each cell is a
 * frosted chip carrying the weekday letter, the day numeral, and a small
 * event-count badge.
 *
 * Tapping a day deep-links the explorer to ?d=YYYY-MM-DD (the param the
 * page + EventsExplorer already honor), so the ribbon is a fast temporal
 * filter, not just decoration. Today/active days get a quiet brand wash.
 *
 * Server component. Pure data: counts come from the same `allEvents`
 * list the explorer renders — no day shows a fabricated number, and an
 * empty day honestly shows a muted dot rather than "0".
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
  events,
  activeDay,
}: {
  events: EventWithMeta[];
  /** The currently deep-linked day (?d=), if any. */
  activeDay?: string;
}) {
  const now = new Date();
  const todayKey = easternDateKey(now);

  // Per-Eastern-day event count, computed once from the public set.
  const countByDate = new Map<string, number>();
  for (const e of events) {
    const k = easternDateKey(new Date(e.starts_at));
    countByDate.set(k, (countByDate.get(k) ?? 0) + 1);
  }

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
      count: countByDate.get(key) ?? 0,
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
        // Active toggles off (back to /events); else deep-links the day.
        const href = isActive ? "/events" : `/events?d=${d.key}`;
        const highlighted = isActive || (!activeDay && d.isToday);
        return (
          <Link
            key={d.key}
            href={href}
            scroll={false}
            aria-current={isActive ? "date" : undefined}
            aria-label={`${d.full} ${d.dom}${d.isToday ? ", today" : ""}, ${d.count} ${d.count === 1 ? "event" : "events"}`}
            className="group flex flex-col items-center gap-1 py-2 transition active:scale-[0.96]"
            style={{
              // Today/active: quiet brand wash + a top accent rule via an
              // inset shadow. Hairline left dividers keep the seven cells
              // legible as a row without a heavy grid.
              background: highlighted
                ? "color-mix(in srgb, var(--app-brand) 8%, transparent)"
                : d.isWeekend
                  ? "color-mix(in srgb, var(--app-cool) 4%, transparent)"
                  : "transparent",
              boxShadow: [
                highlighted ? "inset 0 2px 0 0 var(--app-brand)" : null,
                i > 0 ? "inset 1px 0 0 0 var(--app-border)" : null,
              ]
                .filter(Boolean)
                .join(", ") || "none",
            }}
          >
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
            {/* The ribbon is a date picker, not a tally grid. Today keeps
                its count (the one day the exact number helps); every other
                day is a presence DOT — brand-tinted when something's on, a
                muted dot when it's honestly empty. Same slot, calm baseline. */}
            {d.count > 0 && d.key === todayKey ? (
              <span
                className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums leading-[16px]"
                style={{ background: "var(--app-brand)", color: "white" }}
              >
                {d.count}
              </span>
            ) : (
              <span
                aria-hidden
                className="block h-[6px] w-[6px] rounded-full"
                style={{
                  background:
                    d.count > 0
                      ? "color-mix(in srgb, var(--app-brand) 55%, transparent)"
                      : "color-mix(in srgb, var(--app-ink-3) 35%, transparent)",
                }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

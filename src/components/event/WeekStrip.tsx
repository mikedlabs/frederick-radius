import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * Date rail — the time axis of /events, redesigned to read continuous
 * instead of as a row of identical Windows-8 tiles.
 *
 * Each day is a thin column showing:
 *   • day-of-week letter (S M T W T F S) at the top
 *   • the day numeral, set big and centered
 *   • a vertical "activity bar" underneath whose height encodes event
 *     count (0–10+) and whose color comes from the dominant category
 *     of that day, so the rail visually breathes: quiet midweek days
 *     are small ticks, festival days are tall colored bars.
 *
 * Today's column gets a soft brand pill behind the numeral; the
 * active (?d=) column gets a stroked pill. Weekend columns are tinted
 * very subtly so the leisure window reads as a coherent block without
 * a sharp Sat/Sun border.
 *
 * Server component. Pre-computes day counts + dominant category from
 * the same `allEvents` list the explorer uses. Tapping a column jumps
 * the explorer to that day (?d=YYYY-MM-DD).
 */

const RAIL_DAYS = 14;

function dayKeyEastern(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function easternToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map((s) => parseInt(s, 10));
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function dominantCategory(events: EventWithMeta[]): string | undefined {
  if (events.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const e of events) {
    const slug = e.category || "default";
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  let bestSlug = "default";
  let bestN = -1;
  for (const [slug, n] of counts) {
    if (n > bestN) {
      bestN = n;
      bestSlug = slug;
    }
  }
  return CATEGORY_BY_SLUG[bestSlug]?.color ?? "var(--app-cool)";
}

export default function WeekStrip({
  events,
  activeDay,
}: {
  events: EventWithMeta[];
  activeDay?: string;
}) {
  const base = easternToday();

  const byKey = new Map<string, EventWithMeta[]>();
  for (const e of events) {
    const k = dayKeyEastern(e.starts_at);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(e);
  }

  const days = Array.from({ length: RAIL_DAYS }, (_, i) => {
    const d = new Date(base.getTime() + i * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const dow = d.getUTCDay();
    const list = byKey.get(key) ?? [];
    return {
      iso: key,
      dowLetter: ["S", "M", "T", "W", "T", "F", "S"][dow],
      dom: parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          day: "numeric",
        }).format(d),
        10,
      ),
      monthShort: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
      }).format(d),
      isToday: i === 0,
      isFirstOfMonth:
        parseInt(
          new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(d),
          10,
        ) === 1,
      isWeekend: dow === 0 || dow === 6,
      count: list.length,
      barColor: dominantCategory(list) ?? "var(--app-border)",
    };
  });

  // Normalize the activity bar against the busiest day in the window.
  
  return (
    <section aria-label="Next two weeks" className="relative -mx-4 px-4">
      {/* Simplified rail — owner feedback was the bars + count
          numbers below each date read as visual noise. Each day is
          now just three things: day-of-week letter, the numeral in
          a soft pill, and a single colored dot under it if there's
          any event (sized + colored by activity level, dominant
          category). Quiet days have no dot at all — honest empty. */}
      <div className="shelf-rail gap-0 pb-1">
        {days.map((d, i) => {
          const isActive = activeDay === d.iso;
          const href = isActive ? "/events" : `/events?d=${d.iso}`;
          const pillBg = isActive
            ? "var(--app-brand)"
            : d.isToday
              ? "color-mix(in srgb, var(--app-brand) 18%, transparent)"
              : "transparent";
          const pillRing = isActive
            ? "none"
            : d.isToday
              ? "inset 0 0 0 1.5px var(--app-brand)"
              : "none";
          // Activity dot — three sizes: light (1-2), medium (3-5),
          // heavy (6+). One small dot reads as the day's pulse without
          // demanding the eye linger on a numeric count.
          const dotSize = d.count === 0 ? 0 : d.count >= 6 ? 8 : d.count >= 3 ? 6 : 4;
          return (
            <a
              key={d.iso}
              href={href}
              aria-current={isActive ? "date" : undefined}
              aria-label={`${d.monthShort} ${d.dom}, ${d.count} ${d.count === 1 ? "event" : "events"}`}
              className="group relative flex w-12 shrink-0 flex-col items-center pt-1.5 pb-2 sm:w-14"
              style={{
                background: d.isWeekend
                  ? "color-mix(in srgb, var(--app-cool) 5%, transparent)"
                  : "transparent",
              }}
            >
              {/* dow letter / month marker */}
              <span
                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{
                  color: d.isToday
                    ? "var(--app-brand)"
                    : d.isWeekend
                      ? "var(--app-cool)"
                      : "var(--app-ink-3)",
                }}
              >
                {d.isFirstOfMonth && !d.isToday ? d.monthShort.toUpperCase() : d.dowLetter}
              </span>
              {/* numeral, in the active/today pill */}
              <span
                className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full font-serif text-[18px] font-semibold tabular-nums transition group-active:scale-[0.92]"
                style={{
                  background: pillBg,
                  boxShadow: pillRing,
                  color: isActive
                    ? "white"
                    : d.isToday
                      ? "var(--app-brand)"
                      : "var(--app-ink)",
                }}
              >
                {d.dom}
              </span>
              {/* Activity dot — single sized circle, color from the
                  day's dominant category. Empty days reserve the same
                  spatial slot (height: 8px) so the rail rhythm holds
                  but show nothing in it. */}
              <span
                aria-hidden
                className="mt-2 grid h-2 items-center"
              >
                {d.count > 0 && (
                  <span
                    className="block rounded-full"
                    style={{
                      width: `${dotSize}px`,
                      height: `${dotSize}px`,
                      background: d.barColor,
                    }}
                  />
                )}
              </span>
              {/* Hairline separator between weeks. */}
              {i > 0 && i % 7 === 0 && (
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-0 w-px"
                  style={{ background: "var(--app-border)" }}
                />
              )}
            </a>
          );
        })}
      </div>
      {/* Right-edge scroll affordance — same paper-fade + chevron
          pattern as the Tonight rail, so the user always sees
          "there's more this way." Visible only when there are more
          days than fit on screen (always true at 14 days × 12 px). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-14 items-center justify-end pr-2 [@media(hover:hover)]:flex"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--app-bg) 60%, transparent) 50%, var(--app-bg) 100%)",
        }}
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-full"
          style={{
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-edge), var(--app-hi)",
            color: "var(--app-ink-2)",
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>→</span>
        </span>
      </div>
    </section>
  );
}

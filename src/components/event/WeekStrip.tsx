import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * 7-day calendar strip — the time-axis of /events.
 *
 * Each tile is one day with the date, a small stack of category dots
 * keyed off the events scheduled (up to 4), and a count pill. Today
 * gets a brand-tinted glow; weekend days get a cool accent so the
 * Fri/Sat/Sun trio reads as the leisure window at a glance. Active
 * (?d=) tile gets a thicker accent ring + a left color stripe so it
 * looks like a real selected state, not just a hover.
 *
 * Pure server component: pre-computes day counts + category mix from
 * the same `allEvents` list the explorer uses. Tapping a tile jumps
 * the explorer to that day (?d=YYYY-MM-DD).
 */

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

/** Top 4 distinct category dots for a given day — shows the
 *  *texture* of the day (a music + arts + market day visually differs
 *  from a 3-government-meeting day). */
function categoryMix(events: EventWithMeta[]): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const e of events) {
    const slug = e.category || "default";
    if (seen.has(slug)) continue;
    seen.add(slug);
    const color = CATEGORY_BY_SLUG[slug]?.color ?? "var(--app-ink-3)";
    colors.push(color);
    if (colors.length === 4) break;
  }
  return colors;
}

export default function WeekStrip({
  events,
  activeDay,
}: {
  events: EventWithMeta[];
  activeDay?: string;
}) {
  const base = easternToday();

  // Bucket events per day for O(N) lookup of count + category mix.
  const byKey = new Map<string, EventWithMeta[]>();
  for (const e of events) {
    const k = dayKeyEastern(e.starts_at);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(e);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
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
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : new Intl.DateTimeFormat("en-US", {
                timeZone: "America/New_York",
                weekday: "short",
              }).format(d),
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
      isWeekend: dow === 0 || dow === 6,
      count: list.length,
      mix: categoryMix(list),
    };
  });

  return (
    <section aria-label="Next seven days" className="-mx-4 px-4">
      <div className="shelf-rail gap-2 pb-1">
        {days.map((d) => {
          const isActive = activeDay === d.iso;
          const accent = d.isToday
            ? "var(--app-brand)"
            : d.isWeekend
              ? "var(--app-cool)"
              : "var(--app-ink-3)";
          const href = isActive ? "/events" : `/events?d=${d.iso}`;
          return (
            <a
              key={d.iso}
              href={href}
              aria-pressed={isActive}
              className={`tactile tactile-interactive relative flex w-[78px] shrink-0 flex-col items-center overflow-hidden rounded-[var(--app-radius-md)] py-2.5 ${
                isActive || d.isToday ? "tactile-glow-brand" : ""
              }`}
              style={{
                background: isActive
                  ? `color-mix(in srgb, ${accent} 28%, var(--app-bg-elevated))`
                  : d.isToday
                    ? `color-mix(in srgb, ${accent} 14%, var(--app-bg-elevated))`
                    : d.isWeekend
                      ? `color-mix(in srgb, ${accent} 7%, var(--app-bg-elevated))`
                      : "var(--app-bg-elevated)",
              }}
            >
              {/* Left accent stripe for the selected/today tile —
                  reads as a real selected state, not just a hover. */}
              {(isActive || d.isToday) && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ background: accent }}
                />
              )}
              <span
                className="text-[9px] font-bold uppercase tracking-[0.1em]"
                style={{ color: accent }}
              >
                {d.label}
              </span>
              <span
                className="font-serif text-[26px] font-semibold leading-none tabular-nums"
                style={{
                  color: isActive || d.isToday ? accent : "var(--app-ink)",
                }}
              >
                {d.dom}
              </span>
              <span
                className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {d.monthShort}
              </span>

              {/* Category mix — up to 4 colored dots showing the texture
                  of the day. A music + arts + market day reads visually
                  different from a 3-government-meeting day. */}
              <div className="mt-1.5 flex h-[6px] items-center gap-[3px]" aria-hidden>
                {d.mix.length > 0 ? (
                  d.mix.map((c, idx) => (
                    <span
                      key={idx}
                      className="block h-[6px] w-[6px] rounded-full"
                      style={{ background: c, boxShadow: `0 0 6px ${c}` }}
                    />
                  ))
                ) : (
                  <span
                    className="block h-[6px] w-[6px] rounded-full"
                    style={{ background: "var(--app-border)" }}
                  />
                )}
              </div>

              <span
                className="mt-1 rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                style={{
                  background:
                    d.count > 0
                      ? `color-mix(in srgb, ${accent} 22%, transparent)`
                      : "transparent",
                  color: d.count > 0 ? accent : "var(--app-ink-3)",
                }}
              >
                {d.count > 0 ? d.count : "—"}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

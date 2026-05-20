import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * 7-day mini week strip — gives /events a horizontal time axis you
 * can scan in a glance. Each tile is a day with the count of events
 * starting that day. Today gets a brand-tinted highlight; weekend
 * days get a soft accent so Saturday/Sunday stand out.
 *
 * Pure server component: pre-computes counts from the same
 * `allEvents` list the explorer uses. Tapping a tile takes the user
 * to /events with a date filter (the explorer reads ?d= on mount).
 * Until that wire-up lands the tile is decorative + an anchor link;
 * the data shape is here so it can light up in one edit.
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
  // A Date in America/New_York midnight — only used to label tiles.
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

export default function WeekStrip({
  events,
}: {
  events: EventWithMeta[];
}) {
  const base = easternToday();
  const days: Array<{
    iso: string;
    key: string;
    label: string;
    dom: number;
    isToday: boolean;
    isWeekend: boolean;
    count: number;
  }> = [];

  // Index counts per day-key for O(N) lookup.
  const byKey = new Map<string, number>();
  for (const e of events) {
    const k = dayKeyEastern(e.starts_at);
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const dow = d.getUTCDay(); // 0..6 Sun..Sat in UTC; today's base is UTC midnight EST so this is correct
    days.push({
      iso: key,
      key,
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
      isToday: i === 0,
      isWeekend: dow === 0 || dow === 6,
      count: byKey.get(key) ?? 0,
    });
  }

  return (
    <section aria-label="Next seven days" className="-mx-4 px-4">
      <div className="shelf-rail gap-2 pb-1">
        {days.map((d) => {
          const accent = d.isToday
            ? "var(--app-brand)"
            : d.isWeekend
              ? "var(--app-cool)"
              : "var(--app-ink-3)";
          return (
            <a
              key={d.key}
              href={`/events?d=${d.iso}`}
              className={`tactile tactile-interactive flex w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-md)] py-2 ${
                d.isToday ? "tactile-glow-brand" : ""
              }`}
              style={{
                background: d.isToday
                  ? "color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated))"
                  : "var(--app-bg-elevated)",
              }}
            >
              <span
                className="text-[9px] font-bold uppercase tracking-[0.1em]"
                style={{ color: accent }}
              >
                {d.label}
              </span>
              <span
                className="font-serif text-[22px] font-semibold leading-none tabular-nums"
                style={{ color: d.isToday ? "var(--app-brand)" : "var(--app-ink)" }}
              >
                {d.dom}
              </span>
              <span
                className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                style={{
                  background:
                    d.count > 0
                      ? `color-mix(in srgb, ${accent} 18%, transparent)`
                      : "transparent",
                  color: d.count > 0 ? accent : "var(--app-ink-3)",
                }}
              >
                {d.count > 0 ? `${d.count} event${d.count === 1 ? "" : "s"}` : "—"}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

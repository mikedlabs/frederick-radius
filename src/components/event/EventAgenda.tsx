import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { EventWithMeta } from "@/lib/loaders/events";
import EmptyState from "@/components/ui/EmptyState";

/**
 * A mobile agenda — the calendar that actually helps on a phone. Only
 * days that have something, in order, the next few weeks, each day a
 * scannable list of times. No sparse month grid of empty cells.
 */

function nyParts(iso: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    label: `${get("month")} ${get("day")}`,
  };
}

function nyTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(" ", "")
    .toLowerCase();
}

type Day = { key: string; weekday: string; label: string; events: EventWithMeta[] };

export default function EventAgenda({
  events,
  nowMs,
  maxDays = 24,
}: {
  events: EventWithMeta[];
  /** "now" passed in (server-computed) so render stays pure. */
  nowMs: number;
  maxDays?: number;
}) {
  const now = nowMs;
  const byKey = new Map<string, Day>();
  for (const e of [...events].sort(
    (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
  )) {
    if (+new Date(e.starts_at) < now - 12 * 3_600_000) continue; // skip stale
    const np = nyParts(e.starts_at);
    let d = byKey.get(np.key);
    if (!d) {
      d = { key: np.key, weekday: np.weekday, label: np.label, events: [] };
      byKey.set(np.key, d);
    }
    d.events.push(e);
  }
  const days = [...byKey.values()].slice(0, maxDays);

  if (days.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nothing on the calendar in this range."
        body="Try a wider time window from the chips above, or jump to the weekend."
        cta={{ label: "See this weekend", href: "/events?lens=weekend" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {days.map((d) => (
        <section key={d.key}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <h3 className="font-serif text-base font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              {d.weekday} · {d.label}
            </h3>
            <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {d.events.length} {d.events.length === 1 ? "event" : "events"}
            </span>
          </div>
          <ul
            className="overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            {d.events.map((e, i) => {
              const cat = CATEGORY_BY_SLUG[e.category];
              return (
                <li
                  key={e.slug}
                  className={i > 0 ? "border-t" : ""}
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <Link
                    href={`/events/${e.slug}`}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--app-bg-sunken)]"
                  >
                    <span
                      className="w-14 shrink-0 text-[12px] font-semibold tabular-nums"
                      style={{ color: "var(--app-brand)" }}
                    >
                      {nyTime(e.starts_at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                        {e.title}
                      </span>
                      <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                        {e.venue_name}
                      </span>
                    </span>
                    {cat && (
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: cat.color }}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

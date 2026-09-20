import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDecisionLocation } from "@/lib/events/decision-facts";
import { eventDateBlock, formatEventWhen } from "@/lib/events/format";
import { isDateOnlyEventAnchor, isEventEnded } from "@/lib/eventWhenLabel";
import { isRangeListing, RANGE_LISTING_STALE_AFTER_MS } from "@/lib/eventHorizon";
import { easternDayKey } from "@/lib/tz";

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

type Day = { key: string; heading: string; ongoing?: boolean; events: EventWithMeta[] };

/** A continuing date range is not an appointment on its past opening day. */
export function eventAgendaGroups(events: readonly EventWithMeta[], nowMs: number, maxDays = 24): Day[] {
  const now = new Date(nowMs);
  const today = easternDayKey(now);
  const byKey = new Map<string, Day>();
  const ongoing: EventWithMeta[] = [];
  for (const event of [...events].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  )) {
    // The 8-hour live-session cap does not describe an exhibit's date range.
    // Match the shared horizon rule without claiming it is open right now.
    if (isRangeListing(event)) {
      if (
        Date.parse(event.ends_at) < nowMs ||
        nowMs - Date.parse(event.starts_at) > RANGE_LISTING_STALE_AFTER_MS
      ) continue;
    } else if (isEventEnded(event, now)) continue;
    if (
      (isRangeListing(event) || event.is_all_day) &&
      easternDayKey(new Date(event.starts_at)) < today
    ) {
      ongoing.push(event);
      continue;
    }
    const date = nyParts(event.starts_at);
    let group = byKey.get(date.key);
    if (!group) {
      group = { key: date.key, heading: `${date.weekday} · ${date.label}`, events: [] };
      byKey.set(date.key, group);
    }
    group.events.push(event);
  }
  const groups = [...byKey.values()].slice(0, maxDays);
  if (ongoing.length > 0) {
    groups.push({
      key: "ongoing",
      heading: "Ongoing listings",
      ongoing: true,
      events: ongoing.sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at)),
    });
  }
  return groups;
}

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
  const days = eventAgendaGroups(events, nowMs, maxDays);

  if (days.length === 0) {
    return (
      <div className="space-y-4">
        <div className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-4">
            <span
              aria-hidden
              className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-ink-3) 15%, var(--app-bg-sunken))",
                color: "var(--app-ink-2)",
              }}
            >
              <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h3 className="font-serif text-[18px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
              No events found.
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
              We don&apos;t have anything on the calendar for this exact window. Try one of these instead:
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/events?lens=weekend", label: "This weekend" },
              { href: "/events?lens=all", label: "All upcoming events" },
              { href: "/open-now", label: "Open now" },
              { href: "/pulse", label: "Live pulse" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="tactile-interactive flex min-h-[44px] items-center justify-center rounded-[var(--app-radius-md)] border bg-[var(--app-bg-surface)] px-3 text-center text-[12.5px] font-semibold shadow-sm transition hover:scale-[1.02] active:scale-95"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((d) => (
        <section key={d.key}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <h3 className="font-serif text-base font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              {d.heading}
            </h3>
            <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {d.events.length} {d.events.length === 1 ? "event" : "events"}
            </span>
          </div>
          {d.ongoing ? (
            <p className="mb-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              These listings span several days. Check the publisher for individual dates and opening hours.
            </p>
          ) : null}
          <ul
            className="overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            {d.events.map((e, i) => {
              const cat = CATEGORY_BY_SLUG[e.category];
              return (
                <li
                  key={`${e.slug}-${e.starts_at}`}
                  className={i > 0 ? "border-t" : ""}
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <Link
                    href={`/events/${e.slug}`}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--app-bg-sunken)]"
                  >
                    <span
                      className="w-14 shrink-0 text-[12px] font-semibold tabular-nums"
                      style={{ color: "var(--app-brand-press)" }}
                    >
                      {d.ongoing
                        ? "Date range"
                        : e.is_all_day || isDateOnlyEventAnchor(e) || isRangeListing(e)
                          ? eventDateBlock(e).time
                          : nyTime(e.starts_at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                        {e.title}
                      </span>
                      <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                        {eventDecisionLocation(e)}
                      </span>
                      {d.ongoing ? (
                        <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                          {formatEventWhen(e)}
                        </span>
                      ) : null}
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

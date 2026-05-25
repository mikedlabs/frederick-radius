import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarDays, CalendarRange, DollarSign } from "lucide-react";
import EventCard from "./EventCard";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * EventsCompartmented — replaces the long single-list view with
 * three time-bucketed "rooms" plus one filter slice (Free this
 * week). Each section caps at four tiles and links out to the full
 * filtered list for power users who want the long view.
 *
 * The brief from the owner: "it feels like a directory. I get lost
 * in long lists." Compartments turn the page into rooms a visitor
 * can walk into instead of an endless scroll: open the door, see
 * what's in the room, leave or drill in. The full filter explorer
 * still lives below for the "I know what I want" case.
 *
 * Pure server component. Buckets are computed from a single sorted
 * events list passed in, against fixed window props.
 */

const TILE_CAP = 4; // four per section keeps each "room" a glance, not a scroll

type Bucket = {
  key: string;
  title: string;
  blurb: string;
  icon: typeof CalendarClock;
  events: EventWithMeta[];
  total: number;
  /** Deep-link to the full filtered list on this lens. */
  href: string;
};

export default function EventsCompartmented({
  events,
  nowISO,
  tomorrowEndISO,
  weekendStartISO,
  weekendEndISO,
  weekEndISO,
}: {
  events: EventWithMeta[];
  nowISO: string;
  tomorrowEndISO: string;
  weekendStartISO: string;
  weekendEndISO: string;
  weekEndISO: string;
}) {
  const now = Date.parse(nowISO);
  const tomorrowEnd = Date.parse(tomorrowEndISO);
  const friday = Date.parse(weekendStartISO);
  const monday = Date.parse(weekendEndISO);
  const weekEnd = Date.parse(weekEndISO);

  // Tomorrow: events between now+6h and tomorrow-end. Skips the
  // "tonight" window since TonightRail above already carries it as
  // a magazine marquee — no need to repeat the next-3-hours list.
  const tomorrow = events.filter((e) => {
    const t = Date.parse(e.starts_at);
    return t > now + 6 * 3600_000 && t <= tomorrowEnd;
  });

  // This weekend: Friday 5 PM through Monday 00:00 ET (the page's
  // server-computed boundaries). If today IS the weekend, this list
  // includes today's remaining events too.
  const weekend = events.filter((e) => {
    const t = Date.parse(e.starts_at);
    return t >= Math.max(now, friday) && t < monday;
  });

  // Next 7 days: after the weekend, through 7 days out. Skipped if
  // we're mid-week — the weekend bucket covers it.
  const week = events.filter((e) => {
    const t = Date.parse(e.starts_at);
    return t >= monday && t <= weekEnd;
  });

  // Free events this week — a "filter slice" room. The user asks
  // "what's worth my time tonight without paying" and the answer
  // shouldn't require digging.
  const free = events.filter((e) => {
    const t = Date.parse(e.starts_at);
    return e.is_free && t >= now && t <= weekEnd;
  });

  const buckets: Bucket[] = [
    {
      key: "tomorrow",
      title: "Tomorrow",
      blurb: "What's on through tomorrow",
      icon: CalendarClock,
      events: tomorrow.slice(0, TILE_CAP),
      total: tomorrow.length,
      href: "/events?lens=tomorrow",
    },
    {
      key: "weekend",
      title: "This weekend",
      blurb: "Friday evening through Sunday",
      icon: CalendarRange,
      events: weekend.slice(0, TILE_CAP),
      total: weekend.length,
      href: "/events?lens=weekend",
    },
    {
      key: "week",
      title: "Next 7 days",
      blurb: "After the weekend, through next week",
      icon: CalendarDays,
      events: week.slice(0, TILE_CAP),
      total: week.length,
      href: "/events?lens=week",
    },
    {
      key: "free",
      title: "Free this week",
      blurb: "Worth your time without your wallet",
      icon: DollarSign,
      events: free.slice(0, TILE_CAP),
      total: free.length,
      href: "/events?free=1",
    },
  ].filter((b) => b.events.length > 0);

  if (buckets.length === 0) return null;

  return (
    <div className="space-y-7">
      {buckets.map((b) => {
        const Icon = b.icon;
        return (
          <section key={b.key} className="space-y-2.5" aria-label={b.title}>
            {/* Section header — left-aligned, brick-color icon stamp,
                serif title, blurb under it, "See all (n) →" on the
                right. Reads as a chapter heading, not a list label. */}
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background:
                      "color-mix(in srgb, var(--app-brand) 12%, var(--app-bg-elevated))",
                    boxShadow: "var(--app-edge), var(--app-hi)",
                    color: "var(--app-brand)",
                  }}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <div>
                  <h2
                    className="font-serif text-[20px] font-semibold leading-tight tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {b.title}
                  </h2>
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {b.blurb}
                  </p>
                </div>
              </div>
              <Link
                href={b.href}
                className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold"
                style={{ color: "var(--app-brand)" }}
                aria-label={`See all ${b.total} ${b.title.toLowerCase()} events`}
              >
                See all {b.total}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </div>

            {/* 2-up tile grid. TILE_CAP=4 keeps each section a single
                glance — two rows on mobile, one row on tablet+. */}
            <div className="grid grid-cols-2 gap-2.5">
              {b.events.map((e) => (
                <EventCard key={e.slug} event={e} variant="tile" />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

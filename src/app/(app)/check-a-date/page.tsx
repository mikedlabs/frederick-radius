import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarSearch } from "lucide-react";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { easternDayKey } from "@/lib/tz";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";

/**
 * /check-a-date — the organizer's question, answered.
 *
 * Beta feedback (July 2026, from a Frederick event organizer): the hardest
 * part of planning a gala or fundraiser is knowing what's ALREADY happening
 * on the dates you're considering — "there's no central calendar and you
 * have to reach out." This page is that central answer: pick any date, see
 * everything on the wire for it, plus the surrounding two weeks so a light
 * Friday or Saturday is easy to spot.
 *
 * It is also the honest front door for the submission flywheel: organizers
 * who come to check a date are exactly the people whose events we can't
 * ingest (private channels, late announcements), so the page ends with the
 * add-your-event door rather than burying it.
 *
 * No client JS: the date input rides a GET form, so the page works
 * everywhere and stays a server component over the same 5-minute-cached
 * unified set /events and /today read. Dynamic by virtue of searchParams.
 */

export const metadata: Metadata = {
  title: "Check a date",
  description:
    "Planning an event around Frederick? Pick a date and see everything already scheduled that day before you set yours.",
  alternates: { canonical: "/check-a-date" },
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format an Eastern YYYY-MM-DD key for humans without timezone drift:
 *  anchor the Date at UTC noon so the day never shifts. */
function labelFor(key: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(
    new Date(`${key}T12:00:00Z`),
  );
}

/** The YYYY-MM-DD key `offset` days from the given key (pure calendar math). */
function shiftKey(key: string, offset: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default async function CheckADatePage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const now = new Date();
  const todayKey = easternDayKey(now);
  const picked = d && DAY_RE.test(d) ? d : null;

  // One pass over the unified set: per-day counts for the strip and the
  // picked day's own list. Only load it when a date is actually picked.
  let dayEvents: Awaited<ReturnType<typeof assembleUnifiedEvents>>["publicEvents"] = [];
  const counts = new Map<string, number>();
  if (picked) {
    const { publicEvents } = await assembleUnifiedEvents(now);
    for (const e of publicEvents) {
      const key = easternDayKey(new Date(e.starts_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    dayEvents = publicEvents
      .filter((e) => easternDayKey(new Date(e.starts_at)) === picked)
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }

  // The surrounding fortnight, centered a bit ahead of the picked day so
  // "is the NEXT Friday lighter?" is answerable at a glance.
  const strip = picked
    ? Array.from({ length: 15 }, (_, i) => shiftKey(picked, i - 4))
    : [];

  return (
    <div className="relative mx-auto max-w-md space-y-5 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/events"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          The events board
        </Link>
      </nav>

      <header>
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            For event planners
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {labelFor(todayKey, { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Check a date{" "}
          <span className="font-serif italic font-normal" style={{ color: "var(--app-ink-3)" }}>
            before you set yours
          </span>
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Pick a day and see what&rsquo;s already on the county calendar, with
          the days around it for comparing Fridays and Saturdays.
        </p>
      </header>

      {/* GET form: works with zero client JS, and the picked date lives in
          the URL so a "does Nov 14 work?" link is shareable with a board. */}
      <form
        method="get"
        className="flex items-end gap-2 rounded-[var(--app-radius-lg)] border p-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Date
          </span>
          <input
            type="date"
            name="d"
            defaultValue={picked ?? ""}
            min={todayKey}
            required
            className="h-11 w-full rounded-[var(--app-radius-md)] border px-3 text-[15px] outline-none"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg)", color: "var(--app-ink)" }}
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-11 items-center gap-1.5 rounded-[var(--app-radius-md)] px-4 text-[14px] font-semibold text-white"
          style={{ background: "var(--app-brand)" }}
        >
          <CalendarSearch className="h-4 w-4" strokeWidth={2} aria-hidden />
          Check
        </button>
      </form>

      {picked && (
        <>
          {/* The fortnight strip — counts per day, weekends set in ink so a
              light Friday stands out. Each cell re-checks that day. */}
          <section aria-label="Nearby days">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {strip.map((key) => {
                const n = counts.get(key) ?? 0;
                const isPicked = key === picked;
                const wd = labelFor(key, { weekday: "short" });
                const isWeekend = wd === "Fri" || wd === "Sat" || wd === "Sun";
                return (
                  <Link
                    key={key}
                    href={`/check-a-date?d=${key}`}
                    aria-current={isPicked ? "date" : undefined}
                    className="flex min-w-[52px] flex-col items-center rounded-[var(--app-radius-md)] border px-1.5 py-2"
                    style={{
                      borderColor: isPicked ? "var(--app-brand)" : "var(--app-border)",
                      background: isPicked ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))" : "var(--app-bg-elevated)",
                    }}
                  >
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: isWeekend ? "var(--app-ink)" : "var(--app-ink-3)", fontWeight: isWeekend ? 700 : 500 }}>
                      {wd}
                    </span>
                    <span className="font-serif text-[16px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                      {labelFor(key, { day: "numeric" })}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: n > 0 ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>
                      {n}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section aria-label="Events on the picked day" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {labelFor(picked, { weekday: "long", month: "long", day: "numeric" })}
              </h2>
              <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {dayEvents.length} on the wire
              </span>
            </div>

            {dayEvents.length > 0 ? (
              <ul className="space-y-2.5">
                {dayEvents.slice(0, 20).map((e) => (
                  <li key={`${e.slug}-${e.starts_at}`}>
                    <EventCard event={e} variant="glance" />
                  </li>
                ))}
                {dayEvents.length > 20 && (
                  <li className="text-center text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    <Link href={`/events?d=${picked}`} className="underline">
                      All {dayEvents.length} on the board →
                    </Link>
                  </li>
                )}
              </ul>
            ) : (
              <p
                className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[13px]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                Nothing on the wire for this day yet.
              </p>
            )}

            {/* The honest caveat + the flywheel door. A quiet day is a good
                sign, not a guarantee - say so plainly. */}
            <div
              className="rounded-[var(--app-radius-md)] border p-3 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
            >
              A quiet day here is a good sign, not a promise. Some events
              publish late or spread through private channels before they hit
              any public calendar. When yours is set,{" "}
              <Link href="/submit/event" className="underline" style={{ color: "var(--app-brand-press)" }}>
                add it here
              </Link>{" "}
              so the next planner sees it.
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-semibold">
              <Link href={`/events?d=${picked}`} style={{ color: "var(--app-brand-press)" }}>
                See this day on the board →
              </Link>
              <Link href="/submit/event" style={{ color: "var(--app-ink-3)" }}>
                Add your event
              </Link>
            </div>
          </section>
        </>
      )}

      {!picked && (
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          Counts come from the same live wire as the events board: town
          calendars, venues, ticket feeds, and curated listings, refreshed
          through the day.
        </p>
      )}
    </div>
  );
}

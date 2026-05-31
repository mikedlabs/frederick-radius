import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import EventCard from "@/components/event/EventCard";
import { eventDateBlock } from "@/lib/loaders/events";
import { getWeekendData, weekendDayKey, type WeekendDay } from "@/lib/weekend-picks";

export const metadata: Metadata = {
  title: "What's on this weekend",
  description:
    "The few worth planning around — festivals, music and markets across Frederick this weekend, curated from every venue and partnership feed.",
};

export const revalidate = 3600;

/**
 * /weekend — "What's on this weekend."
 *
 * The find-system's second job: the can't-miss few a visitor would be
 * sad to miss, not the civic firehose. Curated from getWeekendData (the
 * weekend window, civic stripped, ranked by draw).
 *
 * Composition:
 *   1. EDITORIAL HEADER — the window + how many things are on.
 *   2. DAY TABS — Fri / Sat / Sun with per-day counts (shareable ?day=).
 *   3. THE HEADLINER — the highest-draw event as a photo-led feature.
 *   4. HOUR BY HOUR — the selected day's events as a time-ordered list.
 *   5. HONESTY FOOTER — what feeds the curation.
 *
 * Server-rendered; the day filter lives in the URL for shareable deep
 * links. Reuses EventCard so weekend events look like events everywhere.
 */

const DAYS: { key: WeekendDay; label: string }[] = [
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

function isWeekendDay(v: string | undefined): v is WeekendDay {
  return v === "fri" || v === "sat" || v === "sun";
}

export default async function WeekendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const data = await getWeekendData(weekendDayKey(now));

  // Default the active tab to the soonest day that actually has events,
  // so the page never opens on an empty day.
  const firstWithEvents = DAYS.find((d) => data.counts[d.key] > 0)?.key ?? "sat";
  const raw = typeof sp.day === "string" ? sp.day : undefined;
  const activeDay: WeekendDay = isWeekendDay(raw) ? raw : firstWithEvents;
  const dayEvents = data.byDay[activeDay];

  return (
    <div className="relative mx-auto max-w-md space-y-6 py-6">
      <PageBloom variant="warm-cool" />

      {/* ── 1. Editorial header ─────────────────────────────── */}
      <header className="space-y-2.5">
        <p className="mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand)" }}>
          This weekend · {data.total} {data.total === 1 ? "thing" : "things"} on
        </p>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.04] tracking-tight" style={{ color: "var(--app-ink)" }}>
          What&rsquo;s on
          <br />
          this weekend.
        </h1>
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The few worth planning around — curated from{" "}
          <b style={{ color: "var(--app-ink)" }}>every venue &amp; partnership feed</b> in the county.
        </p>
      </header>

      {data.total === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border px-4 py-8 text-center text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)", background: "var(--app-bg-elevated)" }}
        >
          Nothing curated for this weekend yet. Check the{" "}
          <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
            full events calendar
          </Link>
          .
        </p>
      ) : (
        <>
          {/* ── 2. Day tabs ─────────────────────────────────── */}
          <nav aria-label="Pick a day" className="flex gap-2">
            {DAYS.map((d) => {
              const active = d.key === activeDay;
              const count = data.counts[d.key];
              return (
                <Link
                  key={d.key}
                  href={`/weekend?day=${d.key}`}
                  aria-current={active ? "true" : undefined}
                  className="tactile flex flex-1 flex-col items-center rounded-[var(--app-radius-md)] border py-2.5"
                  style={
                    active
                      ? { background: "var(--app-ink)", borderColor: "var(--app-ink)" }
                      : { background: "var(--app-bg-elevated)", borderColor: "var(--app-border)" }
                  }
                >
                  <span
                    className="mono text-[9px] uppercase tracking-[0.1em]"
                    style={{ color: active ? "rgba(244,239,230,0.7)" : "var(--app-ink-3)" }}
                  >
                    {d.label}
                  </span>
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: active ? "#E9A578" : count > 0 ? "var(--app-brand)" : "var(--app-ink-3)" }}
                  >
                    {count > 0 ? `${count} on` : "—"}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* ── 3. The headliner ────────────────────────────── */}
          {data.lead && (
            <section className="space-y-2.5">
              <PlateHeader plate="The headliner" title="Don't miss" />
              <div className="relative">
                <EventCard event={data.lead} variant="feature" />
                <span
                  className="pointer-events-none absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                  style={{ background: "rgba(252,248,239,0.95)", color: "var(--app-brand)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 2px 8px -1px rgba(0,0,0,0.3)" }}
                >
                  <Star className="h-3 w-3" strokeWidth={0} fill="var(--app-warning)" aria-hidden />
                  Can&rsquo;t-miss
                </span>
              </div>
            </section>
          )}

          {/* ── 4. The selected day, hour by hour ───────────── */}
          <section className="space-y-2.5">
            <PlateHeader
              plate={DAYS.find((d) => d.key === activeDay)!.label + "day"}
              title="Hour by hour"
            />
            {dayEvents.length === 0 ? (
              <p className="px-2 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
                Nothing on {DAYS.find((d) => d.key === activeDay)!.label}. Try another day above.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {dayEvents.map((e) => (
                  <li key={e.slug} className="flex gap-3">
                    <div className="w-[52px] shrink-0 pt-1 text-right">
                      <span className="block font-serif text-[15px] font-semibold leading-none" style={{ color: "var(--app-ink)" }}>
                        {eventDateBlock(e).time.replace(/\s?[AP]M/i, "")}
                      </span>
                      <span className="mono text-[9px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
                        {/[AP]M/i.exec(eventDateBlock(e).time)?.[0] ?? ""}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <EventCard event={e} variant="glance" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── 5. Honesty footer ───────────────────────────── */}
          <p className="px-2 text-center text-[11px] italic leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Curated from DFP, Celebrate Frederick, the County &amp; venue
            <br />
            feeds — the few worth your weekend.
          </p>
        </>
      )}
    </div>
  );
}

/** Editorial "Plate" section header — shared register with /find. */
function PlateHeader({ plate, title }: { plate: string; title: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="mono text-[9.5px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-3)" }}>
        {plate}
      </span>
      <h2 className="whitespace-nowrap font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
        {title}
      </h2>
      <span className="relative top-[-2px] h-px flex-1" style={{ background: "var(--app-ink-3)", opacity: 0.35 }} />
    </div>
  );
}

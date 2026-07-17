import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { liveMusicTonight, liveMusicAhead } from "@/lib/events/live-music";
import { cleanVenueName } from "@/lib/events/normalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";

/**
 * /live-music — the music radar: tonight's stages, then every show on the
 * wire for the next four weeks as a day-grouped ledger.
 *
 * The wedge answer the place directory can't give: live music is an EVENT,
 * not a venue. Tonight windows the unified set to 17:00 -> 02:30 ET; the
 * ledger runs from the end of that window out 28 days ("what music is coming
 * up in the next 2-4 weeks?" was a reader's exact unmet ask, Reddit
 * 2026-07-17). Only real dated shows render, with the feed's own times; a
 * stage with nothing scheduled does not appear, and an empty wire gets an
 * honest empty state that names the Facebook-only gap.
 *
 * ISR (revalidate 300): the heavy assembly is the SAME 5-minute-cached set
 * /today + /events share, so there is no freshness to gain from a
 * per-request render. The per-show "live now" badge is computed against the
 * render-time clock and is accurate to within the 5-minute bucket.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/live-music" },
  title: "Live music: tonight and the next four weeks",
  description:
    "Who's on stage around Frederick County: tonight's shows plus a four-week calendar of brewery, winery, and bar lineups and ticketed concerts.",
};

export const revalidate = 300;

const ET = "America/New_York";

function showTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

type LedgerDay = {
  key: string;
  label: string;
  isWeekend: boolean;
  shows: EventWithMeta[];
};

/** Group upcoming shows by Eastern calendar day, in time order. */
function groupByEasternDay(shows: EventWithMeta[]): LedgerDay[] {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const days: LedgerDay[] = [];
  const byKey = new Map<string, LedgerDay>();
  for (const e of shows) {
    const d = new Date(e.starts_at);
    const parts = fmt.formatToParts(d);
    const part = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const weekday = part("weekday");
    const key = `${part("month")}-${part("day")}`;
    let day = byKey.get(key);
    if (!day) {
      day = {
        key,
        label: `${weekday} · ${part("month")} ${part("day")}`,
        isWeekend: weekday === "Fri" || weekday === "Sat" || weekday === "Sun",
        shows: [],
      };
      byKey.set(key, day);
      days.push(day);
    }
    day.shows.push(e);
  }
  return days;
}

function venueLine(e: EventWithMeta): string {
  const town = MUNICIPALITY_BY_SLUG[e.municipality ?? ""]?.name;
  // cleanVenueName nulls empty strings and degenerate scraps ("MD",
  // "Frederick County") so those fall through to the town, never render.
  const venue = cleanVenueName(e.venue_name);
  if (venue && town && venue.toLowerCase() !== town.toLowerCase()) return `${venue} · ${town}`;
  return venue ?? town ?? "Frederick County";
}

export default async function LiveMusicPage() {
  const now = new Date();
  const nowMs = now.getTime();
  const { publicEvents } = await assembleUnifiedEvents(now);
  const tonight = liveMusicTonight(publicEvents, now);
  const ahead = liveMusicAhead(publicEvents, now, 28);
  const ledger = groupByEasternDay(ahead);

  const dl = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(now);
  const part = (t: string) => dl.find((p) => p.type === t)?.value ?? "";
  const dateline = `${part("weekday")} · ${part("month")} ${part("day")}`;
  const nothingAnywhere = tonight.length === 0 && ahead.length === 0;

  return (
    <div className="relative mx-auto max-w-md space-y-6 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      {/* Almanac masthead — typography carries it: dateline, serif title
          dropping into an italic continuation, counts as quiet mono data
          (never the headline). */}
      <header>
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            Frederick County
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {dateline}
          </span>
        </div>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Live music{" "}
          <span className="font-serif italic font-normal" style={{ color: "var(--app-ink-3)" }}>
            around Frederick
          </span>
        </h1>
        {!nothingAnywhere && (
          <p className="mt-2 font-mono text-[11px] tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
            {tonight.length > 0 ? `${tonight.length} tonight · ` : ""}
            {ahead.length} {ahead.length === 1 ? "show" : "shows"} in the next four weeks
          </p>
        )}
      </header>

      {nothingAnywhere ? (
        <div
          className="rounded-[var(--app-radius-lg)] border border-dashed p-6 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="font-serif text-[19px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            Nothing on the wire right now.
          </p>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            We track verified venue calendars and ticketed listings. Some
            neighborhood spots post only to Facebook, so a quiet wire here
            doesn&rsquo;t always mean a quiet county.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] font-semibold">
            <Link href="/nearby?c=music" style={{ color: "var(--app-brand-press)" }}>
              See where the stages are <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
            <Link href="/events" style={{ color: "var(--app-ink-3)" }}>
              The full board
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── Tonight ── */}
          <section aria-labelledby="lm-tonight">
            <h2 id="lm-tonight" className="font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Tonight
            </h2>
            {tonight.length > 0 ? (
              <ul className="mt-2.5 space-y-2.5">
                {tonight.map((e) => {
                  const s = Date.parse(e.starts_at);
                  const en = e.ends_at ? Date.parse(e.ends_at) : NaN;
                  const live = s <= nowMs && Number.isFinite(en) && nowMs <= en;
                  return (
                    <li key={e.slug}>
                      <EventCard event={e} variant="glance" live={live} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                Nothing on the wire for tonight. The next shows are below.
              </p>
            )}
          </section>

          {/* ── The four-week ledger ── */}
          {ahead.length > 0 && (
            <section aria-labelledby="lm-ahead">
              <h2 id="lm-ahead" className="font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Coming up
              </h2>
              <div className="mt-2.5 space-y-4">
                {ledger.map((day) => (
                  <section key={day.key} aria-label={day.label}>
                    {/* Day rule: mono date; weekends carry the spruce tick so a
                        thumb scrolling for the weekend can catch them. */}
                    <div className="flex items-center gap-2">
                      {day.isWeekend && (
                        <span
                          aria-hidden
                          className="h-[3px] w-[14px] rounded-full"
                          style={{ background: "var(--app-brand-2)" }}
                        />
                      )}
                      <span
                        className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
                        style={{ color: day.isWeekend ? "var(--app-ink)" : "var(--app-ink-2)" }}
                      >
                        {day.label}
                      </span>
                      <span
                        aria-hidden
                        className="h-px flex-1"
                        style={{ background: "var(--app-border)" }}
                      />
                    </div>
                    <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
                      {day.shows.map((e) => (
                        <li key={e.slug} style={{ borderColor: "var(--app-border)" }}>
                          <Link
                            href={`/events/${e.slug}`}
                            className="flex items-baseline gap-3 py-2.5"
                          >
                            <span
                              className="w-[4.25rem] shrink-0 font-mono text-[11px] tracking-[0.02em]"
                              style={{ color: "var(--app-ink-2)" }}
                            >
                              {showTime(e.starts_at)}
                            </span>
                            <span className="min-w-0">
                              <span
                                className="block font-serif text-[15px] font-semibold leading-snug"
                                style={{ color: "var(--app-ink)" }}
                              >
                                {e.title}
                              </span>
                              <span
                                className="mt-0.5 block truncate text-[12px]"
                                style={{ color: "var(--app-ink-3)" }}
                              >
                                {venueLine(e)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          )}

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            From verified venue calendars and ticketed listings. Some neighborhood
            spots post only to Facebook, so this can run short of the full picture.
            Times are the venue&rsquo;s own.
          </p>
        </>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { liveMusicTonight, liveMusicAhead } from "@/lib/events/live-music";
import { cleanVenueName } from "@/lib/events/normalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { LIVE_MUSIC_VENUES } from "@/data/live-music-venues";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "@/components/event/EventCard";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
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

  // The curated stages directory: the honest answer to "where is there live
  // music?" even when the wire is quiet. Resolve each verified venue slug to
  // its place name + town, drop any that fell out of the dataset, de-dupe by
  // name (a couple of venues carry two slugs), and sort A-Z. Only needed for
  // the empty state, so it's computed lazily below.
  const stages = nothingAnywhere
    ? LIVE_MUSIC_VENUES.map((v) => {
        const p = clientPlaceBySlug(v.slug);
        if (!p) return null;
        return {
          slug: v.slug,
          name: p.name,
          town: p.municipality ? MUNICIPALITY_BY_SLUG[p.municipality]?.name : undefined,
          place: p,
        };
      })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .filter((s, i, arr) => arr.findIndex((o) => o.name === s.name) === i)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    // Lean-surface sheet boundary: a tap on any show opens the event
    // sheet on demand (skeleton + single-event fetch) instead of a page
    // navigation per maybe. Anchors stay real.
    <EventSheetBoundary fetchMissing className="relative mx-auto max-w-md space-y-6 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="tap-44-y inline-flex items-center gap-1 hover:underline"
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
        <>
          <div
            className="rounded-[var(--app-radius-lg)] border border-dashed p-6 text-center"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="font-serif text-[19px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
              No live shows are on the wire right now.
            </p>
            <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              We track verified venue calendars and ticketed listings. Some
              neighborhood spots post only to Facebook, so a quiet wire here
              doesn&rsquo;t always mean a quiet county.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] font-semibold">
              <Link href="/events" className="tap-44-y inline-flex items-center" style={{ color: "var(--app-brand-press)" }}>
                The full board <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
              </Link>
            </div>
          </div>

          {/* A quiet wire still answers "where does music happen here?" — the
              curated stages directory, each venue linked to its place page so a
              reader can check its own calendar. Turns a dead end into a map of
              the scene. */}
          {stages.length > 0 && (
            <section aria-labelledby="lm-stages" className="mt-6">
              <h2 id="lm-stages" className="font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Where the stages are
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                The breweries, wineries, distilleries, and bars around the county
                that regularly host live music. Open a venue to see its own
                calendar.
              </p>
              <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {stages.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/places/${s.slug}`}
                      className="tap-44-y flex items-center gap-2.5 border-b py-2 text-[14px]"
                      style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
                    >
                      <PlaceMedallion place={s.place} size={36} />
                      <span className="min-w-0 flex-1 truncate font-medium leading-snug">{s.name}</span>
                      {s.town && (
                        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
                          {s.town}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
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
                No shows are on the wire for tonight. The next shows are below.
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
                    {/* Day rule: mono date; weekends carry the event tick so a
                        thumb scrolling for the weekend can catch them. */}
                    <div className="flex items-center gap-2">
                      {day.isWeekend && (
                        <span
                          aria-hidden
                          className="h-[3px] w-[14px] rounded-full"
                          style={{ background: "var(--app-brand)" }}
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
                            aria-label={`${e.title}, ${day.label} at ${showTime(e.starts_at)}, ${venueLine(e)}`}
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
    </EventSheetBoundary>
  );
}

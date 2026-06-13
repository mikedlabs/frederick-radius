import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Music, Baby, Building2, Ticket, Sparkles } from "lucide-react";
import { eventsLive, type EventWithMeta } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { classifyEvent } from "@/lib/events/classify";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import EventCard from "@/components/event/EventCard";
import EventDayRail, { type RailDay } from "@/components/event/EventDayRail";
import EventRefine from "@/components/event/EventRefine";
import PageBloom from "@/components/ui/PageBloom";
import { itemListJsonLd } from "@/lib/seo/jsonld";

export const metadata: Metadata = {
  alternates: { canonical: "/events" },
  title: "Events",
  description:
    "Every upcoming event in Frederick County, grouped by day — live feeds from Celebrate Frederick, the County calendar, Ticketmaster (including the Frederick Keys), Bandsintown, and the Weinberg Center.",
  openGraph: {
    title: "Events",
    description: "Every upcoming event in Frederick County, grouped by day.",
  },
};

export const revalidate = 600;

/**
 * /events — the P3 agenda rail (frederickradius-handoff pattern P3).
 *
 * ONE list, grouped by day, rendered SERVER-SIDE. The two stacked
 * systems the audit found (an editorial "best of" layer + a full client
 * browse explorer) collapse into this: Today owns best-of; Events owns
 * the complete list. The pinned date rail scrolls the list; five mood
 * chips and one Refine sheet (town + sort) filter via URL params; every
 * count derives from the same filtered array that renders the cards.
 *
 * The payload fix: the old page shipped the entire event array into a
 * client explorer (serialized twice — ~776 KB decoded). Here the list
 * is server-rendered and filtering is URL-param driven, so the event
 * objects never cross into the client bundle. The only client islands
 * are the date rail (day metadata + scroll-sync) and the Refine sheet
 * (the towns list) — neither receives an event. Search is gone from the
 * page; it lives in the global command sheet (the Search tab), so
 * <main> holds zero text inputs.
 */

type Mood = "all" | "music" | "family" | "civic" | "free";
const MOODS: { key: Mood; label: string; Icon: typeof Music }[] = [
  { key: "all", label: "All", Icon: Sparkles },
  { key: "music", label: "Music", Icon: Music },
  { key: "family", label: "Family", Icon: Baby },
  { key: "civic", label: "Civic", Icon: Building2 },
  { key: "free", label: "Free", Icon: Ticket },
];

const MUSIC_RE = /music|concert|band|\bdj\b|orchestra|symphony/i;
const FAMILY_RE = /family|kid|child|youth|story/i;

function moodMatch(e: EventWithMeta, mood: Mood): boolean {
  if (mood === "all") return true;
  if (mood === "free") return Boolean(e.is_free);
  const hay = `${e.category} ${CATEGORY_BY_SLUG[e.category]?.name ?? ""} ${e.title}`;
  if (mood === "music") return MUSIC_RE.test(hay);
  if (mood === "family") return FAMILY_RE.test(hay);
  return true; // civic handled by swapping the base array
}

/** Eastern-time day key + human label for grouping. */
function nyDay(iso: string): { key: string; weekday: string; dayNum: string; label: string } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const longWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date(iso));
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    dayNum: get("day"),
    label: `${longWeekday}, ${get("month")} ${get("day")}`,
  };
}

function todayKeyNY(now: Date): string {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// The agenda shows the near-term list, whole day-groups at a time, up to
// this many events; the full set lives one tap away on the Month
// calendar. Bounding it here keeps decoded HTML under the 300 KB budget
// (the shell floor is ~130 KB; each server-rendered card is ~3.5 KB) and
// the page under 400 visible lines, while the rail counts stay exact
// because we only ever truncate on a whole-day boundary.
const MAX_EVENTS = 32;

/** The overflow link to the full calendar, shown when the agenda is
 *  truncated to MAX_EVENTS. The complete list lives on the Month view. */
function MoreOnCalendar() {
  return (
    <div className="px-1 pt-1 text-center">
      <Link
        href="/events/calendar"
        className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-4 py-2 text-[12px] font-semibold transition hover:bg-[var(--app-bg-sunken)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
      >
        See everything on the calendar →
      </Link>
    </div>
  );
}

export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const nowMs = +now;
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const mood = ((): Mood => {
    const m = str(sp.mood);
    return m === "music" || m === "family" || m === "civic" || m === "free" ? m : "all";
  })();
  const town = str(sp.m) ?? null;
  const sort: "soonest" | "az" = str(sp.sort) === "az" ? "az" : "soonest";

  const { unified, publicEvents } = await assembleUnifiedEvents(now);
  const liveSlugs = new Set(eventsLive(now).map((e) => e.slug));

  // Civic events live in their own lane; the Civic chip swaps the base
  // array to them so the lane stays reachable without ever mixing into
  // the public "what's on" list.
  const civicEvents = unified.filter((e) => classifyEvent(e) === "civic_meeting");
  const base = mood === "civic" ? civicEvents : publicEvents;

  // Upcoming-only (keep events that started within the last 12h so an
  // in-progress event doesn't vanish), then mood + town filters. ONE
  // filtered array drives the rail counts, the day groups, and the chip
  // counts — so a number can't drift from its list.
  const cutoff = nowMs - 12 * 3_600_000;
  const filtered = base
    .filter((e) => +new Date(e.starts_at) >= cutoff)
    .filter((e) => moodMatch(e, mood))
    .filter((e) => (town ? e.municipality === town : true));

  const sorted =
    sort === "az"
      ? [...filtered].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""))
      : [...filtered].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

  // Per-mood counts for the chips (town filter applied, mood not — so a
  // chip shows what it WOULD surface). Navigation counts; never in an h2.
  const moodScopedTown = (e: EventWithMeta) => (town ? e.municipality === town : true);
  const upcomingPublic = publicEvents.filter((e) => +new Date(e.starts_at) >= cutoff && moodScopedTown(e));
  const moodCount: Record<Mood, number> = {
    all: upcomingPublic.length,
    music: upcomingPublic.filter((e) => moodMatch(e, "music")).length,
    family: upcomingPublic.filter((e) => moodMatch(e, "family")).length,
    free: upcomingPublic.filter((e) => Boolean(e.is_free)).length,
    civic: civicEvents.filter((e) => +new Date(e.starts_at) >= cutoff && moodScopedTown(e)).length,
  };

  // Towns present in the current base (for the Refine sheet).
  const townSlugs = [...new Set(base.map((e) => e.municipality).filter(Boolean))];
  const towns = townSlugs
    .map((s) => ({ slug: s, name: MUNICIPALITY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const todayKey = todayKeyNY(now);

  // Group the soonest-sorted list by Eastern day. (A→Z renders flat.)
  const dayGroups: { key: string; weekday: string; dayNum: string; label: string; events: EventWithMeta[] }[] = [];
  if (sort === "soonest") {
    const byKey = new Map<string, (typeof dayGroups)[number]>();
    for (const e of sorted) {
      const d = nyDay(e.starts_at);
      let g = byKey.get(d.key);
      if (!g) {
        g = { ...d, events: [] };
        byKey.set(d.key, g);
        dayGroups.push(g);
      }
      g.events.push(e);
    }
  }
  // Take whole day-groups until we'd exceed MAX_EVENTS (always at least
  // the first day), so a day's rail count always equals its rendered
  // cards. The remainder is reachable via the Month calendar.
  const shownDays: typeof dayGroups = [];
  let acc = 0;
  for (const g of dayGroups) {
    // Break BEFORE a group that would exceed the cap (always show at
    // least the first day), so the total stays bounded even when one
    // day is unusually busy — keeps the byte budget margin honest.
    if (shownDays.length > 0 && acc + g.events.length > MAX_EVENTS) break;
    shownDays.push(g);
    acc += g.events.length;
  }
  const soonestTruncated = sort === "soonest" && shownDays.length < dayGroups.length;
  // A→Z is a flat list; cap it the same way.
  const azShown = sort === "az" ? sorted.slice(0, MAX_EVENTS) : [];
  const azTruncated = sort === "az" && sorted.length > azShown.length;
  const railDays: RailDay[] = shownDays.map((g) => ({
    key: g.key,
    weekday: g.weekday,
    dayNum: g.dayNum,
    count: g.events.length,
    isToday: g.key === todayKey,
  }));

  const eventsJsonLd = itemListJsonLd(
    "Events in Frederick County",
    sorted.slice(0, 25).map((e) => ({ name: e.title, path: `/events/${e.slug}` })),
  );

  function chipHref(key: Mood): string {
    const q = new URLSearchParams();
    if (key !== "all") q.set("mood", key);
    if (town) q.set("m", town);
    if (sort === "az") q.set("sort", "az");
    const s = q.toString();
    return s ? `/events?${s}` : "/events";
  }

  return (
    <div className="relative space-y-3">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventsJsonLd) }}
      />
      <PageBloom variant="warm-cool" />

      {/* Masthead — the question + the Month pivot. No number in any h2. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-[24px] font-semibold leading-[1.08] tracking-tight text-balance" style={{ color: "var(--app-ink)" }}>
            What&rsquo;s worth going to?
          </h1>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Every upcoming event in Frederick County, by day.
          </p>
        </div>
        <Link
          href="/events/calendar"
          className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
          style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Month
        </Link>
      </header>

      {/* Five mood chips + the single Refine sheet. Chip counts derive
          from the filtered array; they are navigation, never in an h2. */}
      <div className="flex items-center gap-2">
        <nav aria-label="Filter events" className="shelf-rail -mx-4 flex-1 gap-1.5 px-4">
          {MOODS.map(({ key, label, Icon }) => {
            const on = mood === key;
            return (
              <Link
                key={key}
                href={chipHref(key)}
                aria-pressed={on}
                className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors"
                style={{
                  background: on ? "var(--app-brand)" : "var(--app-bg-elevated)",
                  color: on ? "#fff" : "var(--app-ink-2)",
                  boxShadow: on ? undefined : "var(--app-edge), var(--app-hi)",
                }}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                {label}
                <span className="text-[11px] tabular-nums opacity-70">{moodCount[key]}</span>
              </Link>
            );
          })}
        </nav>
        <EventRefine towns={towns} activeTown={town} activeSort={sort} />
      </div>

      {/* The pinned date rail (soonest view only). A client island fed
          day metadata — never events. */}
      {sort === "soonest" && railDays.length > 0 && <EventDayRail days={railDays} />}

      {/* THE ONE LIST. Soonest → day groups (today's header reads
          "Tonight", the single pinned row, NOT a separate array). A→Z →
          one flat section. Day-group h2 headers carry NO number, so the
          count-integrity test skips them; counts live in the rail/chips. */}
      {sorted.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          Nothing matches this filter yet.{" "}
          <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
            See everything
          </Link>
          .
        </p>
      ) : sort === "az" ? (
        <section aria-label="All events A to Z" className="space-y-2">
          <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>All events, A to Z</h2>
          <ol className="space-y-2">
            {azShown.map((e) => (
              <li key={e.slug}>
                <EventCard event={e} variant="glance" live={liveSlugs.has(e.slug)} />
              </li>
            ))}
          </ol>
          {azTruncated && <MoreOnCalendar />}
        </section>
      ) : (
        <>
          {shownDays.map((g) => (
            <section key={g.key} id={`day-${g.key}`} aria-label={g.label} className="scroll-mt-24 space-y-2">
              <h2
                className="pt-1 font-serif text-[16px] font-semibold tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {g.key === todayKey ? "Tonight" : g.label}
              </h2>
              <ol className="space-y-2">
                {g.events.map((e) => (
                  <li key={e.slug}>
                    <EventCard event={e} variant="glance" live={liveSlugs.has(e.slug)} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {soonestTruncated && <MoreOnCalendar />}
        </>
      )}

      {/* Honesty footer — one muted block, the true feeds + submit link. */}
      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Live event data pulled from Celebrate Frederick, the Frederick
          County calendar, Ticketmaster (music + Frederick Keys home
          games), Bandsintown, the Weinberg Center lineup, and the county
          municipal calendars. Cached for ten minutes.
        </p>
        <p>
          Missing an event?{" "}
          <a href="/submit/event" className="underline" style={{ color: "var(--app-cool)" }}>
            Submit it →
          </a>
        </p>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import { ExternalLink, GraduationCap, Rss } from "lucide-react";
import { allUpcoming, eventsLive, eventsNext24h, eventsWeekend, type EventWithMeta } from "@/lib/loaders/events";
import { getHoodEvents } from "@/lib/integrations/hood";
import { getLiveEvents, type LiveEvent } from "@/lib/integrations/ical-live";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import EventCard from "@/components/event/EventCard";
import MunicipalEvents from "@/components/event/MunicipalEvents";
import { getIngestedSeries, getIngestedSummary } from "@/lib/loaders/ingested";

export const metadata: Metadata = {
  title: "Events",
  description: "Live event feeds from Downtown Frederick Partnership, Celebrate Frederick, the County, and Hood College.",
};

export const revalidate = 3600;

function liveToCardEvent(e: LiveEvent): EventWithMeta {
  return {
    slug: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    timezone: "America/New_York",
    is_all_day: false,
    is_recurring: false,
    venue_name: e.venue_name,
    address: e.address,
    geom: e.geom,
    municipality: e.municipality,
    category: e.category,
    audience: [],
    is_free: e.is_free,
    organizer: e.organizer,
    source: "manual",
    is_verified: false,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
    distance_m: undefined,
  };
}

export default async function EventsIndexPage() {
  const now = new Date();
  const seedLive = eventsLive(now);
  const seedToday = eventsNext24h(now);
  const seedWeekend = eventsWeekend(now);
  const seedLater = allUpcoming(now).filter(
    (e) => !seedToday.some((x) => x.slug === e.slug) && !seedWeekend.some((x) => x.slug === e.slug)
  );

  const [{ events: liveEventsRaw, sources_succeeded, sources_failed }, hood, ingestedSeries, ingestedSummary] = await Promise.all([
    getLiveEvents(60),
    getHoodEvents(),
    getIngestedSeries(),
    getIngestedSummary(),
  ]);

  // Bucket the live events into the same windows the seed uses
  const liveCards = liveEventsRaw.map(liveToCardEvent);

  const inWindow = (e: EventWithMeta, from: Date, to: Date) => {
    const s = new Date(e.starts_at);
    return s >= from && s < to;
  };

  const start0 = new Date(now);
  start0.setHours(0, 0, 0, 0);
  const start24 = new Date(now);
  start24.setHours(now.getHours() + 24);

  const dow = now.getDay();
  const friday = new Date(now);
  friday.setDate(friday.getDate() + ((5 - dow + 7) % 7));
  friday.setHours(17, 0, 0, 0);
  const monday = new Date(friday);
  monday.setDate(monday.getDate() + 3);
  monday.setHours(0, 0, 0, 0);

  const today = [
    ...seedToday,
    ...liveCards.filter((e) => inWindow(e, now, start24)),
  ].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

  const weekend = [
    ...seedWeekend,
    ...liveCards.filter((e) => inWindow(e, friday, monday)),
  ].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

  const later = [
    ...seedLater,
    ...liveCards.filter((e) => new Date(e.starts_at) >= monday),
  ].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

  const totalUpcoming = today.length + weekend.length + later.length;

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {totalUpcoming} upcoming · {hood.length} from Hood · live feeds refreshed hourly
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Events
        </h1>
        <div
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium"
          style={{
            borderColor: "var(--app-border)",
            color: sources_failed.length > 0 ? "var(--app-warning)" : "var(--app-positive)",
          }}
          role="status"
        >
          <Rss className="h-3 w-3" aria-hidden />
          {sources_succeeded.length}/{sources_succeeded.length + sources_failed.length} live feeds connected
          {sources_failed.length > 0 && ` · ${sources_failed.join(", ")} unavailable`}
        </div>
      </header>

      {seedLive.length > 0 && (
        <EventGroup title="Happening right now" events={seedLive} meta={`${seedLive.length} live`} />
      )}
      <EventGroup title="Today" events={today} meta="Next 24 hours" />
      <EventGroup title="This weekend" events={weekend} meta="Friday evening through Sunday" />
      <EventGroup title="Later" events={later} meta="Coming up" />

      {ingestedSeries.length > 0 && (
        <MunicipalEvents series={ingestedSeries} summary={ingestedSummary} />
      )}

      {hood.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="inline-flex items-center gap-2 font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              <GraduationCap className="h-4 w-4" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
              Hood College
            </h2>
            <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>{hood.length} upcoming</span>
          </div>
          <ul className="space-y-2">
            {hood.map((e) => (
              <li key={e.id}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)] transition hover:shadow-[var(--app-shadow-2)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <div
                    aria-hidden
                    className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-md)] border"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-cool)" }}>
                      {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short" }).format(new Date(e.starts_at)).toUpperCase()}
                    </span>
                    <span className="font-serif text-xl font-semibold leading-none" style={{ color: "var(--app-ink)" }}>
                      {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(new Date(e.starts_at))}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
                      {e.title}
                    </h3>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
                      {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(e.starts_at))} · {e.location}
                    </p>
                  </div>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        <p>
          Live event data pulled from Downtown Frederick Partnership, Celebrate Frederick,
          the Frederick County calendar, and the Hood College Trumba feed. Cached for one hour.
        </p>
        <p>
          Missing an event? <a href="/submit/event" className="underline" style={{ color: "var(--app-cool)" }}>Submit it →</a>
        </p>
      </footer>
    </div>
  );
}

function EventGroup({
  title,
  events,
  meta,
}: {
  title: string;
  events: EventWithMeta[];
  meta: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>{meta}</span>
      </div>
      {events.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
           style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          Nothing yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.slug}><EventCard event={e} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import Module from "@/components/today/Module";
import WeatherStrip from "@/components/today/WeatherStrip";
import AirQualityBadge from "@/components/today/AirQualityBadge";
import CivicAlerts from "@/components/today/CivicAlerts";
import LocalNewsStrip from "@/components/today/LocalNewsStrip";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import TodayFilters from "@/components/today/TodayFilters";
import { rankPlaces, placesWithinRadius } from "@/lib/loaders/places";
import { eventsLive, eventsNext24h, eventsWeekend } from "@/lib/loaders/events";
import { FREDERICK_CENTER } from "@/lib/geo";

export const metadata: Metadata = {
  description: "What's open, what's happening, and what's worth your time in Frederick County right now.",
};

export const revalidate = 60;

export default function HomePage() {
  const now = new Date();
  const origin = FREDERICK_CENTER;

  const candidatePool = rankPlaces({ origin, now, limit: 40 });
  const liveEvents = eventsLive(now);
  const todayEvents = eventsNext24h(now).slice(0, 4);
  const weekendEvents = eventsWeekend(now).slice(0, 4);
  const walkable = placesWithinRadius(origin, 1200, now)
    .filter((p) => p.open_status.state !== "closed")
    .slice(0, 4);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(now);

  return (
    <div className="space-y-7 pt-1">
      <Suspense fallback={null}>
        <CivicAlerts />
      </Suspense>

      <section>
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {weekday} · {time}
        </p>
        <h1 className="mt-1 font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Good to see you in Frederick.
        </h1>
        <a
          href="/plan"
          className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-[var(--app-shadow-1)]"
          style={{ background: "var(--app-brand)" }}
        >
          ✨ Plan my evening
        </a>
      </section>

      <Suspense fallback={<WeatherStripFallback />}>
        <div className="space-y-2">
          <WeatherStrip />
          <div className="flex">
            <Suspense fallback={null}>
              <AirQualityBadge />
            </Suspense>
          </div>
        </div>
      </Suspense>

      {liveEvents.length > 0 && (
        <Module title="Happening right now" href="/events" meta={`${liveEvents.length} event${liveEvents.length === 1 ? "" : "s"} live`}>
          <ul className="space-y-2">
            {liveEvents.map((e) => <li key={e.slug}><EventCard event={e} /></li>)}
          </ul>
        </Module>
      )}

      <Module title="What's good right now" href="/map" meta="Filter by time of day, vibe, or just press Surprise me">
        <TodayFilters candidates={candidatePool} />
      </Module>

      <Module title="Happening today" href="/events" meta={`Next 24 hours · ${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"}`}>
        {todayEvents.length === 0 ? (
          <EmptyHint text="Nothing on the calendar for the next 24 hours." />
        ) : (
          <ul className="space-y-2">
            {todayEvents.map((e) => <li key={e.slug}><EventCard event={e} /></li>)}
          </ul>
        )}
      </Module>

      <Module title="This weekend" href="/events" meta="Friday evening through Sunday">
        {weekendEvents.length === 0 ? (
          <EmptyHint text="No events for this weekend yet." />
        ) : (
          <ul className="space-y-2">
            {weekendEvents.map((e) => <li key={e.slug}><EventCard event={e} /></li>)}
          </ul>
        )}
      </Module>

      <Suspense fallback={null}>
        <LocalNewsStrip />
      </Suspense>

      <Module title="Walkable from downtown" href="/radius" meta="Inside a 15-minute walk · open now">
        <ul className="space-y-2">
          {walkable.map((p) => <li key={p.slug}><PlaceCard place={p} /></li>)}
        </ul>
      </Module>

      <Module title="Browse by town" href="/m/frederick" cta="All 12">
        <MunicipalityStrip />
      </Module>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p
      className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
    >
      {text}
    </p>
  );
}

function WeatherStripFallback() {
  return (
    <div
      className="h-24 animate-pulse rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    />
  );
}

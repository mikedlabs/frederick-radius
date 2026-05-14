import type { Metadata } from "next";
import { allUpcoming, eventsLive, eventsNext24h, eventsWeekend } from "@/lib/loaders/events";
import EventCard from "@/components/event/EventCard";

export const metadata: Metadata = {
  title: "Events",
  description: "What's happening across Frederick County — today, this weekend, and beyond.",
};

export const revalidate = 60;

export default function EventsIndexPage() {
  const now = new Date();
  const live = eventsLive(now);
  const today = eventsNext24h(now);
  const weekend = eventsWeekend(now);
  const later = allUpcoming(now).filter(
    (e) => !today.some((x) => x.slug === e.slug) && !weekend.some((x) => x.slug === e.slug)
  );

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {allUpcoming(now).length} upcoming events
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Events
        </h1>
      </header>

      {live.length > 0 && (
        <EventGroup title="Happening right now" events={live} meta={`${live.length} live`} />
      )}
      <EventGroup title="Today" events={today} meta="Next 24 hours" />
      <EventGroup title="This weekend" events={weekend} meta="Friday evening through Sunday" />
      <EventGroup title="Later" events={later} meta="Coming up" />
    </div>
  );
}

function EventGroup({
  title,
  events,
  meta,
}: {
  title: string;
  events: ReturnType<typeof allUpcoming>;
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

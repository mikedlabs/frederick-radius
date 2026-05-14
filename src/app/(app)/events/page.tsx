import type { Metadata } from "next";
import { ExternalLink, GraduationCap } from "lucide-react";
import { allUpcoming, eventsLive, eventsNext24h, eventsWeekend } from "@/lib/loaders/events";
import { getHoodEvents } from "@/lib/integrations/hood";
import EventCard from "@/components/event/EventCard";

export const metadata: Metadata = {
  title: "Events",
  description: "What's happening across Frederick County — today, this weekend, and beyond. Plus events on the Hood College campus.",
};

export const revalidate = 60;

export default async function EventsIndexPage() {
  const now = new Date();
  const live = eventsLive(now);
  const today = eventsNext24h(now);
  const weekend = eventsWeekend(now);
  const later = allUpcoming(now).filter(
    (e) => !today.some((x) => x.slug === e.slug) && !weekend.some((x) => x.slug === e.slug)
  );
  const hood = await getHoodEvents();

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {allUpcoming(now).length} upcoming · {hood.length} from Hood College
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

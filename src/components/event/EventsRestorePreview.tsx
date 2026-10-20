import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDisplayTitle } from "@/lib/events/display-title";
import { eventDateBlock } from "@/lib/events/format";
import { eventDecisionLocation, eventDecisionTime } from "@/lib/events/decision-facts";
import { isEventListingEnded } from "@/lib/eventHorizon";
import { statusLabel } from "@/lib/event-status";
import { isResolvableEventSlug } from "@/lib/events/resolvable-event-slug";

/** Public server-preview rows only. Browser scope is deliberately not an input. */
export function eventsForRestorePreview(events: readonly EventWithMeta[], nowISO: string): EventWithMeta[] {
  const now = new Date(nowISO);
  if (!Number.isFinite(now.getTime())) return [];
  const seen = new Set<string>();
  return events.filter(event => {
    if (!isResolvableEventSlug(event.slug) || !event.title.trim()
      || !Number.isFinite(Date.parse(event.starts_at)) || isEventListingEnded(event, now)
      || seen.has(event.slug)) return false;
    seen.add(event.slug);
    return true;
  }).slice(0, 3);
}

/** Ordinary anchors keep an honest public preview usable before hydration.
 * No remembered view, cached private HTML, Save state, or speculative fetch. */
export default function EventsRestorePreview({ events, nowISO, degraded }: {
  events: readonly EventWithMeta[];
  nowISO: string;
  degraded: boolean;
}) {
  const preview = eventsForRestorePreview(events, nowISO);
  const now = new Date(nowISO);
  return (
    <section data-events-restoring-view data-events-restore-preview aria-labelledby="events-restore-heading"
      className="min-w-0 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)]"
      style={{ borderColor: "var(--app-border)" }}>
      <div className="space-y-2 px-4 py-4">
        <h1 id="events-restore-heading" className="text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          County calendar preview
        </h1>
        <p role="status" className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Radius is restoring your town, time, and event filters.
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          These countywide listings may be outside your selected view. You can open an event while your filters load.
        </p>
        {degraded && <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The saved event schedule is incomplete. Check the event page or an official calendar before making plans.
        </p>}
      </div>
      {preview.length > 0 ? (
        <ol className="space-y-2 px-2 pb-2" aria-label="Public county calendar preview">
          {preview.map(event => {
            const date = eventDateBlock(event);
            const status = statusLabel(event.status ?? "scheduled");
            return <li key={event.slug}>
              <a data-events-preview-link href={`/events/${event.slug}`}
                className="block min-h-[44px] min-w-0 space-y-1 rounded-[var(--app-radius-md)] px-3 py-3 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: "var(--app-ink)", outlineColor: "var(--app-focus)", background: "var(--app-bg-sunken)" }}>
                {status && <p data-events-preview-status className="text-sm font-semibold" style={{ color: event.status === "cancelled" ? "var(--app-danger-text)" : "var(--app-ink)" }}>{status}</p>}
                <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
                  <time dateTime={event.starts_at}>{date.weekday} {date.month} {date.day}</time>
                  <span data-events-preview-time> · {eventDecisionTime(event, now)}</span>
                </p>
                <h2 className={`text-base font-semibold leading-snug ${event.status === "cancelled" ? "line-through" : ""}`}>
                  {eventDisplayTitle(event)}
                </h2>
                <p data-events-preview-location className="text-sm leading-snug" style={{ color: "var(--app-ink-2)" }}>
                  {eventDecisionLocation(event)}
                </p>
              </a>
            </li>;
          })}
        </ol>
      ) : <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        Preview listings are unavailable. You can check an official calendar while your view loads.
      </p>}
      {(degraded || preview.length === 0) && <div className="flex flex-wrap gap-x-4 px-4 pb-3 text-sm" style={{ color: "var(--app-link)" }}>
        <a href="https://www.frederickcountymd.gov/calendar.aspx" target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center underline">County calendar</a>
        <a href="https://www.celebratefrederick.com/events/" target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center underline">Celebrate Frederick calendar</a>
      </div>}
    </section>
  );
}

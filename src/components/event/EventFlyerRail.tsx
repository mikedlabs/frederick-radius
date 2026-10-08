import Link from "next/link";
import type { EventWithMeta } from "@/lib/loaders/events";
import SectionHeading from "@/components/ui/SectionHeading";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import {
  eventFlyerVisual,
  type EventCardVisual,
} from "@/components/event/eventVisuals";
import { eventDecisionLocation, eventRowTime } from "@/lib/events/decision-facts";
import { isUtilityEvent } from "@/lib/event-kind";
import RadiusPhoto, {
  RadiusPhotoScope,
  RadiusPhotoWhen,
} from "@/components/ui/RadiusPhoto";

/** Fewer flyers than this is not a rail, so nothing renders. */
export const FLYER_RAIL_MIN = 3;
/** The rail never holds more than this many flyers. */
export const FLYER_RAIL_MAX = 6;
/** The rail covers the same seven Eastern days as the week ribbon. */
export const FLYER_RAIL_DAYS = 7;

/** Painted frame size: 200 x 124 at every breakpoint. */
const FRAME_WIDTH = 200;

export type FlyerRailItem = {
  event: EventWithMeta;
  visual: EventCardVisual;
};

const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const EASTERN_RAIL_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** Eastern YYYY-MM-DD for `offset` whole days after `nowMs`, anchored at noon. */
function easternDayKey(nowMs: number, offset = 0): string {
  const parts = Object.fromEntries(
    EASTERN_DAY.formatToParts(new Date(nowMs)).map((part) => [part.type, part.value]),
  );
  return EASTERN_DAY.format(
    new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset, 16),
    ),
  );
}

/**
 * The flyers the board's rail shows, chosen from the events already in the
 * current filtered window:
 *
 * - only events with a publisher flyer (eventFlyerVisual), so the rail is
 *   pictures the publisher made, never venue photos or generated art;
 * - only scheduled events that start within the ribbon's seven days, so the
 *   "This week" heading stays true when the board is unfiltered;
 * - no civic business, and one card per flyer image, so a weekly series
 *   does not fill the rail with copies of one flyer;
 * - in chronological order, at most FLYER_RAIL_MAX.
 *
 * Fewer than FLYER_RAIL_MIN qualifying flyers returns an empty list.
 */
export function flyerRailItems(
  events: readonly EventWithMeta[],
  { nowMs }: { nowMs: number },
): FlyerRailItem[] {
  const firstDay = easternDayKey(nowMs);
  const lastDay = easternDayKey(nowMs, FLYER_RAIL_DAYS - 1);
  const chronological = events
    .map((event) => ({ event, start: Date.parse(event.starts_at) }))
    .filter(({ start }) => Number.isFinite(start))
    .sort((a, b) => a.start - b.start);

  const seen = new Set<string>();
  const items: FlyerRailItem[] = [];
  for (const { event, start } of chronological) {
    if ((event.status ?? "scheduled") !== "scheduled") continue;
    if (isUtilityEvent(event)) continue;
    const day = EASTERN_DAY.format(new Date(start));
    if (day < firstDay || day > lastDay) continue;
    const visual = eventFlyerVisual(event);
    if (!visual || seen.has(visual.key) || seen.has(event.slug)) continue;
    seen.add(visual.key);
    seen.add(event.slug);
    items.push({ event, visual });
    if (items.length === FLYER_RAIL_MAX) break;
  }
  return items.length >= FLYER_RAIL_MIN ? items : [];
}

/** "Thu, Oct 8 · 7:30 PM": the rail card's date line. */
export function flyerRailWhen(event: EventWithMeta, now?: Date): string {
  const day = EASTERN_RAIL_DATE.format(new Date(event.starts_at));
  return `${day} · ${eventRowTime(event, now)}`;
}

/**
 * EventFlyerRail: the publisher flyers in the board's current window, under
 * the week ribbon. Each card is one link with a 200 x 124 frame that shows
 * the flyer object-contain on sunken paper with nothing drawn on it, then the
 * date line, the title and the venue on paper below. The credit waits for
 * the image to load, and a flyer that fails removes its card. Phones scroll
 * the rail with a 16px gutter bleed; from 1024px four cards sit in view.
 */
export default function EventFlyerRail({
  items,
  nowISO,
}: {
  items: readonly FlyerRailItem[];
  nowISO?: string;
}) {
  if (items.length < FLYER_RAIL_MIN) return null;
  const now = nowISO ? new Date(nowISO) : undefined;
  return (
    <section
      data-events-flyer-rail
      // If every flyer fails to load, the heading leaves with the cards.
      className="space-y-3 [&:not(:has(li))]:hidden"
    >
      <SectionHeading title="This week" size="sm" />
      <ol
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden sm:mx-0 sm:scroll-px-0 sm:px-0"
      >
        {items.map(({ event, visual }) => {
          const venue = eventDecisionLocation(event);
          return (
            <RadiusPhotoScope
              key={`${event.slug}-${event.starts_at}`}
              src={visual.src}
              size={FRAME_WIDTH}
            >
              <RadiusPhotoWhen is="visible">
                <li className="w-[200px] shrink-0 snap-start">
                  <article
                    data-decision-impression="true"
                    data-decision-surface="events"
                    data-decision-entity="event"
                    data-decision-id={event.slug}
                    data-decision-position="alternative"
                    data-event-flyer-card
                  >
                    <Link
                      href={`/events/${event.slug}`}
                      data-decision-action="open"
                      prefetch={false}
                      className="group block rounded-[var(--app-radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
                      style={{ color: "var(--app-ink)" }}
                    >
                      <RadiusPhoto
                        size={FRAME_WIDTH}
                        fit="contain"
                        alt=""
                        sizes={`${FRAME_WIDTH}px`}
                        className="h-[124px] w-[200px] rounded-[var(--app-radius-md)]"
                        style={{ boxShadow: "var(--app-edge)" }}
                      />
                      <p
                        className="mt-2 text-meta-lg tabular-nums"
                        style={{ color: "var(--app-ink-2)" }}
                      >
                        {flyerRailWhen(event, now)}
                      </p>
                      <h3
                        className="mt-0.5 text-title-sm line-clamp-2 group-active:underline"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {event.title}
                      </h3>
                      {venue ? (
                        <p
                          className="mt-0.5 text-meta-lg line-clamp-2"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {venue}
                        </p>
                      ) : null}
                    </Link>
                    {/* The credit names an image, so it waits for one. It sits
                        outside the link because it can carry its own link. */}
                    <RadiusPhotoWhen is="ready">
                      <EventVisualCredit visual={visual} compact className="mt-1" />
                    </RadiusPhotoWhen>
                  </article>
                </li>
              </RadiusPhotoWhen>
            </RadiusPhotoScope>
          );
        })}
      </ol>
    </section>
  );
}

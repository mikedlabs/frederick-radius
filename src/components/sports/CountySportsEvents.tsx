import { CalendarDays } from "lucide-react";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import type { EventWithMeta } from "@/lib/loaders/events";
import { getVisibleEvents } from "@/lib/events/visible";
import { eventIntentOf } from "@/lib/events/intents";
import { isKeysEvent } from "@/lib/today/keysEvent";
import { formatEventWhen } from "@/lib/events/format";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Row, RowList } from "@/components/ui/Row";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";

/**
 * CountySportsEvents — upcoming sports-intent events on /sports, minus the
 * Keys games the section above already shows.
 *
 * Same single source as every other event surface: THE unified assembly
 * (curated + Ticketmaster sports + SeatGeek + iCal keyword inference),
 * filtered through the shared sports intent roll-up, so this list can never
 * disagree with /events about what counts as sports. Rows link to the event
 * page and open in the page's event sheet boundary.
 */

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

const MAX_ROWS = 10;

export default async function CountySportsEvents({
  eventsPromise,
  now,
}: {
  eventsPromise: EventsPromise;
  now: Date;
}) {
  const assembled = await eventsPromise.catch(() => null);
  const rows = getVisibleEvents(
    (assembled?.publicEvents ?? []).filter(
      (e: EventWithMeta) => eventIntentOf(e) === "sports" && !isKeysEvent(e),
    ),
    now,
  ).slice(0, MAX_ROWS);

  if (rows.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={CalendarDays}
          title="No other sports events are listed right now."
          body="The ticket feeds and local calendars refresh through the day. The events board carries everything else that is on."
          cta={{ label: "Browse all events", href: "/events" }}
        />
      </div>
    );
  }

  return (
    <RowList className="mt-4">
      {rows.map((e) => {
        const town = MUNICIPALITY_BY_SLUG[e.municipality]?.name;
        const where = [e.venue_name, town].filter(Boolean).join(", ");
        return (
          <Row
            key={e.slug}
            href={`/events/${e.slug}`}
            title={e.title}
            subtitle={[formatEventWhen(e), where].filter(Boolean).join(" · ")}
            meta={e.is_free ? "Free" : e.price_text || undefined}
          />
        );
      })}
    </RowList>
  );
}

export function CountySportsEventsFallback() {
  return (
    <div className="mt-4">
      <Skeleton.Block height={168} round="var(--app-radius-lg)" />
    </div>
  );
}

import type { EventWithMeta } from "@/lib/loaders/events";
// Data-free formatter (never the loader) so this stays a light leaf.
import { eventDateBlock } from "@/lib/events/format";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { isKeysEvent } from "@/lib/today/keysEvent";
import KeysCard from "@/components/today/KeysCard";
import TodayHeadlineCard from "./TodayHeadlineCard";
import { eventCardVisual, type EventCardVisual } from "@/components/event/eventVisuals";
import OfflineTodayCapture from "@/components/pwa/OfflineTodayCapture";
import { easternDayKey } from "@/lib/tz";
import { eventTown } from "@/lib/events/eventTown";
import { eventDisplayTitle } from "@/lib/events/display-title";
import { eventAttendanceLabel, hasPhysicalAttendance } from "@/lib/events/attendance";
import { eventHasPreciseDisplayLocation } from "@/lib/events/geo-confidence";
import EventWalkTime from "@/components/today/EventWalkTime";

/**
 * TonightHeadline — the ONE headline of /today, rendered only when the day
 * actually has one (a real draw picked by splitTonightFeature; utility and
 * routine programming can never reach this component). Full-width, set like
 * a front-page lede: the event's own title in the large display face,
 * a mono when/where line under it, and approved artwork or a venue photo below
 * the headline. Publisher artwork stays intact. Typography carries the emphasis,
 * not a bigger box — the
 * point of the one-hero pass is that on a night with a headliner the page
 * READS like it has a headline, and on a quiet night nothing fakes one
 * (the caller renders nothing; What's-on says the quiet truth instead).
 *
 * Keys home games keep their branded KeysCard treatment — the team plate IS
 * that event's headline dress, and a second serif title above it would say
 * the same thing twice.
 */

/** Eastern wall-clock hour (0-23) of an ISO instant — same daypart key the
 *  page's program grouping uses. */
function easternStartHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })
      .format(new Date(iso)),
  );
}

type TonightHeadlineProps = {
  event: EventWithMeta;
  now: Date;
  /** Nested event-program treatment: tighter rhythm, h3 semantics, lazy art,
   *  and no offline-lead write because the place decision above owns it. */
  embedded?: boolean;
};

export default function TonightHeadline(props: TonightHeadlineProps) {
  return <TonightHeadlineContent {...props} approvedVisual={eventCardVisual(props.event)} />;
}

/** The shared rendering surface also accepts declared, offline layout fixtures.
 *  Production always enters through the approval boundary above. */
export function TonightHeadlineContent({
  event,
  now,
  embedded = false,
  approvedVisual,
}: TonightHeadlineProps & { approvedVisual: EventCardVisual | null }) {
  const live = isEventLiveNow(event, now);
  const displayTitle = eventDisplayTitle(event);
  const date = eventDateBlock(event);
  const accent = CATEGORY_BY_SLUG[event.category]?.color ?? "#7A7975";
  const tonight = !event.is_all_day && easternStartHour(event.starts_at) >= 17;
  // The one editor's pick, and it SAYS so (the unlabeled hero was the first
  // "why is this big?" of the old section) — same wording the What's-on
  // feature used, so the label survives the move.
  const label = tonight ? "Tonight's pick" : "Today's pick";

  const physical = hasPhysicalAttendance(event);
  const venue = eventAttendanceLabel(event);
  // Same town label the program rows print (shared eventTown helper). This
  // component used to un-map "Downtown Frederick" back to "Frederick" via a
  // guard that no longer matched anything, so the headliner and the rows
  // below could name the same city two different ways on one screen.
  const town = physical ? eventTown(event) : null;
  const where = [venue, town && town.toLowerCase() !== venue?.toLowerCase() ? town : null]
    .filter(Boolean)
    .join(" · ");
  const titleId = `today-headliner-${event.slug}-title`;
  const detailId = `today-headliner-${event.slug}-detail`;
  const Title = embedded ? "h3" : "h2";

  return (
    <section aria-label="The headliner" className={embedded ? "mt-3" : "mt-6"}>
      {!embedded ? (
        <OfflineTodayCapture
          snapshot={{
            dayKey: easternDayKey(now),
            lead: {
              kind: "event",
              title: displayTitle,
              detail: [live ? "On now when saved" : date.time, where].filter(Boolean).join(" · "),
              href: `/events/${event.slug}`,
            },
          }}
        />
      ) : null}
      <p
        className="mb-1.5 flex items-center gap-1.5 px-0.5 font-mono text-xs font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--app-brand-press)" }}
      >
        {live && (
          <span aria-hidden className="live-dot h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-brand)" }} />
        )}
        {label}
      </p>
      {isKeysEvent(event) ? (
        <KeysCard event={event} variant="feature" />
      ) : (
        <TodayHeadlineCard eventSlug={event.slug} titleId={titleId} detailId={detailId}
          visual={approvedVisual} accent={accent} priority={!embedded}>
          {/* This is Today’s one opt-in editorial face. It stays fluid and
              untruncated so a real event name still reads cleanly at 320px. */}
          <Title
            id={titleId}
            className="min-w-0 break-words px-0.5 font-editorial text-[clamp(1.875rem,9vw,2.75rem)] leading-[0.98] tracking-[-0.025em] [text-wrap:balance]"
            style={{ color: "var(--app-ink)" }}
          >
            {displayTitle}
          </Title>
          <p
            id={detailId}
            className="mt-2 px-0.5 text-sm leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            <span
              className="font-mono font-semibold tabular-nums"
              style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
            >
              {live ? "On now" : date.time || `${date.weekday} ${date.month} ${date.day}`}
            </span>
            {where && <span style={{ color: "var(--app-ink-3)" }}> · {where}</span>}
            {event.is_free && <span style={{ color: "var(--app-cool)" }}> · Free</span>}
          </p>
          {physical && eventHasPreciseDisplayLocation(event) ? (
            <EventWalkTime dest={event.geom} />
          ) : null}
        </TodayHeadlineCard>
      )}
    </section>
  );
}

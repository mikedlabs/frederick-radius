import Link from "next/link";
import type { ReactNode } from "react";
import CategoryIcon from "@/components/place/CategoryIcon";
import type { EventWithMeta } from "@/lib/loaders/events";
// VALUE import from the DATA-FREE formatter module, never from the loader:
// a value import of loaders/events would drag its places-client static
// import (1.8MB JSON) into every client bundle that renders an event card.
import { eventDateBlock } from "@/lib/events/format";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import ItineraryButton from "@/components/saved/ItineraryButton";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { eventReasons } from "@/lib/event-reasons";
import { formatDistance } from "@/lib/geo";
import { statusLabel } from "@/lib/event-status";
import DatePlate from "@/components/event/DatePlate";
import {
  eventDecisionLocation,
  eventDecisionTime,
  eventRowTime,
} from "@/lib/events/decision-facts";
import { communicationAccessLabels } from "@/lib/events/communication-access";
import {
  eventFlyerVisual,
  type EventCardVisual,
} from "@/components/event/eventVisuals";
import EventPosterCard from "@/components/event/EventPosterCard";
import RadiusPhoto, {
  RadiusPhotoScope,
  RadiusPhotoWhen,
} from "@/components/ui/RadiusPhoto";
import {
  eventHasTrustworthyEnd,
  isEventLiveNow,
} from "@/lib/eventWhenLabel";

/** The painted size of a row's flyer frame. */
export const EVENT_ROW_FLYER_SIZE = 56;

export type EventCardVariant =
  | "row"
  | "tile"
  | "feature"
  | "compact"
  | "glance"
  | "utility";

export default function EventCard({
  event,
  variant = "glance",
  live = false,
  hideDate = false,
  whyItMatters,
  priorityImage = true,
  visual,
  nowISO,
}: {
  event: EventWithMeta;
  /**
   * `glance`, `compact`, `utility` and `row` all render the one event row
   * (EventRow below): a date plate, the title, one meta line, at most one
   * mark, and a publisher flyer on the right when the event has one. The
   * names stay so existing callers keep working; they no longer change the
   * row's look.
   *
   *   `row`     also keeps the Day Plan button beside the row.
   *   `tile`    grid/rail card, date-led header + category tab.
   *   `feature` the image-led poster (EventPosterCard).
   */
  variant?: EventCardVariant;
  /** Live right now. A row shows an Amber dot and "Now" in place of the
   *  time, but only when the event carries a usable end time. */
  live?: boolean;
  /**
   * The surface's own header already names the day ("Also today", "Earlier
   * today"), so the row drops its date plate and prints only the clock.
   * Row variants only; `tile` and `feature` ignore it.
   */
  hideDate?: boolean;
  /**
   * One honest "why it matters" line for the HERO (feature) card,
   * derived upstream from the event's real description — never
   * fabricated. Rendered under the meta row. Ignored by other variants.
   */
  whyItMatters?: string;
  /**
   * Whether a feature-variant photo may claim next/image `priority`
   * (the LCP preload). Defaults true (the historical single-hero
   * behavior); pass false for feature cards below the fold.
   */
  priorityImage?: boolean;
  /**
   * A source-aware visual selected by the surface, for the feature card.
   * Rows resolve their own flyer through the shared gate.
   */
  visual?: EventCardVisual;
  /** Server-captured page time, used for stable started/unknown-end copy. */
  nowISO?: string;
}) {
  const status = event.status ?? "scheduled";
  const cardNow = nowISO ? new Date(nowISO) : null;
  // Presentation-level guard: even if a stale caller passes `live`, a card
  // cannot render Live/Now unless the event carries a usable end time.
  const confirmedLive =
    status === "scheduled" &&
    live &&
    (cardNow
      ? isEventLiveNow(event, cardNow)
      : !event.is_all_day && eventHasTrustworthyEnd(event));

  // A lead uses a source-approved image when available and a compact date-led
  // card otherwise. An unapproved image never bypasses the shared photo gate.
  if (variant === "feature") {
    return (
      <EventPosterCard
        event={event}
        visual={visual}
        priorityImage={priorityImage}
        whyItMatters={whyItMatters}
        live={confirmedLive}
        nowISO={nowISO}
      />
    );
  }

  if (variant !== "tile") {
    return (
      <EventRow
        event={event}
        flyer={eventFlyerVisual(event)}
        live={confirmedLive}
        hideDate={hideDate}
        now={cardNow}
        trailing={
          variant === "row" ? (
            <ItineraryButton
              eventId={event.slug}
              label={`Add ${event.title} to itinerary`}
              className="tap-44"
            />
          ) : null
        }
      />
    );
  }

  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  // Lifecycle status — a cancelled or postponed event still shows
  // (a user looking for it needs to KNOW), but with a loud badge and
  // a struck-through title so it can never be mistaken for "on."
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  const timingText = eventDecisionTime(event, cardNow ?? undefined);
  // Text-safe status color: --app-warning-press is the AA-safe postponed
  // variant; cancelled uses --app-danger. (audit a11y)
  const statusBg = isCancelled ? "var(--app-danger)" : "var(--app-warning-press)";
  const venueLabel = eventDecisionLocation(event);
  // Accent MUST be a hex literal — used in templates like `${accent}38`
  // to compose color-with-alpha. An unrecognized/blank category resolves to
  // a NEUTRAL grey + the honest label "Event", never a mislabeled category.
  const accent: string = cat?.color ?? "#7A7975";
  const categoryLabel = cat?.name ?? (event.category ? event.category : "Event");
  const accessLabel = communicationAccessLabels(event)[0];
  const decisionAttributes = {
    "data-decision-impression": "true",
    "data-decision-surface": "events",
    "data-decision-entity": "event",
    "data-decision-id": event.slug,
    "data-decision-position": "result",
  } as const;

  // Tile variant — the workhorse grid card, date-led (no photo banner). A
  // category-tinted tab carries the category + status; the body holds title,
  // time/venue, and the reason chips.
  //
  // Folder-tab card: the category rides a colored TAB on the top-left
  // (deepened toward ink so white reads AA on light accents), the card's
  // top-left corner squares to meet it, and the old inline label + bottom
  // color band are gone — the tab IS the category now. The wrapper reserves
  // the tab's height so it never clips inside a rail (no parent change).
  const tabBg = `color-mix(in srgb, ${accent} 68%, var(--app-ink))`;
  const reasons = eventReasons(event, cardNow ?? undefined);
  return (
    <div className="relative flex h-full flex-col pt-[14px]">
      <span
        className="absolute left-3 top-0 z-10 max-w-[75%] truncate rounded-t-[8px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ background: tabBg, boxShadow: "var(--app-edge)", color: "var(--app-on-brand)" }}
      >
        {confirmedLive ? "Live now" : categoryLabel}
      </span>
      {/* Compact horizontal layout — date block beside the content, no empty
          header band, no bottom-pinned reasons. h-full/flex-1: in a flex
          rail the wrapper stretches to the tallest sibling anyway, so the
          card fills it — otherwise a two-line neighbor leaves this tile
          floating over a blank band. */}
      <article
        {...decisionAttributes}
        className="tactile tactile-interactive group relative flex flex-1 gap-3 overflow-hidden rounded-[var(--app-radius-lg)] rounded-tl-none border bg-[var(--app-bg-elevated)] px-3 pb-3 pt-2.5 transition-all duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        {/* Faint engraved category glyph — paper texture + a distinct
            printed-calendar identity, the way the intel records carry one. */}
        <span aria-hidden className="pointer-events-none absolute -bottom-4 -right-3" style={{ color: accent, opacity: 0.06 }}>
          <CategoryIcon slug={event.category} className="h-[88px] w-[88px] rotate-[8deg]" strokeWidth={0.9} />
        </span>
        <DatePlate month={date.month} day={date.day} weekday={date.weekday} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {statusText && (
            <span className="self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: statusBg }}>{statusText}</span>
          )}
          <Link
            href={`/events/${event.slug}`}
            data-decision-action="open"
            prefetch={false}
            className={`line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight outline-none focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
          <p className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-2)" }}>{timingText}</span>
            {venueLabel ? <> · {venueLabel}</> : null}
          </p>
          {accessLabel && (
            <p className="truncate text-[11px] font-medium" style={{ color: "var(--app-cool)" }}>
              {accessLabel}
            </p>
          )}
          {reasons.length > 0 ? (
            <div className="pt-0.5"><ReasonChipRow reasons={reasons} /></div>
          ) : (event.price_text && !event.is_free) || event.distance_m !== undefined ? (
            <div className="flex items-center gap-1.5 pt-0.5 text-[11px]">
              {event.price_text && !event.is_free && (
                <span style={{ color: "var(--app-ink-3)" }}>{event.price_text}</span>
              )}
              {event.distance_m !== undefined && (
                <span className="ml-auto font-mono tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                  {formatDistance(event.distance_m)}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}

/** Which single mark a row carries: Free, Tickets, or none. */
export function eventRowMark(
  event: Pick<EventWithMeta, "is_free" | "ticket_url" | "price_text">,
): "free" | "tickets" | null {
  if (event.is_free) return "free";
  return event.ticket_url || event.price_text?.trim() ? "tickets" : null;
}

/**
 * The one event row. Every list of events (the Events board, town pages,
 * live music, collections, place pages, Today's earlier-today list) renders
 * this grammar, so a person learns it once:
 *
 *   [date plate] | title, one meta line, at most one mark | [flyer]
 *
 * - The whole row is the link. There is no card border or shadow, only a
 *   1px rule under each row and a sunken pressed state.
 * - The meta line is start time, venue and town. A live event shows an Amber
 *   dot and "Now" instead of the time. End-time and daily-hours cautions are
 *   not row facts; the sheet and the detail page say them as sentences.
 * - The mark is "Free" or "Tickets", never both.
 * - The picture is a publisher flyer in a 56px frame, uncropped on sunken
 *   paper with nothing drawn over it. Any other event has no frame at all:
 *   no venue photo, no map tile, no glyph. A flyer that fails to load leaves
 *   the row text-only.
 */
export function EventRow({
  event,
  flyer,
  live = false,
  hideDate = false,
  now = null,
  trailing = null,
}: {
  event: EventWithMeta;
  /** A visual already approved as a publisher flyer (eventFlyerVisual). */
  flyer: EventCardVisual | null;
  /** Confirmed live: the caller has already checked for a usable end time. */
  live?: boolean;
  hideDate?: boolean;
  /** Server-captured page time, for the started-without-an-end disclosure. */
  now?: Date | null;
  /** An action beside the row, outside its link. */
  trailing?: ReactNode;
}) {
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  const statusColor = isCancelled ? "var(--app-danger)" : "var(--app-warning-press)";
  const date = eventDateBlock(event);
  const venueLabel = eventDecisionLocation(event);
  // A collapsed series shows its cadence, read from its dates ("Every
  // Wednesday"), so one row honestly stands for the run.
  const cadence = event.is_recurring ? event.recurrence_text?.trim() : undefined;
  const mark = eventRowMark(event);
  const accessLabel = communicationAccessLabels(event)[0];
  const distance =
    event.distance_m !== undefined ? formatDistance(event.distance_m) : null;

  return (
    <article
      data-decision-impression="true"
      data-decision-surface="events"
      data-decision-entity="event"
      data-decision-id={event.slug}
      data-decision-position="result"
      data-event-row
      className="relative flex min-w-0 items-center gap-2 border-b"
      style={{ borderColor: "var(--app-border)" }}
    >
      <Link
        href={`/events/${event.slug}`}
        data-decision-action="open"
        prefetch={false}
        className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 px-1 py-3 outline-none transition-colors duration-[var(--app-dur-fast)] active:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
        style={{ color: "var(--app-ink)" }}
      >
        {!hideDate && (
          <DatePlate
            month={date.month}
            day={date.day}
            weekday={date.weekday}
            size="sm"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3
            className={isCancelled ? "text-title-sm line-clamp-2 line-through opacity-70" : "text-title-sm line-clamp-2"}
            style={{ color: "var(--app-ink)" }}
          >
            {event.title}
          </h3>
          <p
            data-event-row-meta
            className="mt-0.5 text-meta-lg"
            style={{ color: "var(--app-ink-2)" }}
          >
            {statusText && (
              <span className="font-semibold" style={{ color: statusColor }}>
                {statusText}
                {" · "}
              </span>
            )}
            {live ? (
              <span
                className="inline-flex items-center gap-1 font-semibold"
                style={{ color: "var(--app-amber-text)" }}
              >
                <span
                  aria-hidden
                  className="live-dot h-2 w-2 rounded-full"
                  style={{ background: "var(--app-amber)" }}
                />
                Now
              </span>
            ) : (
              <span className="tabular-nums">
                {eventRowTime(event, now ?? undefined)}
              </span>
            )}
            {cadence ? ` · ${cadence}` : ""}
            {venueLabel ? ` · ${venueLabel}` : ""}
          </p>
          {(mark || accessLabel || distance) && (
            <p
              data-event-row-mark
              className="mt-0.5 flex flex-wrap gap-x-2 text-meta-lg"
              style={{ color: "var(--app-ink-3)" }}
            >
              {mark === "free" ? (
                <span className="font-semibold" style={{ color: "var(--app-brand-2)" }}>
                  Free
                </span>
              ) : mark === "tickets" ? (
                <span className="font-medium" style={{ color: "var(--app-ink-2)" }}>
                  Tickets
                </span>
              ) : null}
              {/* Publisher-stated access (ASL, captions) and a device-fix
                  distance are facts, not marks, so they share this line. */}
              {accessLabel && <span>{accessLabel}</span>}
              {distance && <span className="tabular-nums">{distance}</span>}
            </p>
          )}
        </div>
        {flyer && <EventRowFlyer flyer={flyer} />}
      </Link>
      {trailing ? (
        <div className="relative flex shrink-0 items-center pr-1">{trailing}</div>
      ) : null}
    </article>
  );
}

/**
 * The row's picture: a publisher flyer at 56px, object-contain on sunken
 * paper, decorative (the row's title names the event). It renders only while
 * the image is loading or loaded; an error or the proxy's failure signal
 * removes the frame rather than falling back to a glyph.
 */
function EventRowFlyer({ flyer }: { flyer: EventCardVisual }) {
  return (
    <RadiusPhotoScope src={flyer.src} size={EVENT_ROW_FLYER_SIZE}>
      <RadiusPhotoWhen is="visible">
        <span data-event-card-thumb className="shrink-0 self-center">
          <RadiusPhoto
            size={EVENT_ROW_FLYER_SIZE}
            fit="contain"
            alt=""
            className="rounded-[var(--app-radius-sm)]"
            style={{ boxShadow: "var(--app-edge)" }}
          />
        </span>
      </RadiusPhotoWhen>
    </RadiusPhotoScope>
  );
}

"use client";

import type { RefObject } from "react";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, MapPin, Navigation, Ticket, CalendarCheck } from "lucide-react";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";
import CategoryIcon from "@/components/place/CategoryIcon";
import SaveButton from "@/components/saved/SaveButton";
import EventActions from "@/components/event/EventActions";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import { eventCardVisual } from "@/components/event/eventVisuals";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { eventDateBlock } from "@/lib/events/format";
import { statusLabel } from "@/lib/event-status";
import { formatDistance } from "@/lib/geo";
import { directionsHref } from "@/lib/map/directionsHref";
import { haptic } from "@/lib/haptics";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  eventAttendanceLabel,
  eventAttendanceMode,
  eventOnlineActionUrl,
  hasPhysicalAttendance,
} from "@/lib/events/attendance";

/**
 * EventSheet — the event side of the shared sheet system (app-like
 * pass, phase 2). Browsing a list of forty events used to cost a full
 * page navigation per "maybe"; now a tap answers the three questions
 * that decide attendance — when is it, where is it, what does it cost
 * — in place, with the full page one tap away for the committed.
 *
 * Content mirrors the PlaceSheet's structure (hero with overlaid
 * identity, at-a-glance data row, description, actions, full-page
 * footer) so the two sheets read as one system.
 */
type Props = {
  event: EventWithMeta | null;
  /** Open on a skeleton while the on-demand fetch is in flight. */
  pending?: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  historyLayerId: string;
};

export default function EventSheet({
  event,
  pending = false,
  onClose,
  returnFocusRef,
  historyLayerId,
}: Props) {
  return (
    <BottomSheet
      present={Boolean(event) || pending}
      onClose={onClose}
      ariaLabel={event?.title ?? "Event details"}
      historyLayerId={historyLayerId}
      returnFocusRef={returnFocusRef}
    >
      {(dismiss) =>
        event ? (
          <EventSheetContent event={event} onClose={dismiss} />
        ) : (
          <EventSheetSkeleton onClose={dismiss} />
        )
      }
    </BottomSheet>
  );
}

/** Calm placeholder while the tapped event loads (on-demand path). */
function EventSheetSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <>
      <SheetHandle onClose={onClose} closeLabel="Close" />
      <div
        className="px-5 pb-[88px] pt-4"
        role="status"
        aria-label="Loading event"
      >
        <div className="h-3 w-24 rounded-full" style={{ background: "var(--app-bg-sunken)" }} />
        <div className="mt-3 h-6 w-4/5 rounded-full" style={{ background: "var(--app-bg-sunken)" }} />
        <div className="mt-2 h-6 w-3/5 rounded-full" style={{ background: "var(--app-bg-sunken)" }} />
        <div className="mt-5 h-4 w-40 rounded-full" style={{ background: "var(--app-bg-sunken)" }} />
        <div className="mt-3 h-3 w-full rounded-full" style={{ background: "var(--app-bg-sunken)" }} />
        <div className="mt-2 h-3 w-11/12 rounded-full" style={{ background: "var(--app-bg-sunken)" }} />
        <span className="sr-only">Loading…</span>
      </div>
    </>
  );
}

function EventSheetContent({ event, onClose }: { event: EventWithMeta; onClose: () => void }) {
  const cat = CATEGORY_BY_SLUG[event.category];
  // Hex literal fallback — the accent feeds color-mix()/alpha templates,
  // where a var() would produce invalid CSS (same rule as EventCard).
  const accent: string = cat?.color ?? "#7A7975";
  const accentText = `color-mix(in srgb, ${accent} 55%, var(--app-ink))`;
  const categoryLabel = cat?.name ?? (event.category ? event.category : "Event");
  const date = eventDateBlock(event);
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  const statusBg = isCancelled ? "var(--app-danger)" : "var(--app-warning-press)";
  const attendance = eventAttendanceMode(event);
  const physicalAttendance = hasPhysicalAttendance(event);
  const onlineActionHref = eventOnlineActionUrl(event);
  const ticketHref =
    event.ticket_url ?? event.rsvp_url ??
    (attendance !== "physical" ? onlineActionHref : null);
  const ticketLabel =
    event.ticket_url ? "Tickets" :
    event.rsvp_url ? "RSVP" :
    attendance === "online" ? "Online details" :
    "Online option";
  const attendanceLabel = eventAttendanceLabel(event);
  // Directions are a promise of a real doorstep: only offer them when the
  // coordinate is addressable (same rule that gates distance stamping —
  // an area-centroid event must never hand out turn-by-turn to a point
  // that isn't the event).
  const preciseGeo =
    physicalAttendance &&
    (event.geo_confidence === "venue_match" || event.geo_confidence === "exact_address");
  const eventVisual = eventCardVisual(event);

  return (
    <>
      <SheetHandle onClose={onClose} closeLabel="Close" />
      {/* Event sheets are usually SHORT (they answer when/where/cost, not
       *  everything) so the sheet often ends flush at the viewport bottom —
       *  the footer needs enough padding to clear the floating BottomNav
       *  pill, where the place sheet's long scroll never parks there. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[88px]">
        {/* Hero — the venue's photo when the event carries one, with the
         *  category eyebrow + title overlaid (same cinematic pattern as
         *  the place sheet). Photoless events get a category-tinted
         *  plate so the sheet always opens with an identity. */}
        {eventVisual ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            <Image
              src={eventVisual.src}
              alt=""
              fill
              unoptimized={eventVisual.src.startsWith("/api/place-photo")}
              priority
              sizes="(max-width: 720px) 100vw, 720px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.2) 55%, rgba(0,0,0,0.8) 100%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 p-5 pb-4">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{
                  color: `color-mix(in srgb, ${accent} 35%, white)`,
                  textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                }}
              >
                {categoryLabel}
              </p>
              <h2
                className={`mt-1 font-serif text-[24px] font-semibold leading-tight tracking-tight text-white ${isCancelled ? "line-through opacity-80" : ""}`}
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
              >
                {event.title}
              </h2>
            </div>
            <div className="absolute left-3 top-3 z-10">
              <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
            </div>
          </div>
        ) : null}
        {eventVisual ? (
          <EventVisualCredit
            visual={eventVisual}
            className="border-b px-5 py-2"
          />
        ) : null}

        {/* reveal-up: the sheet's blocks settle top-to-bottom on open —
         *  the one cascade grammar every surface shares. */}
        <div className="reveal-up px-5 pt-4">
          {!eventVisual && (
            <header className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
                style={{
                  background: `color-mix(in srgb, ${accent} 14%, var(--app-bg-sunken))`,
                  color: accent,
                }}
              >
                <CategoryIcon slug={event.category} className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: accentText }}>
                  {categoryLabel}
                </p>
                <h2
                  className={`font-serif text-[22px] font-semibold leading-tight tracking-tight ${isCancelled ? "line-through opacity-80" : ""}`}
                  style={{ color: "var(--app-ink)" }}
                >
                  {event.title}
                </h2>
              </div>
              <div className="shrink-0">
                <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
              </div>
            </header>
          )}

          {/* Cancelled / postponed — loud, first, never mistakable for "on". */}
          {statusText && (
            <p
              className="mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white"
              style={{ background: statusBg }}
            >
              {statusText}
            </p>
          )}

          {/* When — the first question a tap is asking. */}
          <p className="mt-3 text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
            <span className="font-mono tabular-nums">
              {date.weekday} {date.month} {date.day}
            </span>
            {date.time ? (
              <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                {" · "}
                {date.time}
              </span>
            ) : null}
          </p>
          {event.recurrence_text && (
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              {event.recurrence_text}
            </p>
          )}

          {/* Where — venue, address, and honest distance when we have one.
           *  Some feed events carry NO venue name (the title was the venue
           *  and the normalizer blanked the duplicate) — the whole row
           *  hides rather than render an orphaned pin. */}
          {(attendanceLabel || (physicalAttendance && event.address)) && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              {attendanceLabel ? (
                <span className="inline-flex items-center gap-1" style={{ color: "var(--app-ink-2)" }}>
                  {physicalAttendance ? (
                    <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  )}
                  <span className="font-medium">{attendanceLabel}</span>
                </span>
              ) : null}
              {physicalAttendance && event.address ? <span>{event.address}</span> : null}
              {physicalAttendance && event.distance_m !== undefined && (
                <span>
                  <span className="font-mono tabular-nums">{formatDistance(event.distance_m)}</span> away
                </span>
              )}
            </div>
          )}

          {/* Cost — free is a headline, a price is a fact, silence is
           *  honest when the source told us neither. */}
          {(event.is_free || event.price_text) && (
            <p className="mt-2 text-[13px] font-semibold" style={{ color: event.is_free ? "var(--app-positive)" : "var(--app-ink-2)" }}>
              {event.is_free ? "Free" : event.price_text}
            </p>
          )}

          {/* What — the cleaned description, clamped; the full page
           *  carries the whole text. */}
          {event.description && (
            <p className="mt-3 line-clamp-6 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {event.description}
            </p>
          )}

          {(event.presenter || event.organizer) && (
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              Presented by {event.presenter ?? event.organizer}
            </p>
          )}

          {/* One attendance action leads. Directions becomes a neutral
              secondary when tickets or RSVP are available, and calendar/share
              stay visibly labelled instead of joining the row as mystery
              circles. */}
          <div className="mt-4 space-y-2">
            {ticketHref && !isCancelled && (
              <a
                href={ticketHref}
                onClick={() => haptic("light")}
                target="_blank"
                rel="noopener noreferrer"
                className="tactile-lift tactile-interactive flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[12.5px] font-semibold"
                style={{
                  backgroundColor: "var(--app-brand-press)",
                  color: "var(--app-on-brand)",
                }}
              >
                {event.ticket_url ? (
                  <Ticket className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                ) : (
                  <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                )}
                {ticketLabel}
              </a>
            )}
            {preciseGeo && (
              <a
                href={directionsHref(event.geom.lat, event.geom.lng)}
                onClick={() => haptic("light")}
                target="_blank"
                rel="noopener noreferrer"
                className={`tactile-interactive flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[12.5px] font-semibold ${
                  ticketHref && !isCancelled
                    ? "border bg-[var(--app-bg-elevated)]"
                    : "tactile-lift"
                }`}
                style={
                  ticketHref && !isCancelled
                    ? {
                        borderColor: "var(--app-border-strong)",
                        color: "var(--app-ink)",
                      }
                    : {
                        backgroundColor: "var(--app-brand-press)",
                        color: "var(--app-on-brand)",
                      }
                }
              >
                <Navigation
                  className="h-4 w-4"
                  strokeWidth={2.25}
                  style={{
                    color:
                      ticketHref && !isCancelled
                        ? "var(--app-brand-press)"
                        : "var(--app-on-brand)",
                  }}
                  aria-hidden
                />
                Directions
              </a>
            )}
            <EventActions event={event} labeled className="pt-1" />
          </div>

          {/* Make a night of it — the workflow tap (app-like pass): the show
           *  is the anchor, dinner is the question. One link lands on the
           *  map with the venue's peek open and the Eat & drink lens on,
           *  which also surfaces the nearest garage line. Only for events
           *  at a KNOWN venue; a guessed point gets no plan built on it. */}
          {physicalAttendance && event.venue_place_slug && !isCancelled && (
            <div className="mt-4 rounded-[var(--app-radius-md)] border border-dashed p-3" style={{ borderColor: "var(--app-border)" }}>
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Make a night of it
              </p>
              <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                See food, drinks, and parking around {event.venue_name || "the venue"} on the map.
              </p>
              <Link
                href={`/map?open=${encodeURIComponent(event.venue_place_slug)}&intent=eat-drink`}
                onClick={() => { haptic("light"); onClose(); }}
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold"
                style={{ color: "var(--app-brand-press)" }}
              >
                Eat &amp; drink nearby
                <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </div>
          )}

          {/* Footer — the committed tap: the real page, with getting-there,
           *  pairings, and provenance. */}
          <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs" style={{ borderColor: "var(--app-border)" }}>
            <Link
              href={`/events/${event.slug}`}
              onClick={() => { haptic("light"); onClose(); }}
              className="inline-flex items-center gap-1 font-medium"
              style={{ color: "var(--app-brand-press)" }}
            >
              See full page <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
            <span className="font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {event.municipality_name}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

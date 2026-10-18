"use client";

import Image from "next/image";
import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { eventReasons } from "@/lib/event-reasons";
import { eventDecisionLocation, eventDecisionTime } from "@/lib/events/decision-facts";
import DatePlate from "@/components/event/DatePlate";
import { communicationAccessLabels } from "@/lib/events/communication-access";
import { eventDateBlock } from "@/lib/events/format";
import { formatDistance } from "@/lib/geo";
import { eventDisplayTitle } from "@/lib/events/display-title";
import type { EventWithMeta } from "@/lib/loaders/events";
import { statusLabel } from "@/lib/event-status";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { eventCardVisual, sameEventPhotoLicense, type EventCardVisual } from "./eventVisuals";
import { useEventVisualLifecycle } from "./useEventVisualLifecycle";
import EventVisualCredit from "./EventVisualCredit";
import EventArtwork from "./EventArtwork";
import { eventHasTrustworthyEnd, isEventLiveNow } from "@/lib/eventWhenLabel";
import { proxyPhotoAtWidth } from "@/lib/format/img";

export type EventPosterCardProps = {
  event: EventWithMeta;
  /** A visual approved by the surface's source-aware visual planner. */
  visual?: EventCardVisual;
  priorityImage?: boolean;
  whyItMatters?: string;
  live?: boolean;
  /** Server-captured page time keeps started/unknown-end copy stable. */
  nowISO?: string;
  layout?: "hero" | "shelf";
};

/** Never permit an explicit visual to bypass its source or venue binding. */
export function posterVisualForEvent(event: EventWithMeta, explicit?: EventCardVisual): EventCardVisual | null {
  const approved = eventCardVisual(event);
  if (!approved?.caption.trim()) return null;
  if (explicit && (explicit.key !== approved.key || explicit.src !== approved.src
    || explicit.caption !== approved.caption || explicit.presentation !== approved.presentation
    || explicit.objectPosition !== approved.objectPosition
    || !sameEventPhotoLicense(explicit.licensedCredit, approved.licensedCredit)
    || explicit.attribution?.source_uri !== approved.attribution?.source_uri
    || explicit.sourceHref !== approved.sourceHref)) return null;
  return approved;
}

/** A successful one-pixel proxy signal must still collapse unavailable media. */
export function eventPosterPhotoSrc(src: string): string {
  const narrowed = proxyPhotoAtWidth(src, 720);
  if (!narrowed.startsWith("/api/place-photo")) return narrowed;
  const url = new URL(narrowed, "https://frederickradius.local");
  url.searchParams.set("fallback", "signal");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * Give the photograph its own space, then let real event facts grow naturally.
 * Facts never depend on image pixels, an overlay height, or a replacement
 * provider request. Publisher art stays intact, including text at its edges.
 */
export default function EventPosterCard({ event, visual, priorityImage = true, whyItMatters,
  live = false, nowISO, layout = "hero" }: EventPosterCardProps) {
  const cardNow = nowISO ? new Date(nowISO) : null;
  const approved = posterVisualForEvent(event, visual);
  const { identity, visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(approved);
  const photo = visibleVisual?.presentation === "photo" ? visibleVisual : null;
  const artwork = visibleVisual?.presentation === "artwork" ? visibleVisual : null;
  const photoSrc = photo ? eventPosterPhotoSrc(photo.src) : null;
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  const accent = cat?.color ?? "var(--app-brand)";
  const categoryLabel = cat?.name ?? (event.category || "Event");
  const venueLabel = eventDecisionLocation(event);
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  const confirmedLive = status === "scheduled" && live && (cardNow
    ? isEventLiveNow(event, cardNow) : !event.is_all_day && eventHasTrustworthyEnd(event));
  const timingText = eventDecisionTime(event, cardNow ?? undefined);
  const reasons = eventReasons(event, cardNow ?? undefined).filter(reason => reason.kind !== "free");
  const accessLabel = communicationAccessLabels(event)[0];

  return <>
    <article
      data-decision-impression="true" data-decision-surface="events" data-decision-entity="event"
      data-decision-id={event.slug} data-decision-position="lead"
      data-event-poster={photo ? "photo" : artwork ? "artwork" : "category"}
      data-event-fallback={visibleVisual ? undefined : "date-category"}
      className="tactile tactile-feature tactile-ring group relative min-w-0 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      {photo && photoSrc && <figure
        className={`relative w-full overflow-hidden rounded-t-[var(--app-radius-lg)] aspect-[16/10] ${layout === "shelf" ? "lg:aspect-[4/3]" : "lg:aspect-[21/9]"}`}
      >
        <Image key={identity} src={photoSrc} alt="" fill priority={priorityImage}
          unoptimized={photoSrc.startsWith("/api/place-photo")}
          sizes="(max-width: 640px) 100vw, 720px"
          placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
          className="ken-burns object-cover"
          style={{ objectPosition: photo.objectPosition }}
          onLoad={loadEvent => inspectLoadedImage(loadEvent.currentTarget)} onError={failImage}
        />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: accent }} />
      </figure>}
      {artwork && <EventArtwork visual={artwork} priority={priorityImage} credit={false}
        className="p-2 pb-0" onUnavailable={failImage} />}
      <div className="min-w-0 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold">
          {!visibleVisual && <DatePlate month={date.month} day={date.day} weekday={date.weekday} accent={accent} />}
          <span style={{ color: "var(--app-ink-2)" }}>{categoryLabel}</span>
          {confirmedLive && <span className="inline-flex items-center gap-1.5" style={{ color: "var(--app-live-text)" }}>
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-live-text)" }} />
            Happening now
          </span>}
          {statusText && <span style={{ color: isCancelled ? "var(--app-danger-text)" : "var(--state-closing)" }}>{statusText}</span>}
          {visibleVisual && <span className="ml-auto tabular-nums" style={{ color: "var(--app-ink-2)" }}>
            {date.weekday} {date.month} {date.day}
          </span>}
        </div>
        <Link href={`/events/${event.slug}`} data-decision-action="open" prefetch={false}
          className={`block min-h-12 break-words text-[1.375rem] font-semibold leading-tight tracking-tight outline-none after:absolute after:inset-0 after:rounded-[var(--app-radius-lg)] focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
          style={{ color: "var(--app-ink)" }}
        >{eventDisplayTitle(event)}</Link>
        <p className="mt-2 break-words text-sm font-semibold leading-snug tabular-nums" style={{ color: "var(--app-ink)" }}>{timingText}</p>
        {venueLabel && <p className="mt-1 break-words text-sm leading-snug" style={{ color: "var(--app-ink-2)" }}>{venueLabel}</p>}
        {whyItMatters && <p className="mt-2 break-words text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{whyItMatters}</p>}
        {reasons.length > 0 && !confirmedLive && <div className="mt-3"><ReasonChipRow reasons={reasons} /></div>}
        {(event.is_free || event.price_text || accessLabel || event.distance_m !== undefined) && <p
          className="mt-3 flex flex-wrap gap-x-3 gap-y-1 break-words text-xs leading-snug" style={{ color: "var(--app-ink-2)" }}
        >
          {event.is_free ? <span className="font-semibold" style={{ color: "var(--app-list-fact-color, var(--app-positive))" }}>Free</span> : event.price_text ? <span>{event.price_text}</span> : null}
          {accessLabel && <span>{accessLabel}</span>}
          {event.distance_m !== undefined && <span>{formatDistance(event.distance_m)} away</span>}
        </p>}
      </div>
    </article>
    {visibleVisual && <EventVisualCredit visual={visibleVisual} className="mt-1.5 px-1.5" />}
  </>;
}

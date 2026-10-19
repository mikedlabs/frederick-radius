"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3, MapPin } from "lucide-react";
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
import styles from "./EventPosterCard.module.css";

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
      data-event-poster-layout={layout}
      className={`${styles.poster} tactile tactile-feature tactile-ring group relative min-w-0`}
    >
      <div className={`${styles.layout} ${visibleVisual ? styles.hasMedia : ""}`}>
        {photo && photoSrc && <figure className={styles.photo}>
          <Image key={identity} src={photoSrc} alt="" fill priority={priorityImage}
            unoptimized={photoSrc.startsWith("/api/place-photo")}
            sizes="(max-width: 640px) 100vw, 720px"
            placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
            className="ken-burns object-cover"
            style={{ objectPosition: photo.objectPosition }}
            onLoad={loadEvent => inspectLoadedImage(loadEvent.currentTarget)} onError={failImage}
          />
        </figure>}
        {artwork && <EventArtwork visual={artwork} priority={priorityImage} credit={false}
          frame="poster" className={styles.artwork} onUnavailable={failImage} />}
        <div className={styles.body} data-event-poster-facts>
          <div className={styles.heading}>
            <DatePlate month={date.month} day={date.day} weekday={date.weekday} accent="var(--app-brand)" size="sm" />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold" style={{ color: "var(--app-ink-2)" }}>
                <span>{categoryLabel}</span>
                <span className="sr-only">{date.weekday} {date.month} {date.day}</span>
                {confirmedLive && <span className="inline-flex items-center gap-1.5" style={{ color: "var(--app-live-text)" }}>
                  <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-live-text)" }} />
                  Happening now
                </span>}
                {statusText && <span style={{ color: isCancelled ? "var(--app-danger-text)" : "var(--state-closing)" }}>{statusText}</span>}
              </div>
              <Link href={`/events/${event.slug}`} data-decision-action="open" prefetch={false}
                className={`block min-h-12 break-words text-[1.375rem] font-semibold leading-tight tracking-tight outline-none after:absolute after:inset-0 after:rounded-[var(--app-radius-lg)] focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
                style={{ color: "var(--app-ink)" }}
              >{eventDisplayTitle(event)}</Link>
            </div>
          </div>
          <div className={styles.facts}>
            <p data-event-card-time className="flex min-w-0 items-start gap-2.5 text-sm font-semibold leading-snug tabular-nums">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 break-words">{timingText}</span>
            </p>
            {venueLabel && <p data-event-card-venue className="mt-2 flex min-w-0 items-start gap-2.5 text-sm leading-snug" style={{ color: "var(--app-ink-2)" }}>
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 break-words">{venueLabel}</span>
            </p>}
          </div>
          {whyItMatters && <p className="mt-3 break-words text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{whyItMatters}</p>}
          {reasons.length > 0 && !confirmedLive && <div className="mt-3"><ReasonChipRow reasons={reasons} /></div>}
          {(event.is_free || event.price_text || accessLabel || event.distance_m !== undefined) && <p
            className="mt-3 flex flex-wrap gap-x-3 gap-y-1 break-words text-xs leading-snug" style={{ color: "var(--app-ink-2)" }}
          >
            {event.is_free ? <span className="font-semibold">Free</span> : event.price_text ? <span>{event.price_text}</span> : null}
            {accessLabel && <span>{accessLabel}</span>}
            {event.distance_m !== undefined && <span>{formatDistance(event.distance_m)} away</span>}
          </p>}
        </div>
      </div>
    </article>
    {visibleVisual && <EventVisualCredit visual={visibleVisual} className="mt-1.5 px-1.5" />}
  </>;
}

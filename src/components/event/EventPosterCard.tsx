"use client";

import Image from "next/image";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { eventReasons } from "@/lib/event-reasons";
import { eventDecisionLocation, eventDecisionTime } from "@/lib/events/decision-facts";
import { communicationAccessLabels } from "@/lib/events/communication-access";
import { eventDateBlock } from "@/lib/events/format";
import { formatDistance } from "@/lib/geo";
import { eventDisplayTitle } from "@/lib/events/display-title";
import type { EventWithMeta } from "@/lib/loaders/events";
import { statusLabel } from "@/lib/event-status";
import { eventCardVisual, sameEventPhotoLicense, type EventCardVisual } from "./eventVisuals";
import { useEventVisualLifecycle } from "./useEventVisualLifecycle";
import EventVisualCredit from "./EventVisualCredit";
import EventArtwork from "./EventArtwork";
import { eventHasTrustworthyEnd, isEventLiveNow } from "@/lib/eventWhenLabel";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import styles from "./EventPosterCard.module.css";
import EventRow from "./EventRow";

export type EventPosterCardProps = {
  event: EventWithMeta;
  /** A visual approved by the surface's source-aware visual planner. */
  visual?: EventCardVisual;
  priorityImage?: boolean;
  whyItMatters?: string;
  live?: boolean;
  /** Server-captured page time keeps started/unknown-end copy stable. */
  nowISO?: string;
  /** "hero" is the page's one lead and carries the coral time block. A
   * "shelf" poster keeps the plain ink time column. */
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
 * The page's lead event. It is one row on the white ground: the solid coral
 * time block (the only coral field on Events), then the title and facts. An
 * approved picture sits above the facts, never behind them, so facts never
 * depend on image pixels. Publisher art stays intact, including text at its
 * edges. The credit follows the row, outside the event link.
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
  // Reasons are informational, so they read as plain text in the facts line,
  // not as capsules. Distance and live state are already stated elsewhere.
  const reasonLabels = confirmedLive ? [] : eventReasons(event, cardNow ?? undefined)
    .filter(reason => reason.kind !== "free" && reason.kind !== "near" && reason.kind !== "walkable" && reason.kind !== "live_now")
    .map(reason => reason.label);
  const accessLabel = communicationAccessLabels(event)[0];
  const facts = [
    ...reasonLabels,
    event.is_free ? "Free" : event.price_text || null,
    accessLabel || null,
    event.distance_m !== undefined ? `${formatDistance(event.distance_m)} away` : null,
  ].filter(Boolean) as string[];
  const poster = { kind: photo ? "photo" : artwork ? "artwork" : "category", layout } as const;

  const banner = photo && photoSrc ? (
    <figure className={styles.photo}>
      <Image key={identity} src={photoSrc} alt="" fill priority={priorityImage}
        unoptimized={photoSrc.startsWith("/api/place-photo")}
        sizes="(max-width: 640px) 100vw, 720px"
        placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
        className="object-cover"
        style={{ objectPosition: photo.objectPosition }}
        onLoad={loadEvent => inspectLoadedImage(loadEvent.currentTarget)} onError={failImage}
      />
    </figure>
  ) : artwork ? (
    <EventArtwork visual={artwork} priority={priorityImage} credit={false}
      frame="poster" className={styles.artwork} onUnavailable={failImage} />
  ) : null;

  return <>
    <EventRow
      lead={layout === "hero"}
      position="lead"
      headingLevel={2}
      poster={poster}
      banner={banner}
      slug={event.slug}
      title={eventDisplayTitle(event)}
      weekday={date.weekday}
      month={date.month}
      day={date.day}
      startTime={date.time}
      timing={timingText}
      category={categoryLabel}
      live={confirmedLive}
      status={statusText}
      statusColor={isCancelled ? "var(--app-danger-text)" : "var(--state-closing)"}
      cancelled={isCancelled}
      where={venueLabel}
      extra={whyItMatters || facts.length > 0 ? <>
        {whyItMatters ? <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{whyItMatters}</p> : null}
        {facts.length > 0 ? <p className="mt-1 text-[13px] leading-snug tabular-nums" style={{ color: "var(--app-ink-2)" }}>{facts.join(" · ")}</p> : null}
      </> : null}
    />
    {visibleVisual && <EventVisualCredit visual={visibleVisual} className="mt-1.5" />}
  </>;
}

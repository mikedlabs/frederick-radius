"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { eventReasons } from "@/lib/event-reasons";
import { eventDecisionLocation, eventDecisionTime } from "@/lib/events/decision-facts";
import DatePlate from "@/components/event/DatePlate";
import { communicationAccessLabels } from "@/lib/events/communication-access";
import { eventDateBlock } from "@/lib/events/format";
import { formatDistance } from "@/lib/geo";
import type { EventWithMeta } from "@/lib/loaders/events";
import { statusLabel } from "@/lib/event-status";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import {
  eventCardVisual,
  type EventCardVisual,
} from "@/components/event/eventVisuals";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import {
  eventHasTrustworthyEnd,
  isEventLiveNow,
} from "@/lib/eventWhenLabel";
import { proxyPhotoAtWidth } from "@/lib/format/img";

export type EventPosterCardProps = {
  event: EventWithMeta;
  /**
   * A visual already approved by the surface's visual planner. When omitted,
   * the card runs the same source-aware resolver itself.
   */
  visual?: EventCardVisual;
  priorityImage?: boolean;
  whyItMatters?: string;
  /** Compact shelves do not add an outer live badge, so the poster owns it. */
  live?: boolean;
  /** Server-captured page time, used for stable started/unknown-end copy. */
  nowISO?: string;
  /**
   * Shelf cards keep a taller desktop face so two-line titles, metadata, and
   * reason chips never collide with the category row.
   */
  layout?: "hero" | "shelf";
};

/**
 * Resolve the poster face without ever falling back to `event.hero_image`
 * directly. Place-photo proxy URLs are accepted only when the event carries
 * the matching author and direct Google Maps source; an accidentally supplied
 * explicit visual still fails closed to the honest category plate.
 */
export function posterVisualForEvent(
  event: EventWithMeta,
  explicit?: EventCardVisual,
): EventCardVisual | null {
  const approved = eventCardVisual(event);
  if (!approved?.caption.trim()) return null;
  if (
    explicit &&
    (explicit.key !== approved.key ||
      explicit.src !== approved.src ||
      explicit.caption !== approved.caption ||
      explicit.attribution?.source_uri !== approved.attribution?.source_uri ||
      explicit.sourceHref !== approved.sourceHref)
  ) {
    return null;
  }
  return approved;
}

/**
 * A venue-photo proxy can fail with a successful SVG response. Ask it for the
 * transparent 1px failure signal so the card can switch to its designed date
 * plate instead of presenting an error graphic as event photography.
 */
export function eventPosterPhotoSrc(src: string): string {
  const narrowed = proxyPhotoAtWidth(src, 720);
  if (!narrowed.startsWith("/api/place-photo")) return narrowed;
  const url = new URL(narrowed, "https://frederickradius.local");
  url.searchParams.set("fallback", "signal");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * The image-led event card used for a horizon lead.
 *
 * An approved event or venue photograph gets a source caption. Everything
 * else gets a compact date-led card, keeping timing and place visible without
 * reserving an empty photograph-shaped panel.
 */
export default function EventPosterCard({
  event,
  visual,
  priorityImage = true,
  whyItMatters,
  live = false,
  nowISO,
  layout = "hero",
}: EventPosterCardProps) {
  const cardNow = nowISO ? new Date(nowISO) : null;
  const safeVisual = posterVisualForEvent(event, visual);
  const photoSrc = safeVisual ? eventPosterPhotoSrc(safeVisual.src) : null;
  const [failedPhotoSrc, setFailedPhotoSrc] = useState<string | null>(null);
  const onPhoto = safeVisual !== null && photoSrc !== failedPhotoSrc;
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  const accent = cat?.color ?? "#7A7975";
  const accentText = `color-mix(in srgb, ${accent} 55%, var(--app-ink))`;
  const categoryLabel = cat?.name ?? (event.category ? event.category : "Event");
  const venueLabel = eventDecisionLocation(event);
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  const confirmedLive =
    status === "scheduled" &&
    live &&
    (cardNow
      ? isEventLiveNow(event, cardNow)
      : !event.is_all_day && eventHasTrustworthyEnd(event));
  const timingText = eventDecisionTime(event, cardNow ?? undefined);
  const statusBg =
    isCancelled ? "var(--app-danger)" : "var(--app-warning-press)";
  const reasons = eventReasons(event, cardNow ?? undefined).filter((reason) => reason.kind !== "free");
  const accessLabel = communicationAccessLabels(event)[0];
  const titleColor = onPhoto ? "#fff" : "var(--app-ink)";
  const subColor = onPhoto ? "rgba(255,255,255,0.92)" : "var(--app-ink-2)";
  const eyebrowColor = onPhoto
    ? `color-mix(in srgb, ${accent} 45%, #fff)`
    : accentText;
  const supportingColor = onPhoto
    ? "rgba(255,255,255,0.82)"
    : "var(--app-ink-2)";

  // Missing photography should yield a compact, date-led decision, not an
  // empty image-sized canvas. The same state handles a failed photo request.
  if (!onPhoto) {
    return (
      <article
        data-decision-impression="true"
        data-decision-surface="events"
        data-decision-entity="event"
        data-decision-id={event.slug}
        data-decision-position="lead"
        data-event-poster="category"
        data-event-fallback="date-category"
        className="group relative rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-4 sm:p-5"
        style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-brand)", borderTopWidth: 3 }}
      >
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold">
          <span style={{ color: "var(--app-ink-3)" }}>{categoryLabel}</span>
          {confirmedLive && <span style={{ color: "var(--app-amber-text)" }}>Happening now</span>}
          {statusText && <span style={{ color: statusBg }}>{statusText}</span>}
        </div>
        <div className="flex items-start gap-3 sm:gap-4">
          <DatePlate month={date.month} day={date.day} weekday={date.weekday} accent={accent} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/events/${event.slug}`}
              data-decision-action="open"
              prefetch={false}
              className={`text-[20px] font-semibold leading-tight tracking-tight outline-none after:absolute after:inset-0 focus-visible:underline ${isCancelled ? "line-through opacity-70" : ""}`}
              style={{ color: "var(--app-ink)" }}
            >
              {event.title}
            </Link>
            <p className="mt-1.5 text-[13px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>{timingText}</p>
            {venueLabel && <p className="mt-0.5 text-[13px]" style={{ color: "var(--app-ink-2)" }}>{venueLabel}</p>}
            {whyItMatters && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{whyItMatters}</p>}
            {reasons.length > 0 && !confirmedLive && <div className="mt-2"><ReasonChipRow reasons={reasons} /></div>}
            {(event.is_free || event.price_text || accessLabel || event.distance_m !== undefined) && (
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                {event.is_free ? <span style={{ color: "var(--app-positive)" }}>Free</span> : event.price_text ? <span>{event.price_text}</span> : null}
                {accessLabel && <span>{accessLabel}</span>}
                {event.distance_m !== undefined && <span>{formatDistance(event.distance_m)} away</span>}
              </p>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <>
    <article
      data-decision-impression="true"
      data-decision-surface="events"
      data-decision-entity="event"
      data-decision-id={event.slug}
      data-decision-position="lead"
      className={`tactile tactile-feature tactile-ring tactile-interactive group relative w-full overflow-hidden rounded-[var(--app-radius-lg)] aspect-[3/2] ${layout === "shelf" ? "lg:aspect-[4/3]" : "lg:aspect-[21/9]"}`}
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        viewTransitionName: `event-${event.slug}`,
      }}
      data-event-poster={onPhoto ? "photo" : "category"}
    >
      {safeVisual && onPhoto && photoSrc ? (
        <>
          <Image
            src={photoSrc}
            alt=""
            fill
            priority={priorityImage}
            unoptimized={photoSrc.startsWith("/api/place-photo")}
            sizes="(max-width: 640px) 100vw, 720px"
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            className="ken-burns object-cover"
            onLoad={(loadEvent) => {
              if (
                loadEvent.currentTarget.naturalWidth <= 1 ||
                loadEvent.currentTarget.naturalHeight <= 1
              ) {
                setFailedPhotoSrc(photoSrc);
              }
            }}
            onError={() => setFailedPhotoSrc(photoSrc)}
          />
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.82) 2%, rgba(0,0,0,0.34) 43%, transparent 72%)",
            }}
          />
        </>
      ) : null}

      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent, opacity: onPhoto ? 0.9 : 1 }}
      />

      <div
        className="absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-3.5"
      >
        <span
          className="truncate text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{
            color: eyebrowColor,
            textShadow: onPhoto ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
          }}
        >
          {categoryLabel}
        </span>
        {/* Amber fill with Ink on top — the brand table's own spec for the
            live/caution state (5.7:1, clears AA). It was the positive green
            with white text, which made LIVE and Free the same signal. */}
        {confirmedLive && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
            style={{ background: "var(--app-amber)", color: "var(--app-ink)" }}
          >
            <span
              className="live-dot h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--app-ink)" }}
            />
            Live
          </span>
        )}
        {statusText && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white"
            style={{ background: statusBg }}
          >
            {statusText}
          </span>
        )}
        {!safeVisual && event.distance_m !== undefined && (
          <span
            className="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {formatDistance(event.distance_m)}
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <Link
          href={`/events/${event.slug}`}
          data-decision-action="open"
          prefetch={false}
          className={`flex min-h-11 items-end font-serif text-[21px] leading-[1.08] tracking-tight outline-none focus-visible:underline ${
            isCancelled ? "line-through opacity-70" : ""
          }`}
          style={{ color: titleColor }}
        >
          <span className="absolute inset-0" aria-hidden />
          <span className="line-clamp-2">{event.title}</span>
        </Link>
        <p className="mt-1 text-[13px]" style={{ color: subColor }}>
          {date.weekday && (
            <span className="font-mono tabular-nums">
              {date.weekday} {date.month} {date.day}
            </span>
          )}
          {timingText && (
            <span className="font-mono tabular-nums">{" · "}{timingText}</span>
          )}
          {venueLabel ? ` · ${venueLabel}` : ""}
          {safeVisual && event.distance_m !== undefined
            ? ` · ${formatDistance(event.distance_m)}`
            : ""}
        </p>
        {whyItMatters && (
          <p
            className="mt-1 line-clamp-1 text-[12.5px] leading-snug"
            style={{ color: supportingColor }}
          >
            {whyItMatters}
          </p>
        )}
        {(reasons.length > 0 || event.is_free || accessLabel) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {event.is_free && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{
                  background: onPhoto
                    ? "rgba(255,255,255,0.92)"
                    : "color-mix(in srgb, var(--app-positive) 14%, transparent)",
                  color: "var(--app-positive)",
                }}
              >
                Free
              </span>
            )}
            {accessLabel && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{
                  background: onPhoto
                    ? "rgba(255,255,255,0.92)"
                    : "color-mix(in srgb, var(--app-cool) 14%, transparent)",
                  color: "var(--app-cool)",
                }}
              >
                {accessLabel}
              </span>
            )}
            {!onPhoto && reasons.length > 0 && (
              <ReasonChipRow reasons={reasons} />
            )}
          </div>
        )}
      </div>
    </article>
      {safeVisual && onPhoto && (
        <EventVisualCredit
          visual={safeVisual}
          compact
          className="mt-1.5 px-1.5 text-right"
        />
      )}
    </>
  );
}

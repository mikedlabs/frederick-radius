"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useEventVisualLifecycle } from "@/components/event/useEventVisualLifecycle";
import { placePhotoFailureSignalSrc } from "@/lib/place-card-photo";
import EventArtwork from "@/components/event/EventArtwork";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import type { EventCardVisual } from "@/components/event/eventVisuals";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/** Keep optional media and its credit together while the factual headline
 * remains server-rendered children. Failed media never removes the event.
 * A follow-up choice in a list passes `actionCue={false}`: the whole card is
 * already the link, so an imageless follow-up drops the repeated "View event"
 * label and the lift shadow, sits as a flat hairline item under the lead and
 * answers a pointer with a surface change instead of the arrow nudge.
 * Keyboard focus rings the whole card from the article, because the article
 * clips an outline drawn by the link under the media. The link keeps its own
 * inset ring only where `:has()` is unavailable. */
export default function TodayHeadlineCard({
  eventSlug, titleId, detailId, visual, accent: _accent, priority, actionCue = true, children,
}: {
  eventSlug: string;
  titleId: string;
  detailId: string;
  visual: EventCardVisual | null;
  accent: string;
  priority: boolean;
  actionCue?: boolean;
  children: ReactNode;
}) {
  const { identity, visibleVisual, failImage: unavailable, inspectLoadedImage } = useEventVisualLifecycle(visual);

  return (
    <article data-decision-impression="true" data-decision-surface="today" data-decision-entity="event" data-decision-id={eventSlug} data-decision-position="result" data-today-event-row className="min-w-0 border-b has-[>a:focus-visible]:outline-2 has-[>a:focus-visible]:outline-offset-2 has-[>a:focus-visible]:outline-[var(--app-focus)]" style={{ borderColor: "var(--app-border)" }}>
      <Link
        href={`/events/${eventSlug}`}
        prefetch={false}
        aria-labelledby={titleId}
        aria-describedby={detailId}
        className="focus-ring-inset group block min-w-0 supports-[selector(:has(*))]:outline-none!"
      >
        {visibleVisual?.presentation === "artwork" ? (
          <EventArtwork visual={visibleVisual} priority={priority} credit={false}
            className="mt-4 overflow-hidden rounded-[var(--app-radius-md)]" onUnavailable={unavailable} />
        ) : visibleVisual ? (
          <figure
            className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-[var(--app-radius-md)] sm:aspect-[21/9]"
          >
            <Image key={identity} src={placePhotoFailureSignalSrc(visibleVisual.src)} alt="" fill priority={priority}
              unoptimized={visibleVisual.src.startsWith("/api/place-photo")}
              sizes="(max-width: 640px) 100vw, 720px"
              placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
              className="ken-burns object-cover"
              style={{ objectPosition: visibleVisual.objectPosition }}
              onLoad={(event) => inspectLoadedImage(event.currentTarget)}
              onError={unavailable}
            />
          </figure>
        ) : null}
        <div className="min-w-0 py-4 [overflow-wrap:anywhere] group-hover:[&_h3]:underline">
          {children}
          {actionCue && !visibleVisual && <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--app-link)" }}>
            View event<ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" strokeWidth={2.1} />
          </span>}
        </div>
      </Link>
      {visibleVisual && <EventVisualCredit visual={visibleVisual} className="pb-3" />}
    </article>
  );
}

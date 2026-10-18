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
 * remains server-rendered children. Failed media never removes the event. */
export default function TodayHeadlineCard({
  eventSlug, titleId, detailId, visual, accent, priority, children,
}: {
  eventSlug: string;
  titleId: string;
  detailId: string;
  visual: EventCardVisual | null;
  accent: string;
  priority: boolean;
  children: ReactNode;
}) {
  const { identity, visibleVisual, failImage: unavailable, inspectLoadedImage } = useEventVisualLifecycle(visual);

  return (
    <article className="min-w-0">
      <Link
        href={`/events/${eventSlug}`}
        prefetch={false}
        aria-labelledby={titleId}
        aria-describedby={detailId}
        className={`group block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--app-bg)] ${visibleVisual ? "" : "border-y py-4"}`}
        style={visibleVisual ? undefined : { borderColor: "var(--app-border)" }}
      >
        {children}
        {visibleVisual?.presentation === "artwork" ? (
          <EventArtwork visual={visibleVisual} priority={priority} credit={false}
            className="mt-3" onUnavailable={unavailable} />
        ) : visibleVisual ? (
          <figure
            className="relative mt-3 aspect-[16/9] w-full overflow-hidden rounded-[var(--app-radius-lg)] sm:aspect-[21/9]"
            style={{ boxShadow: "var(--app-elev-1), var(--app-edge)" }}
          >
            <Image key={identity} src={placePhotoFailureSignalSrc(visibleVisual.src)} alt="" fill priority={priority}
              unoptimized={visibleVisual.src.startsWith("/api/place-photo")}
              sizes="(max-width: 640px) 100vw, 720px"
              placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
              className="ken-burns object-cover"
              onLoad={(event) => inspectLoadedImage(event.currentTarget)}
              onError={unavailable}
            />
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.9 }} />
          </figure>
        ) : (
          <span className="mt-3 inline-flex items-center gap-1.5 px-0.5 text-sm font-semibold"
            style={{ color: "var(--app-brand-press)" }}>
            View event
            <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" strokeWidth={2.1} />
          </span>
        )}
      </Link>
      {visibleVisual && <EventVisualCredit visual={visibleVisual} className="mt-1.5 px-0.5" />}
    </article>
  );
}

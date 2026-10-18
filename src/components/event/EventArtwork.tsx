"use client";

import Image from "next/image";
import { useEventVisualLifecycle } from "./useEventVisualLifecycle";
import EventVisualCredit from "./EventVisualCredit";
import type { EventCardVisual } from "./eventVisuals";

/**
 * Publisher images can be flyers, logos, or photographs. Without a verified
 * photographic classification, keep every edge visible and let the event's
 * own text carry its title, time, status, and actions on a reading surface.
 */
export default function EventArtwork({
  visual,
  priority = false,
  credit = true,
  className,
  onUnavailable,
}: {
  visual: EventCardVisual;
  priority?: boolean;
  /** Cards render credit outside their stretched event link. */
  credit?: boolean;
  className?: string;
  onUnavailable?: () => void;
}) {
  const { visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(visual);
  if (visual.presentation !== "artwork" || !visibleVisual) return null;
  const unavailable = () => {
    if (failImage()) onUnavailable?.();
  };

  return (
    <figure data-event-artwork className={className}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]">
        <Image
          key={visual.src}
          src={visual.src}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 720px) 100vw, 720px"
          className="object-contain p-3"
          onLoad={(event) => inspectLoadedImage(event.currentTarget, onUnavailable)}
          onError={unavailable}
        />
      </div>
      {credit && (
        <figcaption className="mt-1.5">
          <EventVisualCredit visual={visual} />
        </figcaption>
      )}
    </figure>
  );
}

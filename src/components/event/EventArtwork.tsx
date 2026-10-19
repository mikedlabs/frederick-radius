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
  frame = "standard",
}: {
  visual: EventCardVisual;
  priority?: boolean;
  /** Cards render credit outside their stretched event link. */
  credit?: boolean;
  className?: string;
  onUnavailable?: () => void;
  /** Leads give intact publisher artwork a wider, unpadded presentation. */
  frame?: "standard" | "poster";
}) {
  const { visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(visual);
  if (visual.presentation !== "artwork" || !visibleVisual) return null;
  const unavailable = () => {
    if (failImage()) onUnavailable?.();
  };

  return (
    <figure data-event-artwork className={className}>
      <div data-event-artwork-frame={frame} className={`relative w-full overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] ${frame === "poster" ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
        <Image
          key={visual.src}
          src={visual.src}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 720px) 100vw, 720px"
          className={frame === "poster" ? "object-contain" : "object-contain p-3"}
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

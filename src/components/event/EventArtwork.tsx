"use client";

import Image from "next/image";
import { useState } from "react";
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
  /** Leads (Today and Events) give intact publisher artwork a wider, unpadded
   * presentation on the page ground, aligned to the row's left edge so it
   * lines up with the facts below it. The standard frame keeps the padded
   * soft gray inset for the event page and sheet. */
  frame?: "standard" | "poster";
}) {
  const [uprightPoster, setUprightPoster] = useState<string | null>(null);
  const { visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(visual);
  if (visual.presentation !== "artwork" || !visibleVisual) return null;
  const unavailable = () => {
    if (failImage()) onUnavailable?.();
  };

  return (
    <figure data-event-artwork className={className}>
      <div data-event-artwork-frame={frame} data-upright-poster={uprightPoster === visual.src || undefined} className={`relative w-full overflow-hidden rounded-[var(--app-radius-md)] ${frame === "poster" ? "aspect-[16/10] bg-transparent" : "aspect-[4/3] bg-[var(--app-bg-sunken)]"}`}>
        <Image
          key={visual.src}
          src={visual.src}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 720px) 100vw, 720px"
          className={frame === "poster" ? "object-contain object-left" : "object-contain p-3"}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (frame === "poster" && image.naturalHeight > 0) {
              setUprightPoster(image.naturalWidth / image.naturalHeight < 1.25 ? visual.src : null);
            }
            inspectLoadedImage(image, onUnavailable);
          }}
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

"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = useRef<string | null>(visual.src);
  useLayoutEffect(() => {
    currentSrc.current = visual.src;
    return () => { currentSrc.current = null; };
  }, [visual.src]);
  if (visual.presentation !== "artwork" || failedSrc === visual.src) return null;

  const unavailable = () => {
    if (currentSrc.current !== visual.src) return;
    setFailedSrc(visual.src);
    onUnavailable?.();
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
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1) unavailable();
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

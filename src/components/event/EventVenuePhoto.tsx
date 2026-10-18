"use client";

import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import EventVisualCredit from "./EventVisualCredit";
import type { EventCardVisual } from "./eventVisuals";
import { useEventVisualLifecycle } from "./useEventVisualLifecycle";

/** Supplementary venue photography never owns the title or attendance facts.
 * A real failure removes the crop and its credit without requesting a refill. */
export default function EventVenuePhoto({ visual, className = "", priority = false }: {
  visual: EventCardVisual;
  className?: string;
  priority?: boolean;
}) {
  const { identity, visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(visual);
  if (!visibleVisual || visibleVisual.presentation !== "photo") return null;
  let src = proxyPhotoAtWidth(visibleVisual.src, 720);
  if (src.startsWith("/api/place-photo")) {
    const proxy = new URL(src, "https://frederickradius.local");
    proxy.searchParams.set("fallback", "signal");
    src = `${proxy.pathname}${proxy.search}${proxy.hash}`;
  }
  return <div data-event-venue-media className={className}>
    <figure className="relative aspect-[16/9] w-full overflow-hidden rounded-[var(--app-radius-md)]">
      <Image key={identity} src={src} alt="" fill priority={priority}
        unoptimized={src.startsWith("/api/place-photo")}
        sizes="(max-width: 720px) 100vw, 720px"
        placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
        className="object-cover" style={{ objectPosition: visibleVisual.objectPosition }}
        onLoad={event => inspectLoadedImage(event.currentTarget)} onError={failImage}
      />
    </figure>
    <EventVisualCredit visual={visibleVisual} className="mt-1.5" />
  </div>;
}

"use client";

import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { placePhotoFailureSignalSrc } from "@/lib/place-card-photo";
import EventRow, { type EventRowProps } from "./EventRow";
import EventVisualCredit from "./EventVisualCredit";
import type { EventCardVisual } from "./eventVisuals";
import { useEventVisualLifecycle } from "./useEventVisualLifecycle";
import styles from "./EventRow.module.css";

/** An event row with an approved picture: a square thumbnail at the right
 * edge and its credit under the facts. A photograph fills the square; publisher
 * artwork stays whole on a transparent ground, because only verified photos
 * may crop (see eventVisuals.ts). A failed image removes both, marks the row
 * media-free, and leaves the row's facts and link in place. */
export default function EventRowMedia({ visual, compactCredit = false, ...row }: Omit<EventRowProps, "media" | "mediaCredit" | "mediaKind"> & {
  visual: EventCardVisual | null;
  /** Glance rows keep the small credit they always had; discovery rows use
   * reading-size credit copy that grows with enlarged text. */
  compactCredit?: boolean;
}) {
  const { identity, visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(visual);
  if (!visibleVisual) return <EventRow {...row} mediaKind="none" />;
  const fit = visibleVisual.presentation === "photo" ? "object-cover" : "object-contain";
  const src = placePhotoFailureSignalSrc(proxyPhotoAtWidth(visibleVisual.src, 132));
  return (
    <EventRow
      {...row}
      mediaKind={visibleVisual.presentation}
      media={
        <figure className={styles.thumb} data-event-row-thumb={visibleVisual.presentation}>
          <Image
            key={identity}
            src={src}
            alt=""
            fill
            unoptimized={src.startsWith("/api/place-photo")}
            loading="lazy"
            sizes="64px"
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            className={fit}
            style={visibleVisual.objectPosition ? { objectPosition: visibleVisual.objectPosition } : undefined}
            onLoad={(event) => inspectLoadedImage(event.currentTarget)}
            onError={failImage}
          />
        </figure>
      }
      mediaCredit={<EventVisualCredit visual={visibleVisual} compact={compactCredit} className={styles.credit} />}
    />
  );
}

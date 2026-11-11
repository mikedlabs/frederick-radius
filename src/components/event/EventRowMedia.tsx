"use client";

import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import EventVisualCredit from "./EventVisualCredit";
import type { EventCardVisual } from "./eventVisuals";
import { useEventVisualLifecycle } from "./useEventVisualLifecycle";
import styles from "./EventRow.module.css";

/** An approved event picture inside a typographic row: a 64px square at the
 * right edge and its credit under the facts. A failed image removes both and
 * leaves the row's facts in place. */
export default function EventRowMedia({ visual }: { visual: EventCardVisual | null }) {
  const { identity, visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(visual);
  if (!visibleVisual) return null;
  let src = proxyPhotoAtWidth(visibleVisual.src, 132);
  if (src.startsWith("/api/place-photo")) {
    const proxy = new URL(src, "https://frederickradius.local");
    proxy.searchParams.set("fallback", "signal");
    src = `${proxy.pathname}${proxy.search}${proxy.hash}`;
  }
  return (
    <>
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
          className={visibleVisual.presentation === "artwork" ? styles.thumbArtwork : styles.thumbPhoto}
          style={visibleVisual.objectPosition ? { objectPosition: visibleVisual.objectPosition } : undefined}
          onLoad={(event) => inspectLoadedImage(event.currentTarget)}
          onError={failImage}
        />
      </figure>
      <EventVisualCredit visual={visibleVisual} compact inlineLicensed className={styles.credit} />
    </>
  );
}

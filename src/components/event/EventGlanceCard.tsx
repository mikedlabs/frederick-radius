"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEventVisualLifecycle } from "./useEventVisualLifecycle";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import EventVisualCredit from "./EventVisualCredit";
import type { EventCardVisual } from "./eventVisuals";
import styles from "./EventGlanceCard.module.css";

/** Only the optional thumbnail needs client state. EventCard's factual
 * children and its other variants retain their server-compatible boundary. */
export default function EventGlanceCard({ eventSlug, visual, accent, cancelled, children, surface = "events", compactCredit = true }: {
  eventSlug: string;
  visual: EventCardVisual | null;
  accent: string;
  cancelled: boolean;
  children: ReactNode;
  surface?: "events" | "today";
  compactCredit?: boolean;
}) {
  const { identity, visibleVisual, failImage, inspectLoadedImage } = useEventVisualLifecycle(visual);
  let imageSrc = visibleVisual ? proxyPhotoAtWidth(visibleVisual.src, 132) : null;
  if (imageSrc?.startsWith("/api/place-photo")) {
    const proxy = new URL(imageSrc, "https://frederickradius.local");
    proxy.searchParams.set("fallback", "signal");
    imageSrc = `${proxy.pathname}${proxy.search}${proxy.hash}`;
  }

  return (
    <article
      data-decision-impression="true"
      data-decision-surface={surface}
      data-decision-entity="event"
      data-decision-id={eventSlug}
      data-decision-position="result"
      className={`${styles.card} event-card--glance tactile relative rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-3`}
      style={{ borderColor: "var(--app-border)", boxShadow: `var(--app-list-card-shadow, inset 3px 0 0 ${accent}, var(--app-edge), var(--app-hi), var(--app-elev-1))` }}
    >
      <Link href={`/events/${eventSlug}`} data-decision-action="open" data-press-target="card" prefetch={false} className={`block min-h-11 rounded-[var(--app-radius-sm)] outline-none ${cancelled ? "line-through opacity-70" : ""}`} style={{ color: "var(--app-ink)" }}>
        <div data-press-face className={styles.content}>
          {children}
          {visibleVisual && imageSrc && (
            <figure className={styles.figure}>
              <div className="relative h-full min-h-[96px] w-full overflow-hidden rounded-[var(--app-radius-md)]">
                <Image
                  key={identity}
                  src={imageSrc} alt="" fill
                  unoptimized={imageSrc.startsWith("/api/place-photo")}
                  loading="lazy"
                  sizes="auto, min(100vw, 480px)"
                  placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
                  className={visibleVisual.presentation === "artwork" ? "object-contain bg-[var(--app-bg-sunken)] p-1" : "object-cover"}
                  style={visibleVisual.objectPosition ? { objectPosition: visibleVisual.objectPosition } : undefined}
                  onLoad={(event) => inspectLoadedImage(event.currentTarget)}
                  onError={failImage}
                />
                <span aria-hidden className="absolute inset-0 rounded-[10px]" style={{ boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.10)" }} />
              </div>
            </figure>
          )}
        </div>
      </Link>
      {visibleVisual && <EventVisualCredit visual={visibleVisual} compact={compactCredit} className="relative z-10 mt-1.5" />}
    </article>
  );
}

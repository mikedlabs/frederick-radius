"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import EventVisualCredit from "./EventVisualCredit";
import type { EventCardVisual } from "./eventVisuals";

/** Only the optional thumbnail needs client state. EventCard's factual
 * children and its other variants retain their server-compatible boundary. */
export default function EventGlanceCard({ eventSlug, visual, accent, cancelled, children }: {
  eventSlug: string;
  visual: EventCardVisual | null;
  accent: string;
  cancelled: boolean;
  children: ReactNode;
}) {
  const identity = visual ? `${visual.key}\u0000${visual.src}` : null;
  const currentIdentity = useRef(identity);
  const [failedIdentity, setFailedIdentity] = useState<string | null>(null);
  useLayoutEffect(() => {
    currentIdentity.current = identity;
    return () => { currentIdentity.current = null; };
  }, [identity]);
  const visibleVisual = identity !== failedIdentity ? visual : null;
  let imageSrc = visibleVisual ? proxyPhotoAtWidth(visibleVisual.src, 132) : null;
  if (imageSrc?.startsWith("/api/place-photo")) {
    const proxy = new URL(imageSrc, "https://frederickradius.local");
    proxy.searchParams.set("fallback", "signal");
    imageSrc = `${proxy.pathname}${proxy.search}${proxy.hash}`;
  }
  const failImage = () => {
    // An old request can finish after this card has been recycled. It must
    // neither hide the new source nor overwrite that source's failure state.
    if (identity !== null && currentIdentity.current === identity) setFailedIdentity(identity);
  };

  return (
    <article
      data-decision-impression="true"
      data-decision-surface="events"
      data-decision-entity="event"
      data-decision-id={eventSlug}
      data-decision-position="result"
      className="event-card--glance tactile tactile-interactive group relative rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-3 transition-transform duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)] hover:scale-[1.01] active:scale-[0.98]"
      style={{ borderColor: "var(--app-border)", boxShadow: `var(--app-list-card-shadow, inset 3px 0 0 ${accent}, var(--app-edge), var(--app-hi), var(--app-elev-1))` }}
    >
      <Link href={`/events/${eventSlug}`} data-decision-action="open" prefetch={false} className={`block outline-none ${cancelled ? "line-through opacity-70" : ""}`} style={{ color: "var(--app-ink)" }}>
        <div className="flex items-stretch gap-3">
          {children}
          {visibleVisual && imageSrc && (
            <figure className="w-[96px] shrink-0 self-stretch sm:w-[132px]">
              <div className="relative h-full min-h-[96px] w-full overflow-hidden rounded-[var(--app-radius-md)]">
                <Image
                  key={identity}
                  src={imageSrc} alt="" fill
                  unoptimized={imageSrc.startsWith("/api/place-photo")}
                  sizes="(min-width: 640px) 132px, 96px"
                  placeholder="blur" blurDataURL={PAPER_CREAM_BLUR}
                  className={visibleVisual.presentation === "artwork" ? "object-contain bg-[var(--app-bg-sunken)] p-1" : "object-cover transition-transform duration-700 ease-out group-hover:scale-105"}
                  onLoad={(event) => {
                    if (event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1) failImage();
                  }}
                  onError={failImage}
                />
                <span aria-hidden className="absolute inset-0 rounded-[10px]" style={{ boxShadow: "inset 0 0 0 1px rgba(20,20,18,0.10)" }} />
              </div>
            </figure>
          )}
        </div>
      </Link>
      {visibleVisual && <EventVisualCredit visual={visibleVisual} compact className="relative z-10 mt-1.5" />}
    </article>
  );
}

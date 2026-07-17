"use client";

import { useMemo, type ReactNode } from "react";
import { useEventSheet } from "./EventSheetProvider";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * EventSheetBoundary — progressive enhancement by event delegation.
 *
 * Event cards keep their real `/events/[slug]` anchors (SEO, long-press
 * previews, middle-click, copy-link all keep working). Inside this
 * boundary, a PLAIN left-click on one of those anchors is intercepted
 * and answered with the EventSheet instead of a navigation — when, and
 * only when, the slug resolves in the boundary's own event set, so a
 * link to an event we don't have client-side falls through to the page
 * it always went to.
 *
 * Modified clicks (cmd/ctrl/shift/alt, non-primary button) and anchors
 * targeting a new tab always pass through untouched — the browser's
 * contract beats ours.
 */
export default function EventSheetBoundary({
  events,
  children,
  className,
}: {
  events: EventWithMeta[];
  children: ReactNode;
  className?: string;
}) {
  const { openEventSheet } = useEventSheet();
  const bySlug = useMemo(() => new Map(events.map((e) => [e.slug, e])), [events]);

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href^="/events/"]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target && anchor.target !== "_self") return;
    const slug = (anchor.getAttribute("href") ?? "")
      .replace("/events/", "")
      .split(/[?#]/)[0];
    const event = bySlug.get(slug);
    if (!event) return;
    e.preventDefault();
    e.stopPropagation();
    openEventSheet(event);
  };

  return (
    <div onClickCapture={onClickCapture} className={className}>
      {children}
    </div>
  );
}

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
  events = [],
  fetchMissing = false,
  children,
  className,
}: {
  /** Events already on the client — instant sheet opens (the board). */
  events?: EventWithMeta[];
  /**
   * Lean-surface mode (/today, /live-music): slugs outside `events`
   * open on a skeleton and fetch the one tapped event, instead of the
   * surface shipping its whole corpus to the client just in case.
   */
  fetchMissing?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { openEventSheet, openEventSheetBySlug } = useEventSheet();
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
    if (!slug) return;
    const event = bySlug.get(slug);
    if (!event && !fetchMissing) return;
    e.preventDefault();
    e.stopPropagation();
    if (event) openEventSheet(event);
    else openEventSheetBySlug(slug);
  };

  return (
    <div onClickCapture={onClickCapture} className={className}>
      {children}
    </div>
  );
}

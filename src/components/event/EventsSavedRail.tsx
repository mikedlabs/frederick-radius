"use client";

import { useMemo } from "react";
import EventCard from "@/components/event/EventCard";
import SectionHeading from "@/components/ui/SectionHeading";
import { useSavedList, useMounted } from "@/hooks/useSaved";
import type { EventWithMeta } from "@/lib/loaders/events";
import { isUpcomingEvent } from "@/lib/events/visible";

/**
 * EventsSavedRail — the saved events that are still ahead, surfaced at the
 * top of /events so the find → save → resurface loop closes on the page a
 * user actually browses from.
 *
 * Honest by construction (the FromYourSaved rule): renders NOTHING until
 * there is an answer — not mounted, nothing saved, or none of the saves are
 * still upcoming all yield null, never an empty box asking to be filled. The
 * full list lives one tap away on /my-radius.
 *
 * Pure client state: saves are localStorage (useSavedList), and the event
 * set is already on the page, so the rail intersects in memory with no
 * fetch. `now` comes in as a server prop to keep render deterministic (no
 * Date.now() in render — the purity lint).
 */
const MAX_SHOWN = 4;

export default function EventsSavedRail({
  events,
  nowISO,
  liveSlugs,
}: {
  events: EventWithMeta[];
  nowISO: string;
  liveSlugs: string[];
}) {
  const mounted = useMounted();
  const saved = useSavedList();
  const live = useMemo(() => new Set(liveSlugs), [liveSlugs]);

  const upcoming = useMemo(() => {
    if (!mounted) return [];
    const savedSlugs = new Set(
      saved.filter((s) => s.type === "event").map((s) => s.id),
    );
    if (savedSlugs.size === 0) return [];
    const now = +new Date(nowISO);
    return events
      .filter((e) => savedSlugs.has(e.slug) && isUpcomingEvent(e, new Date(now)))
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
      .slice(0, MAX_SHOWN);
  }, [mounted, saved, events, nowISO]);

  // Not mounted, nothing saved, or nothing saved is still ahead: the rail
  // does not exist. /events never shows an empty saved box.
  if (upcoming.length === 0) return null;

  return (
    <section className="space-y-2.5" aria-label="Your saved events">
      <SectionHeading title="Your saved" href="/my-radius" cta="All saved" />
      <ul className="space-y-2">
        {upcoming.map((e) => (
          <li key={`${e.slug}-${e.starts_at}`}>
            <EventCard event={e} variant="glance" live={live.has(e.slug)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

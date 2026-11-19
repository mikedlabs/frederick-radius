"use client";

import { ArrowRight } from "lucide-react";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventPosterCard from "./EventPosterCard";
import { eventCardVisual, reviewedEventVenuePhoto, type EventCardVisual } from "./eventVisuals";
import styles from "./EventsOverview.module.css";

type OverviewWindow = "tonight" | "weekend";
export type EventsOverviewCoverage = "complete" | "partial" | "loading" | "unavailable";

type Props = {
  tonight: readonly EventWithMeta[];
  weekend: readonly EventWithMeta[];
  weekendIncludesTonight?: boolean;
  nowISO: string;
  coverage: EventsOverviewCoverage;
  onSelectWindow?: (window: OverviewWindow) => void;
};

function WindowHeading({ window, onSelectWindow }: {
  window: OverviewWindow;
  onSelectWindow?: Props["onSelectWindow"];
}) {
  const tonight = window === "tonight";
  return <div className={styles.headingRow}>
    <h2 id={`events-overview-${window}`}>{tonight ? "Tonight" : "This weekend"}</h2>
    {onSelectWindow && <button type="button" className={styles.windowLink} data-events-window-link={window}
      aria-label={tonight ? "See all events tonight" : "See all events this weekend"} onClick={() => onSelectWindow(window)}>
      See all <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
    </button>}
  </div>;
}

function emptyWindow(window: OverviewWindow, coverage: EventsOverviewCoverage, weekendIncludesTonight: boolean) {
  const label = window === "tonight" ? "tonight" : "this weekend";
  if (window === "weekend" && weekendIncludesTonight) return "Tonight’s pick is also this weekend.";
  if (coverage === "loading") return `Checking listings for ${label}…`;
  if (coverage === "unavailable") return `Listings for ${label} are unavailable.`;
  if (coverage === "partial") return `No picks for ${label} in the available listings.`;
  return `No upcoming picks for ${label}.`;
}

/** The selectors supply the occurrences and their order. A repeated venue
 * picture is displayed once. Every card still has its own timing and link. */
export default function EventsOverview({ tonight, weekend, weekendIncludesTonight = false, nowISO, coverage, onSelectWindow }: Props) {
  const now = new Date(nowISO);
  const seenKeys = new Set<string>();
  const seenSources = new Set<string>();
  function reserve(visual: EventCardVisual | null) {
    if (!visual || seenKeys.has(visual.key) || seenSources.has(visual.src)) return null;
    seenKeys.add(visual.key);
    seenSources.add(visual.src);
    return visual;
  }
  const leadTonight = tonight[0];
  const weekendPicks = weekend.slice(0, 2);
  const events = leadTonight ? [leadTonight, ...weekendPicks] : weekendPicks;
  // Reserve all primary artwork and photographs first. A fallback can never
  // displace another event's primary image or repeat another fallback.
  const primary = new Map<EventWithMeta, EventCardVisual | null>();
  const sharedArtwork: EventWithMeta[] = [];
  for (const event of events) {
    const preferred = eventCardVisual(event, { venuePhotos: "free-reviewed" });
    const reserved = reserve(preferred);
    primary.set(event, reserved);
    if (!reserved && preferred?.presentation === "artwork") sharedArtwork.push(event);
  }
  for (const event of sharedArtwork) {
    primary.set(event, reserve(reviewedEventVenuePhoto(event.venue_place_slug)));
  }
  function pick(event: EventWithMeta, lead: boolean) {
    const visual = primary.get(event) ?? null;
    const allowVenueFallback = visual?.presentation === "artwork" && Boolean(reserve(reviewedEventVenuePhoto(event.venue_place_slug)));
    return <div key={`${event.slug}:${event.starts_at}`} className={lead ? styles.lead : styles.supporting} data-events-overview-pick={lead ? "lead" : "supporting"}>
      <EventPosterCard event={event} visual={visual} venuePhotos="free-reviewed" allowVenueFallback={allowVenueFallback} concise headingLevel={3}
        priorityImage={lead} layout={lead ? "hero" : "shelf"} nowISO={nowISO} live={isEventLiveNow(event, now)} />
    </div>;
  }
  return <div data-events-overview className={styles.overview}>
    <section data-events-window="tonight" aria-labelledby="events-overview-tonight" className={styles.window}>
      <WindowHeading window="tonight" onSelectWindow={onSelectWindow} />
      {leadTonight ? pick(leadTonight, true) : <p className={styles.empty}>{emptyWindow("tonight", coverage, false)}</p>}
    </section>
    <section data-events-window="weekend" aria-labelledby="events-overview-weekend" className={styles.window}>
      <WindowHeading window="weekend" onSelectWindow={onSelectWindow} />
      {weekend.length ? <div className={styles.weekendPicks}>
        {weekendPicks.map((event, index) => pick(event, !leadTonight && index === 0))}
      </div> : <p className={styles.empty}>{emptyWindow("weekend", coverage, weekendIncludesTonight)}</p>}
    </section>
  </div>;
}

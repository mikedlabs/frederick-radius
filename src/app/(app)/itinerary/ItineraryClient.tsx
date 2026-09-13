"use client";

import { useEffect, useState } from "react";
import { useItineraryList, useToggleItinerary } from "@/hooks/useItinerary";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "@/components/event/EventCard";
import AppMapClient from "@/components/map/AppMapClient";
import Skeleton from "@/components/ui/Skeleton";
import Link from "next/link";
import { Calendar, Trash2 } from "lucide-react";
import { normalizeRequestedEventSlugList } from "@/lib/events/eventSlugBatch";

export default function ItineraryClient() {
  const itineraryItems = useItineraryList();
  const toggle = useToggleItinerary();
  
  const [events, setEvents] = useState<EventWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  useEffect(() => {
    if (itineraryItems.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const slugList = normalizeRequestedEventSlugList(itineraryItems.map(i => i.id));
    if (!slugList) {
      setEvents([]);
      setLoading(false);
      return;
    }

    fetch(`/api/events/by-slugs?slugs=${slugList}`)
      .then(res => res.json())
      .then(data => {
        if (data.events) {
          // Sort by start time chronologically for the timeline
          const sorted = data.events.sort((a: EventWithMeta, b: EventWithMeta) => {
            return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
          });
          setEvents(sorted);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [itineraryItems]);

  const mapEvents = events.map(e => ({
    slug: e.slug,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    is_all_day: e.is_all_day,
    venue_name: e.venue_name,
    lng: e.geom.lng,
    lat: e.geom.lat,
    category: e.category,
    venue_place_slug: e.venue_place_slug,
  }));

  if (itineraryItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center pt-24 pb-12 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--app-bg-sunken)] flex items-center justify-center mb-4">
          <Calendar className="w-8 h-8 text-[var(--app-ink-3)]" />
        </div>
        <h1 className="text-xl font-display font-bold text-[var(--app-ink)] mb-2">
          Your day plan is empty
        </h1>
        <p className="text-[var(--app-ink-2)] max-w-sm mb-6">
          Add events to your itinerary to build a chronological timeline or view them on a map.
        </p>
        <Link href="/events" className="px-6 py-2 bg-[var(--app-ink)] text-white rounded-full font-semibold">
          See upcoming events
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <header className="px-4 py-4 md:px-6 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-bg)] sticky top-0 z-20">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--app-ink)]">
            Day Plan
          </h1>
          <p className="text-sm text-[var(--app-ink-2)]">
            {events.length} {events.length === 1 ? "event" : "events"} in your itinerary
          </p>
        </div>
        
        <div className="flex bg-[var(--app-bg-sunken)] rounded-lg p-1">
          <button 
            onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "list" ? "bg-[var(--app-bg)] shadow-sm text-[var(--app-ink)]" : "text-[var(--app-ink-2)]"}`}
          >
            Timeline
          </button>
          <button 
            onClick={() => setViewMode("map")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "map" ? "bg-[var(--app-bg)] shadow-sm text-[var(--app-ink)]" : "text-[var(--app-ink-2)]"}`}
          >
            Map
          </button>
        </div>
      </header>

      {viewMode === "list" ? (
        <div className="flex-1 max-w-3xl w-full mx-auto p-4 md:p-6 pb-32 space-y-6">
          {loading ? (
            Array.from({ length: 3 }).map((_, _index) => (
              <div key={_index} className="flex gap-4">
                <Skeleton.Block className="w-16 h-16 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton.Block className="w-3/4 h-5" />
                  <Skeleton.Block className="w-1/2 h-4" />
                </div>
              </div>
            ))
          ) : (
            <div className="relative border-l-2 border-[var(--app-border)] ml-4 pl-6 space-y-8">
              {events.map((event, index) => (
                <div key={event.slug} className="relative">
                  {/* Timeline node */}
                  <div className="absolute -left-[35px] top-4 w-4 h-4 rounded-full border-2 border-[var(--app-bg)] bg-[var(--app-accent)] shadow-sm" />
                  
                  <div className="flex gap-4 group">
                    <div className="flex-1">
                      <EventCard event={event} variant="row" />
                    </div>
                    <button 
                      onClick={() => toggle(event.slug)}
                      className="p-2 rounded-full hover:bg-red-50 text-[var(--app-ink-3)] hover:text-red-500 self-start transition-colors"
                      title="Remove from itinerary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 bg-[var(--app-bg-sunken)] relative min-h-[500px]">
          {events.length > 0 && !loading && (
            <AppMapClient 
              events={mapEvents}
              places={[]}
              fullBleed
            />
          )}
        </div>
      )}
    </div>
  );
}

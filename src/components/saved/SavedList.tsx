"use client";

import { useSavedList, useMounted } from "@/hooks/useSaved";
import { PLACE_BY_SLUG } from "@/data/places";
import { EVENT_BY_SLUG } from "@/data/events";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import { decoratePlace } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import Link from "next/link";

export default function SavedList() {
  const mounted = useMounted();
  const items = useSavedList();

  if (!mounted) {
    return (
      <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
         style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        Loading…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3 rounded-[var(--app-radius-lg)] border border-dashed px-6 py-12 text-center"
           style={{ borderColor: "var(--app-border)" }}>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          Nothing saved yet.
        </p>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          Tap the bookmark on any place or event to pin it here.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link href="/" className="text-xs font-medium" style={{ color: "var(--app-brand)" }}>
            Start with Today →
          </Link>
          <Link href="/map" className="text-xs font-medium" style={{ color: "var(--app-brand)" }}>
            Browse the map →
          </Link>
        </div>
      </div>
    );
  }

  const places = items
    .filter((i) => i.type === "place")
    .map((i) => PLACE_BY_SLUG[i.id])
    .filter(Boolean)
    .map((p) => decoratePlace(p));

  const events = items
    .filter((i) => i.type === "event")
    .map((i) => EVENT_BY_SLUG[i.id])
    .filter(Boolean)
    .map((e) => ({
      ...e,
      distance_m: undefined,
      category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
      municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
    }));

  return (
    <div className="space-y-6">
      {places.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Places · {places.length}
          </h2>
          <ul className="space-y-2">
            {places.map((p) => (
              <li key={p.slug}><PlaceCard place={p} /></li>
            ))}
          </ul>
        </section>
      )}
      {events.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Events · {events.length}
          </h2>
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.slug}><EventCard event={e} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

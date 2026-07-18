"use client";

import { useEffect, useMemo, useState } from "react";
import PlaceCard from "@/components/place/PlaceCard";
import SectionHeading from "@/components/ui/SectionHeading";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { isOpenNow, type OpenStatus } from "@/lib/hours";
import type { PlaceCardData } from "@/lib/loaders/places";

/** Sortable closing time; non-open states sink to the end. */
function closesKey(s: OpenStatus): string {
  return s.state === "open" || s.state === "closing-soon" ? s.closesAt : "99:99";
}

/**
 * FromYourSaved — the saved places that matter RIGHT NOW, on Today.
 *
 * Closes the find → save → resurface loop at its highest-impact point:
 * a user who saved a place finds it offered back on the page where they
 * start their day, filtered to the ones that are open at this moment.
 * Saving stops being filing and starts being a feedback loop.
 *
 * Honest by construction: renders NOTHING until there is an answer —
 * no saves, none open right now, or data still loading all yield null,
 * never a placeholder asking for attention. The full list (open or not)
 * stays one tap away on /my-radius.
 *
 * Client component because saves are client state (useFollowedSlugs
 * covers both the anonymous localStorage path and the signed-in follows
 * DB). Place data hydrates via /api/places/by-slugs, whose open_status
 * is recomputed live server-side (withLiveStatus), so "open now" here
 * matches every other surface.
 */

const MAX_SHOWN = 4;

export default function FromYourSaved() {
  const { slugs } = useFollowedSlugs();
  const [places, setPlaces] = useState<PlaceCardData[] | null>(null);

  // One fetch per distinct slug set, same pattern as SavedList. No
  // fetch (and no state write) for an empty set — the render below
  // intersects against the LIVE slug set, so un-saving everything
  // empties the section without a cleanup write here.
  const slugsKey = useMemo(() => [...slugs].sort().join(","), [slugs]);
  useEffect(() => {
    if (!slugsKey) return;
    let cancelled = false;
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slugsKey)}`)
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((d: { places: PlaceCardData[] }) => {
        if (!cancelled) setPlaces(d.places ?? []);
      })
      .catch(() => {
        if (!cancelled) setPlaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slugsKey]);

  const openNow = useMemo(() => {
    if (!places) return [];
    const saved = new Set(slugs);
    return places
      .filter((p) => saved.has(p.slug) && isOpenNow(p.open_status))
      // Closing soonest first — the most time-sensitive answer leads.
      .sort((a, b) => closesKey(a.open_status).localeCompare(closesKey(b.open_status)))
      .slice(0, MAX_SHOWN);
  }, [places, slugs]);

  // Nothing saved, nothing open, or still loading: the section does not
  // exist. Today never shows an empty box asking to be filled.
  if (openNow.length === 0) return null;

  return (
    <section className="mt-6 space-y-3" aria-label="From your saved">
      <SectionHeading
        title="From your saved"
        href="/my-radius"
        cta="All saved"
      />
      <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
        These saved places are open now.
      </p>
      <ul className="space-y-2">
        {openNow.map((p) => (
          <li key={p.slug}>
            <PlaceCard place={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

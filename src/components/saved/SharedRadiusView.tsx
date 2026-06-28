"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";

/**
 * SharedRadiusView — the recipient-facing render of a shared radius. Hydrates
 * the shared slugs through the same /api/places/by-slugs route the Saved page
 * uses (so it stays in sync with the catalog and ships no place data in its own
 * bundle), preserves the sharer's order, and ends with a doorway to start your
 * own. Honest empty + loading states.
 */
export default function SharedRadiusView({ slugs }: { slugs: string[] }) {
  const [places, setPlaces] = useState<PlaceCardData[] | null>(null);

  useEffect(() => {
    if (slugs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch; render the empty branch
      setPlaces([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slugs.join(","))}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { places: PlaceCardData[] }) => {
        // Preserve the sharer's order (the API doesn't guarantee it).
        const bySlug = new Map(data.places.map((p) => [p.slug, p]));
        setPlaces(slugs.map((s) => bySlug.get(s)).filter((p): p is PlaceCardData => Boolean(p)));
      })
      .catch((err) => {
        if (err && err.name !== "AbortError") setPlaces([]);
      });
    return () => ctrl.abort();
  }, [slugs]);

  const townCount = places ? new Set(places.map((p) => p.municipality)).size : 0;

  return (
    <div className="relative space-y-4">
      <PageBloom variant="warm-cool" />

      <header className="pt-0.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-brand) 16%, transparent)", color: "var(--app-brand)" }}
          >
            <Bookmark className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
            A shared radius
          </p>
        </div>
        <h1 className="mt-2 font-serif text-[24px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Someone&rsquo;s Frederick
        </h1>
        {places && places.length > 0 && (
          <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            {places.length} place{places.length === 1 ? "" : "s"}
            {townCount > 1 ? ` across ${townCount} towns` : ""}, worth a look.
          </p>
        )}
      </header>

      {places === null ? (
        <div aria-busy="true" className="space-y-2">
          <Skeleton.Row />
          <Skeleton.Row />
          <Skeleton.Row />
        </div>
      ) : places.length === 0 ? (
        <section
          className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            This shared radius is empty.
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            The link may be incomplete. Start your own instead.
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.slug}>
              <PlaceCard place={p} />
            </li>
          ))}
        </ul>
      )}

      {/* Doorway to start your own — the growth loop. */}
      <Link
        href="/today"
        className="tactile tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-lg)] border p-3.5"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)", color: "var(--app-brand)" }}
        >
          <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            Build your own Frederick radius
          </span>
          <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Find food, events, and the places worth your time
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[12px] font-bold" style={{ color: "var(--app-brand-press)" }}>→</span>
      </Link>
    </div>
  );
}

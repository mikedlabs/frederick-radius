"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, ChevronRight, MapPin, RefreshCw } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
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
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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
        setLoadError(false);
        setPlaces(slugs.map((s) => bySlug.get(s)).filter((p): p is PlaceCardData => Boolean(p)));
      })
      .catch((err) => {
        if (err && err.name !== "AbortError") setLoadError(true);
      });
    return () => ctrl.abort();
  }, [slugs, retryKey]);

  const townCount = places ? new Set(places.map((p) => p.municipality)).size : 0;

  return (
    <div className="relative space-y-4">
      <header className="pt-0.5">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-2)" }} />
          <p className="text-[13px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--app-ink-2)" }}>
            A shared Frederick list
          </p>
        </div>
        <h1 className="mt-2 font-sans text-[28px] font-extrabold leading-tight tracking-[-0.03em]" style={{ color: "var(--app-ink)" }}>
          Someone shared these Frederick places.
        </h1>
        {places && places.length > 0 && (
          <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            This list has {places.length} place{places.length === 1 ? "" : "s"}
            {townCount > 1 ? ` across ${townCount} towns` : ""}.
          </p>
        )}
      </header>

      {loadError ? (
        <section
          role="alert"
          className="border-t py-5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            This shared list did not load.
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            Check your connection and try once more.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                setPlaces(null);
                setRetryKey((key) => key + 1);
              }}
              className="tap-44 inline-flex items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border px-3 py-2 text-[13px] font-semibold"
              style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              Retry
            </button>
            <Link
              href="/today"
              className="tap-44 inline-flex items-center justify-center rounded-[var(--app-radius-md)] px-3 py-2 text-[13px] font-semibold"
              style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand, #fff)" }}
            >
              Go to Today
            </Link>
          </div>
        </section>
      ) : places === null ? (
        <div aria-busy="true" className="space-y-2">
          <Skeleton.Row />
          <Skeleton.Row />
          <Skeleton.Row />
        </div>
      ) : places.length === 0 ? (
        <section
          className="border-t py-5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            This shared list is empty.
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
      {!loadError ? (
        <Link
          href="/today"
          className="group flex min-h-14 items-center gap-3 border-y py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <MapPin className="h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-2)" }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold leading-snug tracking-[-0.01em] group-hover:underline group-hover:underline-offset-[3px]" style={{ color: "var(--app-ink)" }}>
              Build your own Frederick radius
            </span>
            <span className="block text-[14px]" style={{ color: "var(--app-ink-2)" }}>
              Find food, events, and the places worth your time
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-2)" }} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

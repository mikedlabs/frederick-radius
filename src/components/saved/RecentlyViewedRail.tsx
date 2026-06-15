"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import {
  useRecentPlaces,
  useClearRecentPlaces,
} from "@/hooks/useRecentPlaces";
import { PLACES, type Place } from "@/data/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * RecentlyViewedRail — surfaces the last 6 places the user looked
 * at on this device. Lives on /my-radius below the saved list and
 * disappears when the user has zero recent visits.
 *
 * Resolves slugs against the static PLACES dataset client-side via
 * a memoized Map. When a stored slug no longer resolves (place was
 * removed/renamed), the entry is silently dropped from this
 * render — the localStorage row can stay; the next push will
 * eventually evict it via the MAX cap inside useRecentPlaces.
 */
export default function RecentlyViewedRail() {
  const recents = useRecentPlaces();
  const clear = useClearRecentPlaces();

  // Build a slug → Place map once. PLACES is a static module-scope
  // array so this stays a memo over the recent list, not over the
  // whole dataset.
  const bySlug = useMemo(() => {
    const m = new Map<string, Place>();
    for (const p of PLACES) m.set(p.slug, p);
    return m;
  }, []);

  const items = useMemo(
    () =>
      recents
        .map((slug) => bySlug.get(slug))
        .filter((p): p is Place => p !== undefined)
        .slice(0, 6),
    [recents, bySlug],
  );

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className="space-y-2.5"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2
          id="recently-viewed-heading"
          className="eyebrow inline-flex items-center gap-1.5"
          style={{ color: "var(--app-ink-3)" }}
        >
          <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          Recently viewed
        </h2>
        <button
          type="button"
          onClick={clear}
          className="tap-44 text-[11px] font-medium hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          Clear
        </button>
      </header>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
        {items.map((p) => (
          <li key={p.slug} className="w-[180px] shrink-0 snap-start">
            <Link
              href={`/places/${p.slug}`}
              className="hover-lift flex h-full flex-col gap-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
            >
              <span
                className="line-clamp-2 text-[13px] font-semibold leading-snug"
                style={{ color: "var(--app-ink)" }}
              >
                {p.name}
              </span>
              <span
                className="text-[11px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? p.municipality}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import type { MapPinPlace } from "./types";

const DEFAULT_PAGE_SIZE = 8;

function availabilityLabel(place: MapPinPlace): string | null {
  switch (place.open_status.state) {
    case "open":
      return "Open now";
    case "closing-soon":
      return "Closing soon";
    case "closed":
      return "Closed";
    default:
      return null;
  }
}

/**
 * Keep an existing editorial/filter order when no useful origin exists. Once
 * the map supplies its center (or a consented device fix), the list becomes a
 * spatial reading of the same pins rather than a second recommendation engine.
 */
export function rankPlacesInView(
  places: readonly MapPinPlace[],
  origin: LngLat | null,
): MapPinPlace[] {
  if (!origin) return [...places];

  return [...places]
    .map((place, index) => ({
      place,
      index,
      distance:
        place.geom == null
          ? Number.POSITIVE_INFINITY
          : haversineMeters(origin, place.geom),
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ place }) => place);
}

export type MapInViewPlacesDisclosureProps = {
  /** The exact committed result set represented by the visible map. */
  places: readonly MapPinPlace[];
  /** A consented device fix when available, otherwise the committed map center. */
  sortOrigin: LngLat | null;
  /** Opens/focuses the existing map place result; this component owns no sheet. */
  onPick: (place: MapPinPlace) => void;
  selectedSlug?: string | null;
  pageSize?: number;
  onOpenChange?: (open: boolean) => void;
};

/**
 * An accessible, map-first alternative to hunting WebGL pins.
 *
 * Native <details> keeps the surface collapsed and out of the accessibility
 * tree until requested. It lives in normal document flow, so it can sit inside
 * Browse without covering the map or creating another persistent drawer.
 */
export default function MapInViewPlacesDisclosure({
  places,
  sortOrigin,
  onPick,
  selectedSlug = null,
  pageSize = DEFAULT_PAGE_SIZE,
  onOpenChange,
}: MapInViewPlacesDisclosureProps) {
  const titleId = useId();
  const listId = useId();
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : DEFAULT_PAGE_SIZE;
  const [visibleCount, setVisibleCount] = useState(safePageSize);
  const [expanded, setExpanded] = useState(false);
  const rankedPlaces = useMemo(
    () => rankPlacesInView(places, sortOrigin),
    [places, sortOrigin],
  );
  const visiblePlaces = rankedPlaces.slice(0, visibleCount);
  const remaining = Math.max(0, rankedPlaces.length - visiblePlaces.length);
  const nextCount = Math.min(safePageSize, remaining);
  const countLabel = `${rankedPlaces.length.toLocaleString("en-US")} ${
    rankedPlaces.length === 1 ? "place" : "places"
  }`;

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-bg-elevated)]"
      data-map-in-view-places
    >
      <details
        className="group"
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setExpanded(open);
          if (!open) setVisibleCount(safePageSize);
          onOpenChange?.(open);
        }}
      >
        <summary
          className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-left marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)]"
          style={{ minHeight: 52 }}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[color-mix(in_srgb,var(--app-cool)_11%,transparent)] text-[var(--app-cool)]"
          >
            <MapPin className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <strong
              id={titleId}
              className="block text-[13px] font-semibold leading-tight text-[var(--app-ink)]"
            >
              Places in this view
            </strong>
            <span className="mt-0.5 block text-[11px] leading-tight text-[var(--app-ink-3)]">
              {countLabel} · {sortOrigin ? "nearest first" : "current map results"}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-[var(--app-ink-3)] transition-transform motion-reduce:transition-none ${
              expanded ? "rotate-180" : ""
            }`}
            strokeWidth={2.2}
          />
        </summary>

        <div className="border-t border-[var(--app-border)] px-2 pb-2 pt-1.5">
          {rankedPlaces.length === 0 ? (
            <p
              className="px-2 py-3 text-[12px] leading-relaxed text-[var(--app-ink-3)]"
              role="status"
            >
              No matching places are visible in this area.
            </p>
          ) : (
            <>
              <ul
                id={listId}
                aria-label="Places currently visible on the map"
                className="m-0 grid list-none gap-0.5 p-0"
              >
                {visiblePlaces.map((place) => {
                  const category = CATEGORY_BY_SLUG[place.category];
                  const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name;
                  const availability = availabilityLabel(place);
                  const distance =
                    sortOrigin && place.geom
                      ? formatDistance(haversineMeters(sortOrigin, place.geom))
                      : null;
                  const meta = [category?.name ?? place.category, town, availability]
                    .filter(Boolean)
                    .join(" · ");
                  const color = category?.color ?? "var(--app-brand)";

                  return (
                    <li key={place.slug}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-[var(--app-radius-sm)] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--app-brand)] motion-reduce:transition-none"
                        style={{ minHeight: 44 }}
                        data-map-in-view-place={place.slug}
                        data-selected={place.slug === selectedSlug || undefined}
                        aria-current={
                          place.slug === selectedSlug ? "location" : undefined
                        }
                        onClick={() => {
                          haptic("light");
                          onPick(place);
                        }}
                      >
                        <span
                          aria-hidden
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px]"
                          style={
                            {
                              color,
                              background: `color-mix(in srgb, ${color} 11%, var(--app-bg-elevated))`,
                            } as CSSProperties
                          }
                        >
                          <MapPin className="h-3.5 w-3.5" strokeWidth={2.1} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="sr-only">Open map result for </span>
                          <span className="block truncate text-[12.5px] font-semibold leading-tight text-[var(--app-ink)]">
                            {place.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-[var(--app-ink-3)]">
                            {meta}
                          </span>
                        </span>
                        {distance && (
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--app-ink-3)]">
                            {distance}
                          </span>
                        )}
                        {place.slug === selectedSlug && (
                          <span className="sr-only">Selected</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {remaining > 0 && (
                <button
                  type="button"
                  className="mt-1 flex w-full items-center justify-center rounded-[var(--app-radius-sm)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--app-cool)] transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--app-brand)] motion-reduce:transition-none"
                  style={{ minHeight: 44 }}
                  aria-controls={listId}
                  onClick={() => {
                    haptic("light");
                    setVisibleCount((current) => current + safePageSize);
                  }}
                >
                  Show {nextCount} more {nextCount === 1 ? "place" : "places"}
                </button>
              )}

              <p className="sr-only" role="status" aria-live="polite">
                The list currently shows {visiblePlaces.length.toLocaleString("en-US")} of {countLabel}.
              </p>
            </>
          )}
        </div>
      </details>
    </section>
  );
}

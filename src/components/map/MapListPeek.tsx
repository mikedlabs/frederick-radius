"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import CategoryIcon from "@/components/place/CategoryIcon";
import {
  MAP_TASK_LIST_PAGE,
  type MapTaskList,
  type MapTaskListRow,
} from "./mapListTask";
import type { EventPin, MapPinPlace } from "./types";

/**
 * The ranked list peek that answers a map task. A search, a "What to see"
 * tile, or a category returns a small ranked set here instead of pins alone
 * (USER_FIRST_INTERACTION_CONTRACT, Map). It lives inside the one bottom
 * dock, shows five rows, pages with "Show more", and collapses to its title
 * so the map stays readable. Opening a place is always an explicit row tap.
 *
 * Every row leads with a visual that cannot lie: the category mark on the
 * place's own color, or a time plate for an event. Photos are left to the
 * place card, because a row must never wait on, or fake, a photograph.
 */

function placeStatus(place: MapPinPlace): { text: string; tone: string } | null {
  switch (place.open_status.state) {
    case "open":
      return { text: "Open now", tone: "var(--app-positive)" };
    case "closing-soon":
      return { text: "Closing soon", tone: "var(--app-warning-press)" };
    case "closed":
      return { text: "Closed", tone: "var(--app-ink-3)" };
    default:
      return null;
  }
}

const EVENT_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export function eventTimePlate(event: Pick<EventPin, "starts_at" | "is_all_day">): {
  time: string;
  period: string;
} {
  if (event.is_all_day) return { time: "All", period: "day" };
  const date = new Date(event.starts_at);
  if (!Number.isFinite(date.getTime())) return { time: "Time", period: "TBA" };
  const [time = "", period = ""] = EVENT_CLOCK.format(date).split(/\s+/);
  return { time, period };
}

function PlaceRow({
  place,
  userLoc,
  onPick,
}: {
  place: MapPinPlace;
  userLoc: LngLat | null;
  onPick: (place: MapPinPlace) => void;
}) {
  const category = CATEGORY_BY_SLUG[place.category];
  const color = category?.color ?? "var(--app-brand)";
  const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name;
  const status = placeStatus(place);
  // Distance is a promise about where the reader is. Without a real device
  // fix there is no honest origin, so the row says nothing about distance.
  const distance = userLoc ? formatDistance(haversineMeters(userLoc, place.geom)) : null;
  const blurb = place.short_blurb?.trim();

  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)] motion-reduce:transition-none"
      style={{ minHeight: 64 }}
      data-map-list-place={place.slug}
      data-decision-impression="true"
      data-decision-surface="map"
      data-decision-entity="place"
      data-decision-id={place.slug}
      data-decision-position="result"
      data-decision-action="open"
      onClick={() => {
        haptic("light");
        onPick(place);
      }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
        style={
          {
            color,
            background: `color-mix(in srgb, ${color} 14%, var(--app-bg-elevated-solid))`,
          } as CSSProperties
        }
      >
        <CategoryIcon slug={place.category} className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug text-[var(--app-ink)]">
          {place.name}
        </span>
        <span className="mt-0.5 block truncate text-[13px] leading-snug text-[var(--app-ink-2)]">
          {[category?.name ?? place.category, town].filter(Boolean).join(" · ")}
          {status && (
            <>
              <span aria-hidden> · </span>
              <span style={{ color: status.tone, fontWeight: 600 }}>{status.text}</span>
            </>
          )}
          {distance && (
            <>
              <span aria-hidden> · </span>
              <span className="tabular-nums">{distance} from you</span>
            </>
          )}
        </span>
        {blurb && (
          <span className="mt-0.5 block truncate text-[13px] leading-snug text-[var(--app-ink-2)]">
            {blurb}
          </span>
        )}
      </span>
    </button>
  );
}

function EventRow({
  event,
  userLoc,
  onPick,
}: {
  event: EventPin;
  userLoc: LngLat | null;
  onPick: (event: EventPin) => void;
}) {
  const plate = eventTimePlate(event);
  const distance = userLoc
    ? formatDistance(haversineMeters(userLoc, { lng: event.lng, lat: event.lat }))
    : null;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)] motion-reduce:transition-none"
      style={{ minHeight: 64 }}
      data-map-list-event={event.slug}
      data-decision-impression="true"
      data-decision-surface="map"
      data-decision-entity="event"
      data-decision-id={event.slug}
      data-decision-position="result"
      data-decision-action="open"
      onClick={() => {
        haptic("light");
        onPick(event);
      }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-content-center rounded-[var(--app-radius-sm)] text-center leading-none tabular-nums"
        style={{
          color: "var(--app-brand-press)",
          background: "color-mix(in srgb, var(--app-brand) 12%, var(--app-bg-elevated-solid))",
        }}
      >
        <span className="block text-[13px] font-bold">{plate.time}</span>
        <span className="text-caption mt-0.5 block font-semibold uppercase leading-none">
          {plate.period}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug text-[var(--app-ink)]">
          {event.title}
        </span>
        <span className="mt-0.5 block truncate text-[13px] leading-snug text-[var(--app-ink-2)]">
          {event.venue_name}
          {distance && (
            <>
              <span aria-hidden> · </span>
              <span className="tabular-nums">{distance} from you</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function rowKey(row: MapTaskListRow): string {
  return row.kind === "place" ? `place:${row.place.slug}` : `event:${row.event.slug}`;
}

export type MapListPeekProps = {
  list: MapTaskList;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  userLoc: LngLat | null;
  onPickPlace: (place: MapPinPlace) => void;
  onPickEvent: (event: EventPin) => void;
  /** After the last row of a query list, leave for every Radius listing. */
  onSearchAll?: (query: string) => void;
  pageSize?: number;
};

export default function MapListPeek({
  list,
  expanded,
  onExpandedChange,
  userLoc,
  onPickPlace,
  onPickEvent,
  onSearchAll,
  pageSize = MAP_TASK_LIST_PAGE,
}: MapListPeekProps) {
  const titleId = useId();
  const listId = useId();
  // Paging belongs to one task. A new task (or a re-run area) starts again at
  // the first page without an effect that would flash the old length.
  const [paging, setPaging] = useState({ key: list.key, count: pageSize });
  const visibleCount = paging.key === list.key ? paging.count : pageSize;
  const visibleRows = list.rows.slice(0, visibleCount);
  const remaining = Math.max(0, list.rows.length - visibleRows.length);
  const nextCount = Math.min(pageSize, remaining);
  const noun = (count: number) =>
    `${list.unit}${count === 1 ? "" : "s"}`;
  const summary = list.pending
    ? "Searching Radius…"
    : `${list.rows.length.toLocaleString("en-US")} ${noun(list.rows.length)}`;

  return (
    <section
      className="overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-shadow-2)]"
      aria-labelledby={titleId}
      data-map-list-peek
      data-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)]"
        style={{ minHeight: 52 }}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => {
          haptic("light");
          onExpandedChange(!expanded);
        }}
      >
        <span className="min-w-0 flex-1">
          <strong
            id={titleId}
            className="block truncate text-[16px] font-semibold leading-tight text-[var(--app-ink)]"
          >
            {list.title}
          </strong>
          <span className="mt-0.5 block text-[12px] leading-tight text-[var(--app-ink-3)]">
            {summary}
          </span>
        </span>
        <span className="sr-only">{expanded ? "Hide the list" : "Show the list"}</span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-[var(--app-ink-3)] transition-transform motion-reduce:transition-none ${
            expanded ? "" : "rotate-180"
          }`}
          strokeWidth={2.2}
        />
      </button>

      <div
        id={listId}
        hidden={!expanded}
        className="max-h-[min(46dvh,380px)] overflow-y-auto overscroll-contain border-t border-[var(--app-border)]"
      >
        {list.note && (
          <p className="px-3 pb-1 pt-2 text-[12px] leading-snug text-[var(--app-ink-3)]">
            {list.note}
          </p>
        )}
        {list.pending ? (
          <p
            className="flex items-center gap-2 px-3 py-4 text-[13px] text-[var(--app-ink-2)]"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle
              aria-hidden
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
            />
            Searching Radius…
          </p>
        ) : list.rows.length === 0 ? (
          <div className="px-3 py-4" role="status" aria-live="polite">
            <p className="text-[14px] font-semibold leading-snug text-[var(--app-ink)]">
              {list.empty.title}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--app-ink-2)]">
              {list.empty.copy}
            </p>
            {list.askQuery && (
              <Link
                href={`/ask?q=${encodeURIComponent(list.askQuery)}`}
                className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--app-brand-press)] underline-offset-2 hover:underline"
              >
                Ask Radius about “{list.askQuery}”
              </Link>
            )}
          </div>
        ) : (
          <>
            <ul
              aria-label={list.title}
              className="m-0 list-none divide-y divide-[var(--app-border)] p-0"
            >
              {visibleRows.map((row) => (
                <li key={rowKey(row)}>
                  {row.kind === "place" ? (
                    <PlaceRow place={row.place} userLoc={userLoc} onPick={onPickPlace} />
                  ) : (
                    <EventRow event={row.event} userLoc={userLoc} onPick={onPickEvent} />
                  )}
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <button
                type="button"
                className="flex w-full items-center justify-center border-t border-[var(--app-border)] px-3 text-[14px] font-semibold text-[var(--app-brand-press)] transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)] motion-reduce:transition-none"
                style={{ minHeight: 44 }}
                aria-controls={listId}
                onClick={() => {
                  haptic("light");
                  setPaging({ key: list.key, count: visibleCount + pageSize });
                }}
              >
                Show {nextCount} more {noun(nextCount)}
              </button>
            )}
            {remaining === 0 && list.askQuery && onSearchAll && (
              // Only once the map's own list is exhausted: the map answers
              // first, and every Radius listing is the next step after it.
              <button
                type="button"
                className="flex w-full items-center justify-center border-t border-[var(--app-border)] px-3 text-[14px] font-semibold text-[var(--app-ink-2)] transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)] motion-reduce:transition-none"
                style={{ minHeight: 44 }}
                onClick={() => onSearchAll(list.askQuery ?? "")}
              >
                Search all of Radius
              </button>
            )}
            <p className="sr-only" role="status" aria-live="polite">
              {`The list shows ${visibleRows.length} of ${list.rows.length} ${noun(list.rows.length)}.`}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * TodayEventPick — compact event card for Today's best-three and Tonight picks.
 *
 * Shows: time, title, place, town, optional one-line reason, source label.
 * Styled to fit 2-3 on a phone screen without scrolling past the conditions line.
 */

import Link from "next/link";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDateBlock } from "@/lib/loaders/events";
import { eventTown } from "@/lib/events/eventTown";
import { CATEGORY_BY_SLUG } from "@/data/categories";

type TodayEventPickProps = {
  event: EventWithMeta;
  reason?: string | null;
};

export default function TodayEventPick({ event, reason }: TodayEventPickProps) {
  const time = eventDateBlock(event).time;
  const town = eventTown(event);
  const venue = event.venue_name?.trim();
  const accent = CATEGORY_BY_SLUG[event.category ?? ""]?.color ?? "#7A7975";

  // Source label (existing trust logic)
  const sourceLabel = event.is_verified
    ? "Verified"
    : event.source
      ? event.source
      : null;

  return (
    <Link
      href={`/events/${event.slug}`}
      prefetch={false}
      className="tap-44-y group block rounded-[var(--app-radius-md)] p-3 transition-colors"
      style={{
        background: "var(--app-bg-sunken)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="shrink-0 pt-0.5 font-mono text-[11px] font-semibold tabular-nums leading-snug"
          style={{ color: "var(--app-ink-3)" }}
        >
          {time}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight transition-colors group-hover:underline"
            style={{ color: "var(--app-ink)" }}
          >
            {event.title}
          </h3>
          {(venue || town) && (
            <p
              className="mt-0.5 truncate text-[11.5px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {venue ?? town}
              {venue && town && town.toLowerCase() !== venue.toLowerCase() && (
                <> · {town}</>
              )}
            </p>
          )}
          {reason && (
            <p
              className="mt-1 line-clamp-1 text-[12px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              {reason}
            </p>
          )}
        </div>
        <span
          aria-hidden
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: accent }}
        />
      </div>
      {sourceLabel && (
        <div className="mt-1.5 flex items-center gap-1">
          <span
            className="text-[9.5px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {sourceLabel}
          </span>
        </div>
      )}
    </Link>
  );
}

import Link from "next/link";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDateBlock } from "@/lib/events/format";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { eventTown } from "@/lib/events/eventTown";
import { eventHasPreciseDisplayLocation } from "@/lib/events/geo-confidence";
import { eventAttendanceLabel, hasPhysicalAttendance } from "@/lib/events/attendance";
import { eventDisplayTitle } from "@/lib/events/display-title";
import EventWalkTime from "./EventWalkTime";
import styles from "./TodayLayout.module.css";

/** One line of the day program: mono time column (the visible sort key),
 *  then title + venue. The editorial tier reads as TYPOGRAPHY — draws get
 *  weight, ink, and their category's color dot; civic/routine rows sit in
 *  the same timeline, smaller and grayer. Live rows swap the clock for a
 *  pulsing "Now". */
export default function TodayEventRow({
  event: e,
  quiet,
  now,
}: {
  event: EventWithMeta;
  quiet: boolean;
  now: Date;
}) {
  const live = isEventLiveNow(e, now);
  const displayTitle = eventDisplayTitle(e);
  const time = eventDateBlock(e).time;
  const accent = CATEGORY_BY_SLUG[e.category ?? ""]?.color ?? "var(--app-ink-3)";
  const physical = hasPhysicalAttendance(e);
  const town = physical ? eventTown(e) : null;
  // "Frederick · Frederick": some feeds stamp the town as the venue name.
  // One mention is information, two is noise.
  const venue = eventAttendanceLabel(e);
  const where = [venue, town && town.toLowerCase() !== venue?.toLowerCase() ? town : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={`/events/${e.slug}`}
        prefetch={false}
        className={`tap-44-y flex items-start gap-3 border-b py-2 pr-0.5 ${styles.eventRow}`}
        style={{ borderColor: "var(--app-border)" }}
      >
        <span
          className={`flex w-[58px] shrink-0 items-center gap-1 pt-px font-mono text-[11px] font-semibold tabular-nums leading-snug ${styles.eventTime}`}
          style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-3)" }}
        >
          {live && (
            <span aria-hidden className="live-dot h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-brand)" }} />
          )}
          {live ? "Now" : time}
        </span>
        {quiet ? (
          <span className="min-w-0 flex-1 truncate text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {displayTitle}
            {(venue || town) && (
              <span style={{ color: "var(--app-ink-3)" }}> · {venue ?? town}</span>
            )}
          </span>
        ) : (
          <div className="min-w-0 flex-1">
            <span className={`line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight ${styles.eventTitle}`} style={{ color: "var(--app-ink)" }}>
              {displayTitle}
            </span>
            {where && (
              <span className={`mt-0.5 block truncate text-[11.5px] leading-snug ${styles.eventLocation}`} style={{ color: "var(--app-ink-3)" }}>
                {where}
              </span>
            )}
            {/* Real walk minutes from the user's cached fix (LocationPrime
                consent), precisely-located venues only; self-hides. */}
            {physical && eventHasPreciseDisplayLocation(e) && <EventWalkTime dest={e.geom} />}
          </div>
        )}
        {!quiet && (
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        )}
      </Link>
    </li>
  );
}

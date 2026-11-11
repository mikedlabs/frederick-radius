import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./EventRow.module.css";

/** Splits a start clock such as "6:00 PM" so the numerals can carry the
 * column. Labels such as "All day" or "Time not listed" stay whole. */
function clockParts(time: string): { clock: string; meridiem: string | null } {
  const match = /^(\d{1,2}:\d{2})\s?(AM|PM)$/i.exec(time.trim());
  return match ? { clock: match[1], meridiem: match[2].toUpperCase() } : { clock: time, meridiem: null };
}

/** The full timing line repeats the start clock. Keep only what it adds:
 * an end time, a started disclosure, or a missing-end caution. */
export function eventRowTimingNote(startTime: string, timing: string): string | null {
  if (!timing || timing === startTime) return null;
  if (timing.startsWith(`${startTime}–`)) return `Until ${timing.slice(startTime.length + 1)}`;
  if (timing.startsWith(`${startTime} · `)) {
    const rest = timing.slice(startTime.length + 3);
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return timing;
}

export default function EventRow({
  slug,
  title,
  weekday,
  month,
  day,
  startTime,
  timing,
  category,
  live = false,
  status,
  statusColor,
  cancelled = false,
  where,
  extra,
  lead = false,
  showDate = true,
  media,
  position = "result",
  surface = "events",
}: {
  slug: string;
  title: string;
  weekday: string;
  month: string;
  day: string;
  startTime: string;
  timing: string;
  category?: string;
  live?: boolean;
  status?: string | null;
  statusColor?: string;
  cancelled?: boolean;
  where?: string | null;
  extra?: ReactNode;
  lead?: boolean;
  /** The day line repeats inside a one-day group. Callers hide it on rows
   * whose day matches the row above, so the column carries the time alone. */
  showDate?: boolean;
  /** An approved picture (thumbnail and its credit), placed by the row grid.
   * Rows without one remain purely typographic. */
  media?: ReactNode;
  position?: "result" | "lead";
  surface?: "events" | "today";
}) {
  const { clock, meridiem } = clockParts(startTime);
  const note = eventRowTimingNote(startTime, timing);
  return (
    <article
      data-decision-impression="true"
      data-decision-surface={surface}
      data-decision-entity="event"
      data-decision-id={slug}
      data-decision-position={position}
      data-event-row={lead ? "lead" : "row"}
      data-event-media={media ? "thumb" : "none"}
      className={`${styles.row} ${lead ? styles.lead : ""} ${media ? styles.withMedia : ""} ${cancelled ? styles.cancelled : ""}`}
    >
      <div className={styles.when}>
        <span className={styles.time} data-clock={meridiem ? "clock" : "label"}>
          <span className={styles.clock}>{clock}</span>
          {meridiem ? <span className={styles.meridiem}>{meridiem}</span> : null}
        </span>
        {showDate ? (
          <span className={styles.date}>{weekday} {month} {day}</span>
        ) : (
          <span className="sr-only">{weekday} {month} {day}</span>
        )}
      </div>
      <div className={styles.body}>
        {(category || live || status) && (
          <p className={styles.eyebrow}>
            {category ? <span>{category}</span> : null}
            {live ? (
              <span className={styles.live}>
                <span aria-hidden className={styles.liveDot} />
                Happening now
              </span>
            ) : null}
            {status ? <span style={{ color: statusColor, fontWeight: 600 }}>{status}</span> : null}
          </p>
        )}
        <h3 className={styles.title}>
          <Link href={`/events/${slug}`} data-decision-action="open" data-press-target="card" prefetch={false} className={styles.link}>
            {title}
          </Link>
        </h3>
        {where ? <p data-event-card-venue className={styles.where}>{where}</p> : null}
        {note ? <p data-event-card-time className={styles.note}>{note}</p> : null}
        {extra}
      </div>
      {media}
    </article>
  );
}

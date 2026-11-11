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

export type EventRowMediaKind = "photo" | "artwork" | "none";

export type EventRowProps = {
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
  /** Supporting lines under the facts (recurrence, price, access). */
  extra?: ReactNode;
  /** The page's one lead row. Its time column becomes the solid coral block,
   * the single bold field on Events. Every other row keeps an ink column. */
  lead?: boolean;
  /** The surrounding group heading already states the day ("Today",
   * "Happening now"), so the visible date line would only repeat it. The
   * date stays available to screen readers. */
  showDate?: boolean;
  /** An approved thumbnail and its credit, placed by the row grid. Rows
   * without one remain purely typographic. */
  media?: ReactNode;
  /** The picture's credit. It follows the facts in reading order and stays
   * outside the event link. */
  mediaCredit?: ReactNode;
  mediaKind?: EventRowMediaKind;
  /** A full-width picture above the facts (the pictured lead). */
  banner?: ReactNode;
  position?: "result" | "lead";
  /** Rows sit under a group heading (h2) and use h3. The page lead can sit
   * directly under the page title, so it uses h2. */
  headingLevel?: 2 | 3;
  surface?: "events" | "today";
  layout?: string;
  /** Stable hooks kept from the poster and card contracts. */
  poster?: { kind: "photo" | "artwork" | "category"; layout: "hero" | "shelf" };
};

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
  mediaCredit,
  mediaKind,
  banner,
  position = "result",
  headingLevel = 3,
  surface = "events",
  layout,
  poster,
}: EventRowProps) {
  const { clock, meridiem } = clockParts(startTime);
  const note = eventRowTimingNote(startTime, timing);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const eyebrowItems: ReactNode[] = [];
  if (category) eyebrowItems.push(<span key="category">{category}</span>);
  if (live) {
    eyebrowItems.push(
      <span key="live" className={styles.live}>
        <span aria-hidden className={styles.liveDot} />
        Happening now
      </span>,
    );
  }
  if (status) eyebrowItems.push(<span key="status" style={{ color: statusColor, fontWeight: 600 }}>{status}</span>);
  const className = [
    styles.row,
    lead ? styles.lead : "",
    media ? styles.withMedia : "",
    banner ? styles.withBanner : "",
    cancelled ? styles.cancelled : "",
  ].filter(Boolean).join(" ");
  return (
    <article
      data-decision-impression="true"
      data-decision-surface={surface}
      data-decision-entity="event"
      data-decision-id={slug}
      data-decision-position={position}
      data-event-row={lead ? "lead" : "row"}
      data-event-media={mediaKind ?? (media ? "photo" : "none")}
      data-event-card-layout={layout}
      data-event-poster={poster?.kind}
      data-event-fallback={poster?.kind === "category" ? "date-category" : undefined}
      data-event-poster-layout={poster?.layout}
      className={className}
    >
      {banner ? <div className={styles.banner}>{banner}</div> : null}
      {/* The thumbnail leads the DOM so the picture is announced and loaded
          before the facts; the grid places it at the right of the row. */}
      {media}
      <div className={styles.when} data-event-row-when>
        <span className={styles.time} data-clock={meridiem ? "clock" : "label"}>
          <span className={styles.clock}>{clock}</span>
          {meridiem ? <span className={styles.meridiem}>{meridiem}</span> : null}
        </span>
        {showDate ? (
          <span className={styles.date}>
            <span>{weekday}</span>{" "}
            <span className={styles.monthDay}><span>{month}</span>{" "}<span>{day}</span></span>
          </span>
        ) : (
          <span className="sr-only">{weekday} {month} {day}</span>
        )}
      </div>
      <div className={styles.body} data-event-card-heading>
        {eyebrowItems.length > 0 && (
          <p className={styles.eyebrow}>
            {eyebrowItems.flatMap((item, index) => (index === 0 ? [item] : [" ", item]))}
          </p>
        )}
        <Heading className={styles.title}>
          <Link href={`/events/${slug}`} data-decision-action="open" data-press-target="card" prefetch={false} className={styles.link}>
            {title}
          </Link>
        </Heading>
        {where ? <p data-event-card-venue className={styles.where}>{where}</p> : null}
        {note ? <p data-event-card-time className={styles.note}>{note}</p> : null}
        {extra}
      </div>
      {mediaCredit}
    </article>
  );
}

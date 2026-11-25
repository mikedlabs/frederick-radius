import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./TodayEventChoices.module.css";

const month = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The server supplies the Events board's Eastern Friday, including on
 * Saturday and Sunday. UTC calendar arithmetic advances printed dates only. */
export function EventWeekendCalendar({ friday, eventsHref }: { friday: string; eventsHref: string }) {
  const first = new Date(`${friday}T12:00:00Z`);
  if (!Number.isFinite(first.getTime()) || first.getUTCDay() !== 5) return null;
  const days = [0, 1, 2].map((offset) => new Date(first.getTime() + offset * 86400000));
  const monthLabel = month.formatRange(days[0], days[2]);
  const target = `${eventsHref}${eventsHref.includes("?") ? "&" : "?"}when=weekend`;
  return <Link href={target} prefetch={false} className={styles.weekend} data-events-weekend-calendar
    aria-label={`Browse weekend events from ${longDay.format(days[0])} evening through ${longDay.format(days[2])}`}>
    <span className={styles.weekendDates} aria-hidden="true">
      <span className={styles.calendarMonth}>{monthLabel}</span>
      {days.map((date, index) => <span key={date.getTime()} className={styles.dateLeaf}>
        <span>{["Fri", "Sat", "Sun"][index]}</span>
        <b>{date.getUTCDate()}</b>
      </span>)}
    </span>
    <span className={styles.weekendText}><strong>This weekend <ArrowRight aria-hidden="true" /></strong><span>Friday evening through Sunday</span></span>
  </Link>;
}

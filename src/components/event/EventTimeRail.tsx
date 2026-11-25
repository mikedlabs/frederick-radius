import type { EventScheduleMark } from "@/lib/events/day-schedule";
import styles from "./EventTimeRail.module.css";

export default function EventTimeRail({ mark, id }: { mark: EventScheduleMark; id: string }) {
  return <div data-event-time-rail className={styles.rail}>
    <span id={id} aria-hidden="true" className="sr-only">{mark.description}</span>
    {mark.showAxis && <div data-time-scale className={styles.axis} aria-hidden="true"><span>{mark.axis[0]}</span>{mark.hasOverlap && <span className={styles.key}>Overlap</span>}<span>{mark.axis[1]}</span></div>}
    <div data-time-track className={styles.track} aria-hidden="true">
      <span className={mark.durationPercent === null ? styles.point : styles.duration}
        style={{ left: `${mark.startPercent}%`, ...(mark.durationPercent === null ? {} : { width: `${mark.durationPercent}%` }) }} />
      {mark.overlaps.map(part => <span key={part.startPercent} data-schedule-overlap className={styles.overlap}
        style={{ left: `${part.startPercent}%`, width: `${part.widthPercent}%` }} />)}
    </div>
  </div>;
}

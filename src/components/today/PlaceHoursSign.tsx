import type { DaypartPick } from "@/lib/loaders/daypartPicks";
import type { TodayPlaceAvailability } from "./TodayPlacePreview";
import styles from "./TodayPlacePreview.module.css";

/** A visual reading of the supplied hours fact. Hands only appear for a
 * confirmed, explicitly named opening or closing time. They never show now. */
export default function PlaceHoursSign({ fact, confidence, availability }: {
  fact: string; confidence: DaypartPick["confidence"]; availability: TodayPlaceAvailability;
}) {
  const time = confidence === "confirmed" && fact.match(/^(Open until|Closing soon\s*·|Opens soon\s*·|Opens at)\s*(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)\.?$/i);
  const allDay = confidence === "confirmed" && /^Open 24 hours\.?$/i.test(fact);
  const open = confidence === "confirmed" && /^Open now\.?$/i.test(fact);
  const timed = time || null;
  const hours = timed ? Number(timed[2]) : 0;
  const minutes = timed ? Number(timed[3] ?? 0) : 0;
  const label = timed ? (/^opens/i.test(timed[1]) ? "Opens" : "Closes") : "Hours";
  const status = allDay ? "24 hours" : open ? "Open now" : "Check hours";
  return <div className={styles.sign} aria-hidden="true" data-place-hours-sign={timed ? "clock" : "status"} data-hours-confidence={confidence}>
    <div className={styles.signFace}>
      <span className={styles.signLabel}>{label}</span>
      {timed ? <div className={styles.dialGroup}>
        <svg className={styles.clock} viewBox="0 0 64 64" focusable="false">
          <circle cx="32" cy="32" r="28.75" fill="none" stroke="currentColor" strokeWidth="1.45" />
          {Array.from({ length: 12 }, (_, index) => <path key={index} d={index % 3 === 0 ? "M32 6v5" : "M32 6v2.6"} transform={`rotate(${index * 30} 32 32)`} stroke="currentColor" strokeWidth={index % 3 === 0 ? 2 : 1} />)}
          <path d="M32 33V18" transform={`rotate(${(hours % 12) * 30 + minutes / 2} 32 32)`} stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M32 33V12" transform={`rotate(${minutes * 6} 32 32)`} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="32" cy="32" r="2.3" fill="currentColor" />
        </svg>
        <span className={styles.clockRead}>{hours}{minutes ? `:${timed[3]}` : ""} <small>{timed[4]}</small></span>
      </div> : <span className={styles.signStatus}>{availability === "opening-soon" && confidence === "confirmed" ? "Opening soon" : status}</span>}
    </div>
  </div>;
}

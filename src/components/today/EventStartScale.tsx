import styles from "./TodayEventChoices.module.css";

function clockMinutes(clock: string | undefined): number | null {
  const match = clock?.trim().match(/^(1[0-2]|[1-9])(?::([0-5]\d))?\s*([ap])m$/i);
  return match ? ((Number(match[1]) % 12) + (match[3].toLowerCase() === "p" ? 12 : 0)) * 60 + Number(match[2] ?? 0) : null;
}

/** The plot repeats the lead's printed time in a 24-hour Frederick day.
 * A single dot is a start only. Draw a span only for a published later end. */
export default function EventStartScale({ start, end }: { start: string; end?: string }) {
  const from = clockMinutes(start);
  if (from === null) return null;
  const through = clockMinutes(end);
  const span = through !== null && through > from ? (through - from) / 14.4 : 0;
  return <div aria-hidden="true" className={styles.timeScale} data-event-start-scale>
    <div className={styles.scaleTrack}>
      {Array.from({ length: 25 }, (_, i) => <i key={i} data-major={i % 6 === 0 || undefined} />)}
      <span className={styles.scaleStart} style={{ left: `${from / 14.4}%`, width: `${span}%` }} />
    </div>
    <div className={styles.scaleLabels}><span>Midnight</span><span>Noon</span><span>Midnight</span></div>
  </div>;
}

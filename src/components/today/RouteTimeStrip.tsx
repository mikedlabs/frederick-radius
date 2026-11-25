import type { RouteTimePreview } from "@/lib/today/local-outing-guides";
import styles from "./RouteTimeStrip.module.css";

/** Dwell time and the shared transfer allowance are estimates, not turn-by-turn times. */
export default function RouteTimeStrip({ preview, compact = false }: { preview: RouteTimePreview; compact?: boolean }) {
  const parts = [
    { title: "Parking and walks", minutes: preview.allowanceMinutes, tone: "transfer" },
    ...preview.stops.map((stop, index) => ({
      ...stop,
      tone: index === preview.stops.length - 1 ? "creek" : index === 0 ? "visit" : "gallery",
    })),
  ];
  const total = parts.reduce((minutes, part) => minutes + part.minutes, 0);
  const description = `Suggested time, ${total} minutes total. ${parts.map(part => `${part.title}, ${part.minutes} minutes`).join(". ")}.`;
  return (
    <div className={styles.time} role="img" aria-label={description} data-compact={compact || undefined}>
      <div className={styles.strip} aria-hidden="true">
        {parts.map(part => (
          <span key={part.title} className={styles.segment} data-tone={part.tone} style={{ flexGrow: part.minutes }} />
        ))}
      </div>
      {!compact && (
        <ol className={styles.legend} aria-hidden="true">
          {parts.map(part => (
            <li key={part.title}>
              <span className={styles.key} data-tone={part.tone} />
              <span>{part.title}</span> <b>{part.minutes} min</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
